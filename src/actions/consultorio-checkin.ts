'use server'

import { z } from 'zod'
import { resolverConsultorio } from '@/features/consultorio/access/contexto'
import { createServiceClient } from '@/lib/supabase/server'
import { AR_OFFSET } from '@/lib/turnos/slots'
import { normalizarOs } from '@/lib/consultorio/osSuspendidas'
import { catalogoVigente, type ArancelOsRow } from '@/lib/catalogo/obras-sociales'
import { elegirArancelVigente, calcularHonorarioConsulta, type CategoriaArancel } from '@/lib/catalogo/honorario'
import { ordenExtraidaSchema, OCR_ORDEN_PROMPT_VERSION, type OrdenExtraida } from '@/lib/ai/ocr-orden'
import { mergeOcrEnOrden, ordenDesdeOcr } from '@/lib/ordenes/desde-ocr'
import {
  anularCobro,
  crearCobro,
  getCobroVivoDeTurno,
  reflejarPlusEnOrden,
  vincularOrden,
} from '@/features/cobros/services/cobrosService'
import { CONCEPTOS_COBRO, MEDIOS_COBRO, type ConceptoCobro, type EstadoCobro, type MedioCobro } from '@/features/cobros/types/cobros'
import { getConexionActiva } from '@/features/whatsapp/services/mpConexiones'
import { buildPreferenciaBodyCobro, crearPreferencia } from '@/lib/mercadopago/client'
import { ventanaAbierta } from '@/lib/consultorio/semaforo'
import { resolverSaliente } from '@/features/whatsapp/services/nodos'
import { sendWhatsAppText } from '@/lib/whatsapp/client'
import { addMensaje } from '@/features/whatsapp/services/conversaciones'
import { registrarEvento } from '@/features/whatsapp/services/bitacora'

/** Variantes 54…/549… de un teléfono AR (los formatos conviven: gotcha de últimos 10 dígitos). */
function variantesTelefono(tel: string): string[] {
  return tel.startsWith('549') ? [tel, `54${tel.slice(3)}`] : [tel, `549${tel.slice(2)}`]
}

// Check-in de recepción (Fase B): la secretaria (o el médico) marca la llegada
// del paciente, registra el cobro y la orden presentada. Molde de autorización
// de consultorio-recetas.ts: `medicoId` = consultorio operado, `userId` = quién
// firma; las tablas médico-only se tocan con service-role RECIÉN tras ese check.

/** Autoriza: médico operado (dueño o secretaria) + user que firma. null si no autorizado. */
async function ctxCheckin() {
  const r = await resolverConsultorio()
  if (!r || !r.ctx.medicoActivoId) return null
  return { supabase: r.supabase, medicoId: r.ctx.medicoActivoId as string, userId: r.ctx.userId as string }
}

const checkinSchema = z.object({
  tipo: z.enum(['turno', 'sobreturno']),
  id: z.string().uuid(),
  deshacer: z.boolean().default(false),
})

/**
 * Marca (o deshace) la llegada del paciente. User client: la RLS delegada de
 * wa_turnos/wa_sobreturnos ya cubre a la secretaria. No toca `estado` — la
 * llegada es una columna aparte y la máquina de estados queda intacta.
 */
export async function marcarCheckin(input: z.infer<typeof checkinSchema>) {
  const c = await ctxCheckin()
  if (!c) return { error: 'No autenticado' }
  const parsed = checkinSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data

  const tabla = d.tipo === 'turno' ? 'wa_turnos' : 'wa_sobreturnos'
  const estadosVivos = d.tipo === 'turno' ? ['reservado', 'confirmado'] : ['pendiente']

  let query = c.supabase
    .from(tabla)
    .update(
      d.deshacer
        ? { checkin_at: null, checkin_por: null, updated_at: new Date().toISOString() }
        : { checkin_at: new Date().toISOString(), checkin_por: c.userId, updated_at: new Date().toISOString() },
    )
    .eq('medico_id', c.medicoId)
    .eq('id', d.id)
    .in('estado', estadosVivos)
  // Marcar exige que NO haya llegada previa (preserva la hora real de llegada);
  // deshacer exige que la haya.
  query = d.deshacer ? query.not('checkin_at', 'is', null) : query.is('checkin_at', null)

  const { data, error } = await query.select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) {
    return { error: d.deshacer ? 'Esa llegada ya no está marcada' : 'Ese turno ya no admite marcar la llegada (refrescá la agenda)' }
  }
  return { ok: true as const }
}

// ── Sala de espera ───────────────────────────────────────────────────────────

export interface EstadoCheckinItem {
  tipo: 'turno' | 'sobreturno'
  id: string
  checkinAt: string
  paciente: string
  dni: string | null
  obraSocial: string | null
  telefono: string | null
  /** Paciente particular (paga la consulta entera, no un plus). */
  esParticular: boolean
  /** Solo turnos (ordenes.turno_id no aplica a sobreturnos). */
  orden: { id: string; estado: string; sinFoto: boolean } | null
  cobro: { id: string; concepto: ConceptoCobro; monto: number; medio: MedioCobro; estado: EstadoCobro } | null
  /** Ventana de 24h de WhatsApp abierta ⇒ se lo puede llamar con texto libre. */
  puedeLlamar: boolean
}

/**
 * Los pacientes EN SALA del día, con el estado de su orden y su cobro. Las
 * llegadas se leen con el user client (RLS delegada); `ordenes`/`cobros` son
 * médico-only y se leen con service-role RECIÉN tras la autorización, expuestas
 * al MÍNIMO (existencia/estado/monto del día — decisión del dueño).
 */
export async function getEstadoCheckins(fecha: string): Promise<{ items: EstadoCheckinItem[] } | { error: string }> {
  const c = await ctxCheckin()
  if (!c) return { error: 'No autenticado' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: 'Fecha inválida' }

  const desdeIso = new Date(`${fecha}T00:00:00${AR_OFFSET}`).toISOString()
  const hastaIso = new Date(new Date(desdeIso).getTime() + 86_400_000).toISOString()
  const [turnosRes, sobresRes] = await Promise.all([
    c.supabase
      .from('wa_turnos')
      .select('id, checkin_at, paciente_nombre, paciente_apellido, paciente_dni, paciente_obra_social, paciente_telefono')
      .eq('medico_id', c.medicoId)
      .gte('starts_at', desdeIso)
      .lt('starts_at', hastaIso)
      .not('checkin_at', 'is', null)
      .not('estado', 'in', '(cancelado,ausente)'),
    c.supabase
      .from('wa_sobreturnos')
      .select('id, checkin_at, paciente_nombre, paciente_apellido, paciente_dni, paciente_obra_social, paciente_telefono, cobro')
      .eq('medico_id', c.medicoId)
      .eq('fecha', fecha)
      .not('checkin_at', 'is', null)
      .neq('estado', 'cancelado'),
  ])
  type TurnoLite = {
    id: string
    checkin_at: string
    paciente_nombre: string | null
    paciente_apellido: string | null
    paciente_dni: string | null
    paciente_obra_social: string | null
    paciente_telefono: string | null
  }
  type SobreLite = TurnoLite & { cobro: 'particular' | 'sin_cargo' }
  const turnos = (turnosRes.data as TurnoLite[] | null) ?? []
  const sobres = (sobresRes.data as SobreLite[] | null) ?? []

  const db = createServiceClient()
  const turnoIds = turnos.map((t) => t.id)
  const sobreIds = sobres.map((s) => s.id)
  const [ordenesRes, cobrosTurnoRes, cobrosSobreRes] = await Promise.all([
    turnoIds.length
      ? db.from('ordenes').select('id, estado, imagen_comprobante, turno_id').eq('medico_id', c.medicoId).in('turno_id', turnoIds)
      : Promise.resolve({ data: [] }),
    turnoIds.length
      ? db
          .from('cobros')
          .select('id, concepto, monto, medio, estado, turno_id')
          .eq('medico_id', c.medicoId)
          .in('estado', ['pendiente', 'cobrado'])
          .in('turno_id', turnoIds)
      : Promise.resolve({ data: [] }),
    sobreIds.length
      ? db
          .from('cobros')
          .select('id, concepto, monto, medio, estado, sobreturno_id')
          .eq('medico_id', c.medicoId)
          .in('estado', ['pendiente', 'cobrado'])
          .in('sobreturno_id', sobreIds)
      : Promise.resolve({ data: [] }),
  ])
  // Ventana de 24h por teléfono (para habilitar el "Llamar"): una sola query de
  // conversaciones matcheando las variantes 54…/549… de todos los llegados.
  const telefonos = [...turnos, ...sobres].map((r) => r.paciente_telefono).filter((t): t is string => Boolean(t))
  const variantes = [...new Set(telefonos.flatMap(variantesTelefono))]
  const ventanaPorTel = new Map<string, string | null>()
  if (variantes.length) {
    const { data: convRows } = await db
      .from('wa_conversaciones')
      .select('last_paciente_at, wa_contactos!inner(telefono)')
      .eq('medico_id', c.medicoId)
      .in('wa_contactos.telefono', variantes)
    for (const row of (convRows ?? []) as unknown as { last_paciente_at: string | null; wa_contactos: { telefono: string } }[]) {
      const clave = row.wa_contactos.telefono.slice(-10)
      const previa = ventanaPorTel.get(clave)
      if (!previa || (row.last_paciente_at && row.last_paciente_at > previa)) {
        ventanaPorTel.set(clave, row.last_paciente_at)
      }
    }
  }
  const puedeLlamarTel = (tel: string | null) =>
    Boolean(tel) && ventanaAbierta(ventanaPorTel.get((tel as string).slice(-10)) ?? null, Date.now())

  type OrdenLite = { id: string; estado: string; imagen_comprobante: string | null; turno_id: string }
  type CobroLite = {
    id: string
    concepto: ConceptoCobro
    monto: number
    medio: MedioCobro
    estado: EstadoCobro
    turno_id?: string | null
    sobreturno_id?: string | null
  }
  const ordenPorTurno = new Map(((ordenesRes.data as OrdenLite[] | null) ?? []).map((o) => [o.turno_id, o]))
  const cobroPorTurno = new Map(((cobrosTurnoRes.data as CobroLite[] | null) ?? []).map((x) => [x.turno_id, x]))
  const cobroPorSobre = new Map(((cobrosSobreRes.data as CobroLite[] | null) ?? []).map((x) => [x.sobreturno_id, x]))

  const nombreDe = (r: TurnoLite) =>
    [r.paciente_apellido, r.paciente_nombre].filter(Boolean).join(', ') || r.paciente_telefono || '(sin datos)'
  const cobroLite = (x: CobroLite | undefined) =>
    x ? { id: x.id, concepto: x.concepto, monto: Number(x.monto), medio: x.medio, estado: x.estado } : null

  const items: EstadoCheckinItem[] = [
    ...turnos.map((t): EstadoCheckinItem => {
      const o = ordenPorTurno.get(t.id)
      return {
        tipo: 'turno',
        id: t.id,
        checkinAt: t.checkin_at,
        paciente: nombreDe(t),
        dni: t.paciente_dni,
        obraSocial: t.paciente_obra_social,
        telefono: t.paciente_telefono,
        esParticular: normalizarOs(t.paciente_obra_social ?? '') === 'particular',
        orden: o ? { id: o.id, estado: o.estado, sinFoto: !o.imagen_comprobante } : null,
        cobro: cobroLite(cobroPorTurno.get(t.id)),
        puedeLlamar: puedeLlamarTel(t.paciente_telefono),
      }
    }),
    ...sobres.map((s): EstadoCheckinItem => ({
      tipo: 'sobreturno',
      id: s.id,
      checkinAt: s.checkin_at,
      paciente: nombreDe(s),
      dni: s.paciente_dni,
      obraSocial: s.paciente_obra_social,
      telefono: s.paciente_telefono,
      esParticular: s.cobro === 'particular' || normalizarOs(s.paciente_obra_social ?? '') === 'particular',
      orden: null,
      cobro: cobroLite(cobroPorSobre.get(s.id)),
      puedeLlamar: puedeLlamarTel(s.paciente_telefono),
    })),
  ].sort((a, b) => a.checkinAt.localeCompare(b.checkinAt))

  return { items }
}

// ── Cobro en recepción ───────────────────────────────────────────────────────

const cobroCheckinSchema = z.object({
  tipo: z.enum(['turno', 'sobreturno']),
  id: z.string().uuid(),
  concepto: z.enum(CONCEPTOS_COBRO),
  monto: z.coerce.number().positive('El monto debe ser mayor a 0'),
  medio: z.enum(MEDIOS_COBRO),
})

/**
 * Registra el cobro del check-in. Medios en mano ⇒ 'cobrado' ya; MercadoPago ⇒
 * cobro 'pendiente' + link (el paciente paga acá o con el bot en Fase C, el
 * webhook ?cobro= acredita). Doble refuerzo: authz + el turno debe ser del
 * médico operado (0 filas → error). El índice único parcial impide duplicar.
 */
export async function registrarCobroCheckin(
  input: z.infer<typeof cobroCheckinSchema>,
): Promise<{ ok: true; cobroId: string; link?: string } | { error: string }> {
  const c = await ctxCheckin()
  if (!c) return { error: 'No autenticado' }
  const parsed = cobroCheckinSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data

  // El turno/sobreturno debe pertenecer al consultorio operado (RLS delegada).
  const tabla = d.tipo === 'turno' ? 'wa_turnos' : 'wa_sobreturnos'
  const { data: fila } = await c.supabase
    .from(tabla)
    .select('id, paciente_nombre, paciente_apellido, paciente_dni')
    .eq('medico_id', c.medicoId)
    .eq('id', d.id)
    .maybeSingle()
  if (!fila) return { error: 'Ese turno no corresponde a este consultorio' }
  const pacienteNombre =
    [fila.paciente_apellido, fila.paciente_nombre].filter(Boolean).join(', ') || null

  const db = createServiceClient()
  const base = {
    medicoId: c.medicoId,
    concepto: d.concepto,
    monto: d.monto,
    turnoId: d.tipo === 'turno' ? d.id : null,
    sobreturnoId: d.tipo === 'sobreturno' ? d.id : null,
    pacienteNombre,
    pacienteDni: (fila.paciente_dni as string | null) ?? null,
    registradoPor: c.userId,
  }

  // Orden YA registrada del turno (orden primero, cobro después): el cobro
  // nuevo se ancla a esa orden para que no quede suelto para siempre.
  const ordenDelTurno =
    d.tipo === 'turno'
      ? await db
          .from('ordenes')
          .select('id')
          .eq('medico_id', c.medicoId)
          .eq('turno_id', d.id)
          .limit(1)
          .maybeSingle()
          .then((r) => (r.data as { id: string } | null) ?? null)
      : null

  if (d.medio !== 'mercadopago') {
    const cobro = await crearCobro(db, { ...base, medio: d.medio, estado: 'cobrado', ordenId: ordenDelTurno?.id ?? null })
    if (!cobro) return { error: 'Ya hay un cobro registrado para este turno (refrescá la sala).' }
    await reflejarPlusEnOrden(db, c.medicoId, { orden_id: ordenDelTurno?.id ?? null, concepto: d.concepto, monto: d.monto })
    return { ok: true, cobroId: cobro.id }
  }

  const baseUrl = process.env.PUBLIC_BASE_URL
  if (!baseUrl) return { error: 'Falta configurar PUBLIC_BASE_URL' }
  const conexion = await getConexionActiva(db, c.medicoId)
  if (!conexion) return { error: 'El médico no tiene MercadoPago conectado (Configuración).' }

  const cobro = await crearCobro(db, { ...base, medio: 'mercadopago', estado: 'pendiente', ordenId: ordenDelTurno?.id ?? null })
  if (!cobro) return { error: 'Ya hay un cobro registrado para este turno (refrescá la sala).' }

  const body = buildPreferenciaBodyCobro(
    {
      cobroId: cobro.id,
      titulo: d.concepto === 'consulta_particular' ? 'Consulta particular' : 'Plus de consulta',
      monto: d.monto,
      notificationUrl: `${baseUrl}/api/mercadopago/webhook?cobro=${cobro.id}`,
    },
    new Date(),
  )
  const pref = await crearPreferencia(conexion.accessToken, body)
  if (!pref) {
    await anularCobro(db, c.medicoId, cobro.id)
    return { error: 'MercadoPago no pudo generar el link. Probá de nuevo.' }
  }
  await db
    .from('cobros')
    .update({ mp_preference_id: pref.id, updated_at: new Date().toISOString() })
    .eq('id', cobro.id)
    .eq('medico_id', c.medicoId)
  return { ok: true, cobroId: cobro.id, link: pref.initPoint }
}

// ── Orden desde el check-in ──────────────────────────────────────────────────

const ordenCheckinSchema = z
  .object({
    tipo: z.enum(['turno', 'sobreturno']),
    id: z.string().uuid(),
    fechaAtencion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    // Carga mínima tipeada (mostrador desktop): OS + N° de orden/token.
    minima: z
      .object({
        obraSocial: z.string().trim().min(2, 'Indicá la obra social'),
        nroComprobante: z.string().trim().optional(),
        tokenOsep: z.string().trim().optional(),
      })
      .optional(),
    // O carga completa por foto (OCR).
    ocr: ordenExtraidaSchema.optional(),
    imagenDataUrl: z.string().optional(),
  })
  .refine((v) => Boolean(v.minima) !== Boolean(v.ocr), { message: 'Cargá los datos mínimos O la foto' })

/** Resuelve codigo_os + honorario del médico con el catálogo vigente (service). */
async function resolverOsYHonorario(
  db: ReturnType<typeof createServiceClient>,
  medicoId: string,
  obraSocial: string,
  fechaAtencion: string,
): Promise<{ codigoOs: number | null; honorario: number }> {
  const { data: rows } = await db
    .from('aranceles_os')
    .select(
      'codigo_os, nombre_os, activa, vigencia, valor_consulta_medica, valor_especialista, valor_consulta_oftalmologica, valor_recertificado, recargo_interior_pct',
    )
  const todas = (rows ?? []) as (ArancelOsRow & {
    valor_consulta_medica: number | null
    valor_especialista: number | null
    valor_consulta_oftalmologica: number | null
    valor_recertificado: number | null
    recargo_interior_pct: number | null
  })[]
  const item = catalogoVigente(todas).find((o) => normalizarOs(o.nombre_os) === normalizarOs(obraSocial))
  if (!item) return { codigoOs: null, honorario: 0 }

  const { data: perfil } = await db
    .from('perfiles')
    .select('categoria_arancel, atiende_interior')
    .eq('id', medicoId)
    .maybeSingle()
  const vigente = elegirArancelVigente(
    todas.filter((r) => r.codigo_os === item.codigo_os),
    fechaAtencion,
  )
  if (!vigente) return { codigoOs: item.codigo_os, honorario: 0 }
  const num = (v: unknown): number | null => (v == null ? null : Number(v))
  const r = calcularHonorarioConsulta({
    arancel: {
      valor_consulta_medica: num(vigente.valor_consulta_medica),
      valor_especialista: num(vigente.valor_especialista),
      valor_consulta_oftalmologica: num(vigente.valor_consulta_oftalmologica),
      valor_recertificado: num(vigente.valor_recertificado),
      recargo_interior_pct: num(vigente.recargo_interior_pct),
    },
    categoria: ((perfil?.categoria_arancel as CategoriaArancel | null) ?? null),
    atiendeInterior: perfil?.atiende_interior === true,
  })
  return { codigoOs: item.codigo_os, honorario: r?.honorario ?? 0 }
}

/**
 * Crea la orden BORRADOR del médico desde el mostrador (secretaria o médico):
 * carga mínima tipeada (sin escáner — la foto se completa después en lote) o
 * foto completa con OCR. La foto sube con service a la carpeta DEL MÉDICO
 * (client-side iría a la de la secretaria y el médico no la vería jamás).
 */
export async function crearOrdenCheckin(
  input: z.infer<typeof ordenCheckinSchema>,
): Promise<{ ok: true; ordenId: string } | { error: string }> {
  const c = await ctxCheckin()
  if (!c) return { error: 'No autenticado' }
  const parsed = ordenCheckinSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data

  const tabla = d.tipo === 'turno' ? 'wa_turnos' : 'wa_sobreturnos'
  const { data: fila } = await c.supabase
    .from(tabla)
    .select('id, paciente_nombre, paciente_apellido, paciente_dni, paciente_obra_social')
    .eq('medico_id', c.medicoId)
    .eq('id', d.id)
    .maybeSingle()
  if (!fila) return { error: 'Ese turno no corresponde a este consultorio' }

  const db = createServiceClient()

  // Un turno = una orden (los sobreturnos no tienen FK de orden — sin candado).
  if (d.tipo === 'turno') {
    const { data: ya } = await db
      .from('ordenes')
      .select('id')
      .eq('medico_id', c.medicoId)
      .eq('turno_id', d.id)
      .limit(1)
    if (ya && ya.length > 0) return { error: 'Ese turno ya tiene una orden registrada' }
  }

  const ocr = d.ocr as OrdenExtraida | undefined
  const nombreTurno = [fila.paciente_apellido, fila.paciente_nombre].filter(Boolean).join(', ')
  const obraSocial = (ocr?.obra_social?.trim() || d.minima?.obraSocial || (fila.paciente_obra_social as string | null) || '').trim()
  if (!obraSocial) return { error: 'Indicá la obra social de la orden' }
  const { codigoOs, honorario } = await resolverOsYHonorario(db, c.medicoId, obraSocial, d.fechaAtencion)

  // Foto (si vino): a la carpeta del MÉDICO, con service (bypassa storage RLS).
  let imagenPath: string | null = null
  if (d.imagenDataUrl?.startsWith('data:image/')) {
    try {
      const base64 = d.imagenDataUrl.slice(d.imagenDataUrl.indexOf(',') + 1)
      const path = `${c.medicoId}/${crypto.randomUUID()}.jpg`
      const { error: upErr } = await db.storage
        .from('comprobantes')
        .upload(path, Buffer.from(base64, 'base64'), { contentType: 'image/jpeg', upsert: false })
      if (!upErr) imagenPath = path
      else console.error('[checkin] upload comprobante:', upErr.message)
    } catch (e) {
      console.error('[checkin] upload comprobante:', e)
    }
  }

  const insertData: Record<string, unknown> = {
    medico_id: c.medicoId,
    tipo: 'obra_social',
    estado: 'borrador',
    nivel: 1,
    nombre_paciente: (ocr?.paciente?.trim() || nombreTurno || '(sin datos)').slice(0, 200),
    fecha_atencion: d.fechaAtencion,
    obra_social: obraSocial,
    codigo_os: codigoOs,
    nro_documento: (ocr?.nro_documento?.trim() || (fila.paciente_dni as string | null)) ?? null,
    honorario_calculado: honorario,
    monto_particular: 0,
    monto_plus: 0,
    cantidad: 1,
    agente_facturador: 'circulo_medico',
    turno_id: d.tipo === 'turno' ? d.id : null,
    registrada_por: c.userId,
    imagen_comprobante: imagenPath,
    ...(ocr
      ? { ...ordenDesdeOcr(ocr), datos_ocr: { version: OCR_ORDEN_PROMPT_VERSION, datos: ocr } }
      : {
          nro_comprobante: d.minima?.nroComprobante?.trim() || null,
          token_osep: d.minima?.tokenOsep?.trim() || null,
        }),
  }

  const { data: creada, error } = await db.from('ordenes').insert(insertData).select('id').single()
  if (error) return { error: error.message }

  // Si la secretaria ya había cobrado el plus del turno, el cobro queda anclado a la orden.
  const cobroSuelto = await getCobroVivoDeTurno(
    db,
    c.medicoId,
    d.tipo === 'turno' ? { turnoId: d.id } : { sobreturnoId: d.id },
  )
  if (cobroSuelto && !cobroSuelto.orden_id) {
    await vincularOrden(db, c.medicoId, cobroSuelto.id, creada.id)
    // El plus de la orden refleja el cobro real (Reportes lee monto_plus).
    if (cobroSuelto.concepto === 'plus' && cobroSuelto.estado === 'cobrado') {
      await db
        .from('ordenes')
        .update({ monto_plus: cobroSuelto.monto, updated_at: new Date().toISOString() })
        .eq('id', creada.id)
        .eq('medico_id', c.medicoId)
    }
  }

  return { ok: true, ordenId: creada.id }
}

const llamarSchema = z.object({
  tipo: z.enum(['turno', 'sobreturno']),
  id: z.string().uuid(),
})

/**
 * "Pase al consultorio": texto libre por WhatsApp al paciente EN SALA. Solo
 * funciona con la ventana de 24h abierta (el paciente le escribió al bot al
 * llegar — p.ej. "llegué" para pagar); si está cerrada, Meta lo rechazaría y
 * se corta antes con un error accionable. Patrón responderComoHumano.
 */
export async function llamarPaciente(
  input: z.infer<typeof llamarSchema>,
): Promise<{ ok: true } | { error: string }> {
  const c = await ctxCheckin()
  if (!c) return { error: 'No autenticado' }
  const parsed = llamarSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data

  const tabla = d.tipo === 'turno' ? 'wa_turnos' : 'wa_sobreturnos'
  const { data: fila } = await c.supabase
    .from(tabla)
    .select('id, paciente_telefono')
    .eq('medico_id', c.medicoId)
    .eq('id', d.id)
    .maybeSingle()
  if (!fila) return { error: 'Ese turno no corresponde a este consultorio' }
  const tel = (fila.paciente_telefono as string | null) ?? ''
  if (!tel) return { error: 'El turno no tiene teléfono de WhatsApp' }

  const db = createServiceClient()
  const { data: convRows } = await db
    .from('wa_conversaciones')
    .select('id, last_paciente_at, wa_contactos!inner(telefono)')
    .eq('medico_id', c.medicoId)
    .in('wa_contactos.telefono', variantesTelefono(tel))
    .order('last_paciente_at', { ascending: false })
    .limit(1)
  const conv = ((convRows ?? []) as unknown as { id: string; last_paciente_at: string | null }[])[0]
  if (!conv || !ventanaAbierta(conv.last_paciente_at, Date.now())) {
    return {
      error:
        'La ventana de WhatsApp está cerrada: pedile al paciente que le escriba "llegué" al asistente y probá de nuevo.',
    }
  }

  const canal = await resolverSaliente(db, c.medicoId)
  if (!canal) return { error: 'WhatsApp no está conectado' }
  const texto = '👨‍⚕️ Es su turno: por favor pase al consultorio.'
  const enviado = await sendWhatsAppText({
    phoneNumberId: canal.phoneNumberId,
    accessToken: canal.accessToken,
    to: tel,
    text: texto,
  })
  if (!enviado) {
    return { error: 'Meta rechazó el envío. Pedile al paciente que le escriba "llegué" al asistente y probá de nuevo.' }
  }
  await addMensaje(db, {
    medicoId: c.medicoId,
    conversacionId: conv.id,
    direccion: 'saliente',
    origen: 'humano',
    contenido: texto,
  })
  await registrarEvento(db, {
    medicoId: c.medicoId,
    origen: 'panel',
    nivel: 'info',
    evento: 'llamado_paciente',
    detalle: { tipo: d.tipo, id: d.id, actor: c.userId },
    conversacionId: conv.id,
  })
  return { ok: true }
}

const fotoOrdenSchema = z.object({
  ordenId: z.string().uuid(),
  imagenDataUrl: z.string().startsWith('data:image/'),
  ocr: ordenExtraidaSchema.optional(),
})

/**
 * Completa la foto de una orden "sin foto" (lote del mostrador). El OCR solo
 * rellena campos VACÍOS (mergeOcrEnOrden): lo tipeado en el check-in no se pisa.
 * La usan el médico (sección "Órdenes sin foto") y la secretaria (sala de espera).
 */
export async function completarFotoOrden(
  input: z.infer<typeof fotoOrdenSchema>,
): Promise<{ ok: true } | { error: string }> {
  const c = await ctxCheckin()
  if (!c) return { error: 'No autenticado' }
  const parsed = fotoOrdenSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data

  const db = createServiceClient()
  const { data: orden } = await db
    .from('ordenes')
    .select('*')
    .eq('id', d.ordenId)
    .eq('medico_id', c.medicoId)
    .maybeSingle()
  if (!orden) return { error: 'Orden no encontrada' }
  if (orden.estado !== 'borrador') return { error: 'Solo se completan órdenes en borrador' }

  let imagenPath: string
  try {
    const base64 = d.imagenDataUrl.slice(d.imagenDataUrl.indexOf(',') + 1)
    imagenPath = `${c.medicoId}/${crypto.randomUUID()}.jpg`
    const { error: upErr } = await db.storage
      .from('comprobantes')
      .upload(imagenPath, Buffer.from(base64, 'base64'), { contentType: 'image/jpeg', upsert: false })
    if (upErr) return { error: `No se pudo subir la foto: ${upErr.message}` }
  } catch {
    return { error: 'No se pudo subir la foto' }
  }

  const update: Record<string, unknown> = { imagen_comprobante: imagenPath, updated_at: new Date().toISOString() }
  if (d.ocr) {
    Object.assign(update, mergeOcrEnOrden(orden as Record<string, unknown>, ordenDesdeOcr(d.ocr as OrdenExtraida)))
    if (!orden.datos_ocr) update.datos_ocr = { version: OCR_ORDEN_PROMPT_VERSION, datos: d.ocr }
  }
  // Si la carga mínima no pudo valorizar (OS libre sin match), reintenta con la OS final.
  if (Number(orden.honorario_calculado) === 0) {
    const os = (update.obra_social as string | undefined) ?? (orden.obra_social as string | null) ?? ''
    if (os) {
      const r = await resolverOsYHonorario(db, c.medicoId, os, orden.fecha_atencion as string)
      if (r.honorario > 0) update.honorario_calculado = r.honorario
      if (r.codigoOs != null && orden.codigo_os == null) update.codigo_os = r.codigoOs
    }
  }

  const { error } = await db.from('ordenes').update(update).eq('id', d.ordenId).eq('medico_id', c.medicoId)
  if (error) return { error: error.message }
  return { ok: true }
}

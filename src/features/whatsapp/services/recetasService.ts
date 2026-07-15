import type { SupabaseClient } from '@supabase/supabase-js'
import type { RecetaExtraida } from '@/lib/ai/ocr-receta'
import { normalizarDni, nombresCoinciden } from '@/lib/recetas/normalizar'

/** Vigencia de la receta en días: pasado el plazo se marca 'vencida' (lazy, al buscar).
 *  45 días, alineado con la validez de las órdenes de consulta/práctica. */
const RECETA_VIGENCIA_DIAS = 45

export interface RecetaRow {
  id: string
  medico_id: string
  contacto_id: string | null
  paciente_nombre: string
  paciente_dni: string
  paciente_telefono: string | null
  pdf_path: string
  nro_receta: string | null
  monto: number | null
  estado: string
  mp_preference_id: string | null
  mp_payment_id: string | null
  datos_ocr: Record<string, unknown>
  created_at: string
  forma_pago: string | null
  nro_orden_consulta: string | null
  liberada_por: string | null
  liberada_at: string | null
}

const COLS =
  'id, medico_id, contacto_id, paciente_nombre, paciente_dni, paciente_telefono, pdf_path, nro_receta, monto, estado, mp_preference_id, mp_payment_id, datos_ocr, created_at, forma_pago, nro_orden_consulta, liberada_por, liberada_at'

export async function crearRecetaDesdeOcr(
  db: SupabaseClient,
  args: { medicoId: string; ocr: RecetaExtraida; pdfPath: string; monto: number; estado: 'pendiente_pago' | 'pendiente_datos' },
): Promise<RecetaRow | 'duplicada' | null> {
  const { data, error } = await db
    .from('recetas')
    .insert({
      medico_id: args.medicoId,
      paciente_nombre: args.ocr.paciente_nombre,
      paciente_dni: normalizarDni(args.ocr.paciente_dni),
      pdf_path: args.pdfPath,
      nro_receta: args.ocr.nro_receta || null,
      monto: args.monto,
      estado: args.estado,
      datos_ocr: args.ocr,
    })
    .select(COLS)
    .single()
  if (error) {
    if (error.code === '23505') return 'duplicada'
    console.error('[recetas] insert error:', error.message)
    return null
  }
  return data as RecetaRow
}

/**
 * Recetas `pendiente_pago` de un DNI (identidad exacta), marcando vencidas lazy.
 * Núcleo compartido: el bot lo usa confirmando además por nombre (anti-secuestro),
 * y el panel de la secretaria lo usa directo (la secretaria confirma visualmente al
 * cotejar la persona del chat). Filtra por medico_id → nunca cruza consultorios.
 */
export async function getPendientesPorDni(
  db: SupabaseClient,
  medicoId: string,
  dni: string,
): Promise<RecetaRow[]> {
  const dniNorm = normalizarDni(dni)
  if (dniNorm.length < 7) return []
  const { data } = await db
    .from('recetas')
    .select(COLS)
    .eq('medico_id', medicoId)
    .eq('estado', 'pendiente_pago')
    .eq('paciente_dni', dniNorm)
    .order('created_at', { ascending: true })
  const rows = (data as RecetaRow[] | null) ?? []

  const limite = Date.now() - RECETA_VIGENCIA_DIAS * 24 * 60 * 60 * 1000
  const vencidas = rows.filter((r) => new Date(r.created_at).getTime() < limite)
  if (vencidas.length) {
    await db
      .from('recetas')
      .update({ estado: 'vencida', updated_at: new Date().toISOString() })
      .eq('medico_id', medicoId)
      .in('id', vencidas.map((r) => r.id))
  }
  return rows.filter((r) => new Date(r.created_at).getTime() >= limite)
}

/** Busca recetas cobrables por identidad (DNI exacto + nombre tolerante). Marca vencidas lazy. */
export async function buscarPendientesPorIdentidad(
  db: SupabaseClient,
  medicoId: string,
  nombre: string,
  dni: string,
): Promise<RecetaRow[]> {
  const vigentes = await getPendientesPorDni(db, medicoId, dni)
  return vigentes.filter((r) => nombresCoinciden(r.paciente_nombre, nombre))
}

export async function listarPagadasSinEntregar(
  db: SupabaseClient,
  medicoId: string,
  telefonoNormalizado: string,
): Promise<RecetaRow[]> {
  const { data } = await db
    .from('recetas')
    .select(COLS)
    .eq('medico_id', medicoId)
    .eq('estado', 'pagada')
    .eq('paciente_telefono', telefonoNormalizado)
  return (data as RecetaRow[] | null) ?? []
}

/** Pendientes de pago que ya tienen link generado para este teléfono (candidatas a reconciliar). */
export async function listarPendientesConPreferencia(
  db: SupabaseClient,
  medicoId: string,
  telefonoNormalizado: string,
): Promise<RecetaRow[]> {
  const { data } = await db
    .from('recetas')
    .select(COLS)
    .eq('medico_id', medicoId)
    .eq('estado', 'pendiente_pago')
    .eq('paciente_telefono', telefonoNormalizado)
    .not('mp_preference_id', 'is', null)
  return (data as RecetaRow[] | null) ?? []
}

export async function getRecetaDelMedico(
  db: SupabaseClient,
  medicoId: string,
  recetaId: string,
): Promise<RecetaRow | null> {
  const { data } = await db.from('recetas').select(COLS).eq('medico_id', medicoId).eq('id', recetaId).maybeSingle()
  return (data as RecetaRow | null) ?? null
}

/** Distingue el CONFLICTO real (otro teléfono ya gestiona la receta) de un FALLO
 *  TÉCNICO: antes ambos volvían `false` y al paciente se le reportaba el conflicto,
 *  tapando el error de verdad. */
export type VinculoPago = { ok: true } | { ok: false; motivo: 'conflicto' | 'error' }

/**
 * Al generar el link: asocia preferencia + teléfono + contacto del paciente (§6.2:
 * se capturan al escribir). Condicional anti-TOCTOU: solo escribe si el teléfono
 * está libre o es el mismo — dos solicitantes simultáneos no pueden pisarse.
 */
export async function vincularPago(
  db: SupabaseClient,
  medicoId: string,
  recetaId: string,
  args: { mpPreferenceId: string; pacienteTelefono: string; contactoId: string | null },
): Promise<VinculoPago> {
  const patch = {
    mp_preference_id: args.mpPreferenceId,
    paciente_telefono: args.pacienteTelefono,
    contacto_id: args.contactoId,
    updated_at: new Date().toISOString(),
  }
  const update = () => db.from('recetas').update(patch).eq('medico_id', medicoId).eq('id', recetaId)

  // El condicional va en DOS pasos y NO con un `.or()`: PostgREST rompe al aplicar
  // `or=` sobre un UPDATE (42703 "column recetas.paciente_telefono does not exist")
  // y el link de pago no se generaba nunca. Cada paso sigue siendo atómico.
  // 1) Reclamarla si está libre — de dos solicitantes simultáneos, solo uno gana acá.
  const libre = await update().is('paciente_telefono', null).select('id')
  if (libre.error) {
    console.error('[wa] vincularPago (reclamar):', libre.error.message)
    return { ok: false, motivo: 'error' }
  }
  if ((libre.data?.length ?? 0) > 0) return { ok: true }

  // 2) Ya estaba tomada: solo sigue si es de ESTE teléfono (re-generar su link).
  const propia = await update().eq('paciente_telefono', args.pacienteTelefono).select('id')
  if (propia.error) {
    console.error('[wa] vincularPago (re-generar):', propia.error.message)
    return { ok: false, motivo: 'error' }
  }
  if ((propia.data?.length ?? 0) > 0) return { ok: true }

  // Ni libre ni suya: la gestiona otro número. El que pierde la carrera no recibe link.
  return { ok: false, motivo: 'conflicto' }
}

/** Condicional por estado: reduce la ventana de carrera entre webhooks concurrentes. */
export async function marcarPagada(
  db: SupabaseClient,
  medicoId: string,
  recetaId: string,
  paymentId: string,
): Promise<void> {
  await db
    .from('recetas')
    .update({ estado: 'pagada', mp_payment_id: paymentId, updated_at: new Date().toISOString() })
    .eq('medico_id', medicoId)
    .eq('id', recetaId)
    .eq('estado', 'pendiente_pago')
}

/**
 * Devolución/contracargo ANTES de la entrega: bloquea la re-entrega del PDF.
 * Si ya estaba entregada no se transiciona (el PDF ya salió; al médico se le avisa).
 */
export async function marcarDevuelta(db: SupabaseClient, medicoId: string, recetaId: string): Promise<void> {
  await db
    .from('recetas')
    .update({ estado: 'devuelta', updated_at: new Date().toISOString() })
    .eq('medico_id', medicoId)
    .eq('id', recetaId)
    .eq('estado', 'pagada')
}

/**
 * Reclamo atómico de la entrega: pagada → entregada SOLO si nadie la reclamó antes.
 * Evita el PDF duplicado cuando MP manda avisos simultáneos del mismo pago: la DB
 * arbitra y un único proceso gana (devuelve true); el resto recibe false y no envía.
 */
export async function reclamarEntrega(db: SupabaseClient, medicoId: string, recetaId: string): Promise<boolean> {
  const { data } = await db
    .from('recetas')
    .update({ estado: 'entregada', updated_at: new Date().toISOString() })
    .eq('medico_id', medicoId)
    .eq('id', recetaId)
    .eq('estado', 'pagada')
    .select('id')
  return ((data as { id: string }[] | null)?.length ?? 0) > 0
}

/** Compensación si el envío falla después de reclamar: vuelve a 'pagada' para reintentar. */
export async function revertirEntrega(db: SupabaseClient, medicoId: string, recetaId: string): Promise<void> {
  await db
    .from('recetas')
    .update({ estado: 'pagada', updated_at: new Date().toISOString() })
    .eq('medico_id', medicoId)
    .eq('id', recetaId)
    .eq('estado', 'entregada')
}

/** Resumen para el comando 'recetas' del médico (§6.8 visibilidad mínima). */
export async function resumenRecetas(db: SupabaseClient, medicoId: string): Promise<string> {
  const { data } = await db
    .from('recetas')
    .select('paciente_nombre, estado, monto, created_at, forma_pago')
    .eq('medico_id', medicoId)
    .order('created_at', { ascending: false })
    .limit(50)
  const rows =
    (data as { paciente_nombre: string; estado: string; monto: number | null; created_at: string; forma_pago: string | null }[] | null) ?? []
  if (!rows.length) return 'Todavía no hay recetas cargadas. Reenviame un PDF de receta para empezar.'

  const cuenta: Record<string, number> = {}
  for (const r of rows) cuenta[r.estado] = (cuenta[r.estado] ?? 0) + 1
  const etiqueta: Record<string, string> = {
    pendiente_pago: '⏳ esperando pago',
    pagada: '💰 pagadas (por entregar)',
    entregada: '✅ entregadas',
    pendiente_datos: '⚠️ con datos dudosos',
    vencida: '🗑 vencidas',
    devuelta: '↩️ devueltas (reembolso)',
  }
  const resumen = Object.entries(cuenta)
    .map(([estado, n]) => `${etiqueta[estado] ?? estado}: ${n}`)
    .join('\n')
  const ultimas = rows
    .slice(0, 5)
    .map(
      (r) =>
        `• ${r.paciente_nombre || '(sin nombre)'} — ${etiqueta[r.estado] ?? r.estado}${r.monto != null ? ` — $${Number(r.monto).toLocaleString('es-AR')}` : ''}${r.forma_pago === 'orden_consulta' ? ' · por orden de consulta' : ''}`,
    )
    .join('\n')
  return `📋 Tus recetas:\n${resumen}\n\nÚltimas:\n${ultimas}`
}

/**
 * Libera una receta por orden de consulta: registra la constancia y transiciona
 * pendiente_pago → pagada (condicional por estado, anti-doble). Devuelve la fila
 * lista para entregar, o null si no era liberable (no pendiente / ajena).
 */
export async function liberarPorOrdenConsulta(
  db: SupabaseClient,
  args: { medicoId: string; recetaId: string; nroOrden: string; liberadaPor: string },
): Promise<RecetaRow | null> {
  const { data } = await db
    .from('recetas')
    .update({
      estado: 'pagada',
      forma_pago: 'orden_consulta',
      nro_orden_consulta: args.nroOrden,
      liberada_por: args.liberadaPor,
      liberada_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('medico_id', args.medicoId)
    .eq('id', args.recetaId)
    .eq('estado', 'pendiente_pago')
    .select(COLS)
    .maybeSingle()
  return (data as RecetaRow | null) ?? null
}

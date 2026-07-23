'use server'

import { z } from 'zod'
import { normalizarOs } from '@/lib/consultorio/osSuspendidas'
import { normalizarWhatsappAr } from '@/lib/whatsapp/numeroAr'
import { resolverConsultorio, esDueño } from '@/features/consultorio/access/contexto'
import { createServiceClient } from '@/lib/supabase/server'
import { getConfig, type ConfigConsultorio } from '@/features/consultorio/services/panelService'

/** Config del consultorio = médico-only (spec §8). Solo el DUEÑO del consultorio
 *  (ni la secretaria ni un médico operando otro consultorio) puede cambiarla. */
async function ctxDueño() {
  const r = await resolverConsultorio()
  if (!r) return { error: 'No autenticado' as const }
  if (!esDueño(r.ctx)) return { error: 'Solo el médico puede cambiar la configuración' as const }
  return { supabase: r.supabase, medicoId: r.ctx.userId }
}

/** Config OPERATIVA: la puede tocar el médico dueño O la secretaria vinculada, sobre el
 *  consultorio que están operando (medicoActivoId, derivado server-side). Las actions que la
 *  usan escriben con service-role (RLS de la secretaria no cubre estas tablas). */
async function ctxOperativo() {
  const r = await resolverConsultorio()
  if (!r) return { error: 'No autenticado' as const }
  if (!r.ctx.medicoActivoId) return { error: 'No estás operando ningún consultorio' as const }
  return { medicoId: r.ctx.medicoActivoId as string, userId: r.ctx.userId, esDueño: esDueño(r.ctx) }
}

const horariosSchema = z.array(
  z.object({
    weekday: z.number().int().min(0).max(6),
    open_time: z.string().regex(/^\d{2}:\d{2}$/),
    close_time: z.string().regex(/^\d{2}:\d{2}$/),
  }),
)

/** Reemplaza el horario semanal completo.
 *  Estrategia: insert primero → delete por id de los viejos. Si el insert falla,
 *  el horario anterior queda intacto (sin ventana destructiva).
 *  Los turnos YA dados fuera del nuevo horario NO se tocan (spec §8.1). */
export async function guardarHorarios(bloques: z.infer<typeof horariosSchema>) {
  const c = await ctxOperativo()
  if ('error' in c) return c
  const { medicoId } = c
  const supabase = createServiceClient()
  const parsed = horariosSchema.safeParse(bloques)
  if (!parsed.success) return { error: 'Horarios inválidos' }
  for (const b of parsed.data) {
    if (b.close_time <= b.open_time) return { error: `Bloque inválido: ${b.open_time}–${b.close_time}` }
  }

  // Bloques solapados en el mismo día → la agenda mostraría huecos duplicados.
  const porDia = new Map<number, { open_time: string; close_time: string }[]>()
  for (const b of parsed.data) {
    const dia = porDia.get(b.weekday) ?? []
    for (const otro of dia) {
      if (b.open_time < otro.close_time && otro.open_time < b.close_time) {
        return { error: `Bloques solapados el mismo día (${b.open_time}–${b.close_time})` }
      }
    }
    dia.push(b)
    porDia.set(b.weekday, dia)
  }

  // Insertar primero y borrar después por id: si el insert falla, el horario viejo queda intacto.
  const { data: viejos, error: selError } = await supabase.from('wa_horarios').select('id').eq('medico_id', medicoId)
  if (selError) return { error: selError.message }
  if (parsed.data.length > 0) {
    const { error } = await supabase.from('wa_horarios').insert(parsed.data.map((b) => ({ medico_id: medicoId, ...b })))
    if (error) return { error: error.message }
  }
  const idsViejos = ((viejos as { id: string }[] | null) ?? []).map((v) => v.id)
  if (idsViejos.length > 0) {
    const { error: delError } = await supabase.from('wa_horarios').delete().eq('medico_id', medicoId).in('id', idsViejos)
    if (delError) return { error: delError.message }
  }
  return { ok: true as const }
}

/** Cambia la duración del único servicio "Consulta" (spec D12). Solo afecta turnos futuros. */
export async function guardarDuracionConsulta(servicioId: string, duracionMin: number) {
  const c = await ctxOperativo()
  if ('error' in c) return c
  const { medicoId } = c
  const supabase = createServiceClient()
  if (!Number.isInteger(duracionMin) || duracionMin < 5 || duracionMin > 120) {
    return { error: 'Duración inválida (entre 5 y 120 minutos)' }
  }
  const { error } = await supabase
    .from('wa_servicios')
    .update({ duracion_min: duracionMin, updated_at: new Date().toISOString() })
    .eq('medico_id', medicoId)
    .eq('id', servicioId)
  if (error) return { error: error.message }
  return { ok: true as const }
}

export async function agregarOsSuspendida(
  nombreOs: string,
  nota: string,
  motivo: 'suspendida' | 'no_atiende',
) {
  const c = await ctxOperativo()
  if ('error' in c) return c
  const { medicoId } = c
  const supabase = createServiceClient()
  if (motivo !== 'suspendida' && motivo !== 'no_atiende') return { error: 'Motivo inválido' }
  // Normalizada al guardar (review parte 1): el UNIQUE es sensible, el match no.
  const nombre = normalizarOs(nombreOs)
  if (!nombre || nombre === 'particular') return { error: 'Nombre de obra social inválido' }
  const { error } = await supabase
    .from('wa_os_suspendidas')
    .insert({ medico_id: medicoId, nombre_os: nombre, nota: nota.trim() || null, motivo })
  if (error) {
    if (error.code === '23505') return { error: 'Esa obra social ya está en tus listas' }
    return { error: error.message }
  }
  return { ok: true as const }
}

export async function quitarOsSuspendida(id: string) {
  const c = await ctxOperativo()
  if ('error' in c) return c
  const { medicoId } = c
  const supabase = createServiceClient()
  const { error } = await supabase.from('wa_os_suspendidas').delete().eq('medico_id', medicoId).eq('id', id)
  if (error) return { error: error.message }
  return { ok: true as const }
}

export async function agregarDiaSemanalParticular(diaSemana: number) {
  const c = await ctxOperativo()
  if ('error' in c) return c
  const { medicoId } = c
  const supabase = createServiceClient()
  if (!Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6) return { error: 'Día de la semana inválido' }
  const { error } = await supabase
    .from('wa_dias_particulares')
    .insert({ medico_id: medicoId, tipo: 'semanal', dia_semana: diaSemana })
  if (error) {
    if (error.code === '23505') return { error: 'Ese día ya está marcado como particular' }
    return { error: error.message }
  }
  return { ok: true as const }
}

export async function agregarFechaParticular(fecha: string) {
  const c = await ctxOperativo()
  if ('error' in c) return c
  const { medicoId } = c
  const supabase = createServiceClient()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: 'Fecha inválida' }
  const { error } = await supabase
    .from('wa_dias_particulares')
    .insert({ medico_id: medicoId, tipo: 'fecha', fecha })
  if (error) {
    if (error.code === '23505') return { error: 'Esa fecha ya está marcada como particular' }
    return { error: error.message }
  }
  return { ok: true as const }
}

export async function quitarDiaParticular(id: string) {
  const c = await ctxOperativo()
  if ('error' in c) return c
  const { medicoId } = c
  const supabase = createServiceClient()
  const { error } = await supabase.from('wa_dias_particulares').delete().eq('medico_id', medicoId).eq('id', id)
  if (error) return { error: error.message }
  return { ok: true as const }
}

/** Cambia el número con el que el bot reconoce al médico (cambió de celular / lo perdió).
 *  Médico-only y sobre SÍ MISMO (ctxDueño → su propio userId): la secretaria no lo toca, y
 *  no se puede editar el de otro consultorio.
 *
 *  Sin verificación por código a propósito: un dedazo se autodetecta en minutos (el médico
 *  cambia el número justo para escribirle al bot; si no matchea, le contesta "¿a qué médico
 *  le escribís?"), y lo único que sale a este número son avisos de MP sin datos de paciente.
 *  La confirmación del número canónico en la UI es la red contra el dedazo. */
export async function guardarNumeroWhatsapp(numeroWhatsapp: string) {
  const c = await ctxDueño()
  if ('error' in c) return c
  const { medicoId } = c
  // Canoniza a 54 + 10 dígitos, que es la forma con la que compara el ruteo. Revalidado
  // server-side aunque la UI ya normalizó: la action es la frontera de confianza.
  const numero = normalizarWhatsappAr(numeroWhatsapp)
  if (!numero) return { error: 'Número de WhatsApp inválido (ej: 383 4222049)' }
  const service = createServiceClient()

  // Mismo orden que resolverSaliente: la asignación al nodo primero, wa_canales como fallback
  // legacy. Se escribe en la ficha que el médico realmente tenga.
  const { data: asig, error: e1 } = await service
    .from('wa_asignaciones')
    .update({ numero_personal: numero, updated_at: new Date().toISOString() })
    .eq('medico_id', medicoId)
    .eq('activo', true)
    .select('id')
  if (e1) {
    // idx_wa_asignaciones_numero_por_nodo: otro médico del mismo nodo ya usa ese número.
    if (e1.code === '23505') return { error: 'Ese número ya lo usa otro médico del mismo asistente.' }
    return { error: e1.message }
  }
  if (asig && asig.length > 0) return { ok: true as const }

  const { data: canal, error: e2 } = await service
    .from('wa_canales')
    .update({ numero_personal: numero, updated_at: new Date().toISOString() })
    .eq('medico_id', medicoId)
    .eq('estado', 'conectado')
    .select('id')
  if (e2) return { error: e2.message }
  if (!canal || canal.length === 0) return { error: 'Tu asistente todavía no está activo. Escribinos y lo activamos.' }
  return { ok: true as const }
}

/** Corta la conexión con MercadoPago: el médico deja de poder cobrar recetas hasta reconectar.
 *  No revoca el permiso del lado de MP (eso lo hace él desde su cuenta); acá borramos el token. */
export async function desconectarMercadoPago() {
  const c = await ctxDueño()
  if ('error' in c) return c
  const { supabase, medicoId } = c
  const { error } = await supabase.from('mp_conexiones').delete().eq('medico_id', medicoId)
  if (error) return { error: error.message }
  return { ok: true as const }
}

const agenteSchema = z.object({
  nombre_medico: z.string().trim(),
  especialidad: z.string().trim(),
  tono: z.string().trim(),
  saludo: z.string().trim(),
  faqs: z.array(z.object({ pregunta: z.string().min(1), respuesta: z.string().min(1) })).max(20),
})

export async function guardarAsistente(input: z.infer<typeof agenteSchema>) {
  const c = await ctxDueño()
  if ('error' in c) return c
  const { supabase, medicoId } = c
  const parsed = agenteSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data
  const { error } = await supabase
    .from('wa_config_agente')
    .upsert(
      {
        medico_id: medicoId,
        nombre_medico: d.nombre_medico || null,
        especialidad: d.especialidad || null,
        tono: d.tono || null,
        saludo: d.saludo || null,
        faqs: d.faqs,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'medico_id' },
    )
  if (error) return { error: error.message }
  return { ok: true as const }
}

/** Plus default que el bot cobra en el check-in ("llegué"). NULL = deriva al mostrador.
 *  Operativa (la puede tocar la secretaria), upsert parcial como el precio de receta. */
export async function guardarMontoPlus(monto: number | null) {
  const c = await ctxOperativo()
  if ('error' in c) return c
  if (monto !== null && (!Number.isFinite(monto) || monto < 0)) return { error: 'Monto inválido' }
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('wa_config_agente')
    .upsert(
      { medico_id: c.medicoId, monto_plus_default: monto, updated_at: new Date().toISOString() },
      { onConflict: 'medico_id' },
    )
  if (error) return { error: error.message }
  return { ok: true as const }
}

/** Precio de gestión de receta (operativa: lo puede tocar la secretaria). Upsert parcial:
 *  escribe SOLO precio_receta_default, sin tocar la personalidad de la misma fila. */
export async function guardarPrecioReceta(precio: number | null) {
  const c = await ctxOperativo()
  if ('error' in c) return c
  if (precio !== null && (!Number.isFinite(precio) || precio < 0)) return { error: 'Precio inválido' }
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('wa_config_agente')
    .upsert(
      { medico_id: c.medicoId, precio_receta_default: precio, updated_at: new Date().toISOString() },
      { onConflict: 'medico_id' },
    )
  if (error) return { error: error.message }
  return { ok: true as const }
}

/** Config para la vista del consultorio. Operativa SIEMPRE; personalidad/conexiones/secretarias
 *  SOLO para el dueño (null para la secretaria → no le llegan al browser). */
export interface ConfigVista {
  esDueño: boolean
  /** Id del consultorio operado (medicoActivoId). Lo usa p.ej. la bitácora de actividad,
   *  cuya RLS ya delega lectura a la secretaria vinculada (puede_acceder_consultorio). */
  medicoId: string
  horarios: ConfigConsultorio['horarios']
  duracionMin: number
  servicioId: string | null
  excepciones: ConfigConsultorio['excepciones']
  osSuspendidas: ConfigConsultorio['osSuspendidas']
  diasParticulares: ConfigConsultorio['diasParticulares']
  precioReceta: number | null
  montoPlus: number | null
  agente: Omit<NonNullable<ConfigConsultorio['agente']>, 'precio_receta_default' | 'monto_plus_default'> | null
  conexiones: ConfigConsultorio['conexiones'] | null
  secretarias: ConfigConsultorio['secretarias'] | null
}

/** Carga la config del consultorio operado (medicoActivoId). Autoriza con ctxOperativo y lee
 *  con service-role (la secretaria no tiene RLS sobre varias tablas). Recorta lo médico-only. */
export async function cargarConfigConsultorio(): Promise<ConfigVista | { error: string }> {
  const c = await ctxOperativo()
  if ('error' in c) return c as { error: string }
  const ctx = c as { medicoId: string; userId: string; esDueño: boolean }
  const cfg = await getConfig(createServiceClient(), ctx.medicoId)
  const personalidad = cfg.agente
    ? (({ precio_receta_default: _p, monto_plus_default: _m, ...rest }) => rest)(cfg.agente)
    : null
  return {
    esDueño: ctx.esDueño,
    medicoId: ctx.medicoId,
    horarios: cfg.horarios,
    duracionMin: cfg.duracionMin,
    servicioId: cfg.servicioId,
    excepciones: cfg.excepciones,
    osSuspendidas: cfg.osSuspendidas,
    diasParticulares: cfg.diasParticulares,
    precioReceta: cfg.agente?.precio_receta_default ?? null,
    montoPlus: cfg.agente?.monto_plus_default ?? null,
    agente: ctx.esDueño ? personalidad : null,
    conexiones: ctx.esDueño ? cfg.conexiones : null,
    secretarias: ctx.esDueño ? cfg.secretarias : null,
  }
}

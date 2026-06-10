import type { SupabaseClient } from '@supabase/supabase-js'
import {
  computeSlotsForDate,
  arDateString,
  weekdayOf,
  resolveDayHours,
  pickException,
  type ScheduleExceptionLite,
  type DayAvailability,
} from '@/lib/turnos/slots'
import { fmtFechaCorta, fmtHora } from '@/lib/turnos/formato'
import type { ServicioLite } from '@/lib/turnos/resolverServicio'

/** Cuántos días hacia adelante se busca disponibilidad (el origen usaba 60: ruido). */
const DIAS_A_OFRECER = 14
/** Ventana del resumen de agenda del médico (comando 'turnos'). */
const DIAS_RESUMEN_MEDICO = 7

export interface TurnoRow {
  id: string
  servicio_id: string | null
  paciente_telefono: string
  paciente_nombre: string | null
  starts_at: string
  ends_at: string
  estado: string
}

export async function getServiciosActivos(db: SupabaseClient, medicoId: string): Promise<ServicioLite[]> {
  const { data } = await db
    .from('wa_servicios')
    .select('id, nombre, duracion_min, precio, activo')
    .eq('medico_id', medicoId)
    .eq('activo', true)
    .order('nombre')
  return ((data as ServicioLite[] | null) ?? []).map((s) => ({
    ...s,
    precio: s.precio != null ? Number(s.precio) : null,
  }))
}

async function getHorarios(
  db: SupabaseClient,
  medicoId: string,
): Promise<{ weekday: number; open_time: string; close_time: string }[]> {
  const { data } = await db
    .from('wa_horarios')
    .select('weekday, open_time, close_time')
    .eq('medico_id', medicoId)
    .order('weekday')
  return (data as { weekday: number; open_time: string; close_time: string }[] | null) ?? []
}

async function getExcepciones(db: SupabaseClient, medicoId: string): Promise<ScheduleExceptionLite[]> {
  const { data } = await db
    .from('wa_excepciones')
    .select('start_date, end_date, kind, ranges')
    .eq('medico_id', medicoId)
    .order('start_date')
  return (data as ScheduleExceptionLite[] | null) ?? []
}

/** Disponibilidad real del servicio: horario semanal + excepciones − turnos ocupados. */
export async function getDisponibilidad(
  db: SupabaseClient,
  medicoId: string,
  servicio: ServicioLite,
  dias = DIAS_A_OFRECER,
): Promise<DayAvailability[]> {
  const [horarios, excepciones] = await Promise.all([getHorarios(db, medicoId), getExcepciones(db, medicoId)])
  if (horarios.length === 0) return []

  const nowMs = Date.now()
  const desdeIso = new Date(nowMs).toISOString()
  const hastaIso = new Date(nowMs + dias * 86_400_000).toISOString()
  // Ocupados: cualquier turno NO cancelado que toque la ventana — incluye los que
  // empezaron antes de "ahora" y siguen en curso (el origen los perdía).
  const { data: busy } = await db
    .from('wa_turnos')
    .select('starts_at, ends_at')
    .eq('medico_id', medicoId)
    .neq('estado', 'cancelado')
    .gt('ends_at', desdeIso)
    .lte('starts_at', hastaIso)
  const ocupados = (busy as { starts_at: string; ends_at: string }[] | null) ?? []

  const result: DayAvailability[] = []
  for (let i = 0; i < dias; i++) {
    const date = arDateString(nowMs, i)
    const weekday = weekdayOf(date)
    const { closed, hours } = resolveDayHours({ date, weekday, weekly: horarios, exceptions: excepciones })
    if (closed || hours.length === 0) continue
    const slots = computeSlotsForDate({
      date,
      durationMin: servicio.duracion_min,
      hours,
      busy: ocupados,
      nowMs,
    })
    if (slots.length > 0) result.push({ date, weekday, slots })
  }
  return result
}

export interface CrearTurnoInput {
  servicio: ServicioLite
  startsAt: string // ISO UTC, ya validado contra esSlotOfrecido por el caller
  pacienteTelefono: string // ya normalizado con normalizeRecipient
  pacienteNombre: string
  contactoId: string | null
}

/**
 * Crea el turno. El caller ya validó que startsAt es un slot ofrecido; acá quedan
 * dos defensas: día cerrado por excepción (por si el slot venía de una consulta
 * vieja) y el constraint EXCLUDE de la DB (carrera entre reservas simultáneas).
 */
export async function crearTurno(
  db: SupabaseClient,
  medicoId: string,
  input: CrearTurnoInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const fecha = arDateString(new Date(input.startsAt).getTime(), 0)
  const excepciones = await getExcepciones(db, medicoId)
  if (pickException(fecha, excepciones)?.kind === 'closed') {
    return { ok: false, error: 'Ese día el consultorio está cerrado.' }
  }

  const endsAt = new Date(
    new Date(input.startsAt).getTime() + input.servicio.duracion_min * 60_000,
  ).toISOString()

  const { error } = await db.from('wa_turnos').insert({
    medico_id: medicoId,
    contacto_id: input.contactoId,
    servicio_id: input.servicio.id,
    paciente_telefono: input.pacienteTelefono,
    paciente_nombre: input.pacienteNombre || null,
    starts_at: input.startsAt,
    ends_at: endsAt,
    estado: 'reservado',
  })
  if (error) {
    // 23P01 = exclusion_violation: otro turno ganó ese rango en la carrera.
    if (error.code === '23P01') return { ok: false, error: 'Ese horario ya fue tomado. Probá con otro.' }
    console.error('[turnos] insert error:', error.message)
    return { ok: false, error: 'No se pudo crear el turno.' }
  }
  return { ok: true }
}

/** Turnos próximos (no cancelados) del paciente, identificado por su teléfono. */
export async function listarTurnosDePaciente(
  db: SupabaseClient,
  medicoId: string,
  telefonoNormalizado: string,
): Promise<TurnoRow[]> {
  const { data } = await db
    .from('wa_turnos')
    .select('id, servicio_id, paciente_telefono, paciente_nombre, starts_at, ends_at, estado')
    .eq('medico_id', medicoId)
    .eq('paciente_telefono', telefonoNormalizado)
    .in('estado', ['reservado', 'confirmado'])
    .gt('starts_at', new Date().toISOString())
    .order('starts_at')
  return (data as TurnoRow[] | null) ?? []
}

/** Cancela un turno DEL PACIENTE: el candado es su propio teléfono (no cancela ajenos). */
export async function cancelarTurnoDePaciente(
  db: SupabaseClient,
  medicoId: string,
  telefonoNormalizado: string,
  turnoId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data } = await db
    .from('wa_turnos')
    .update({ estado: 'cancelado', updated_at: new Date().toISOString() })
    .eq('medico_id', medicoId)
    .eq('id', turnoId)
    .eq('paciente_telefono', telefonoNormalizado)
    .in('estado', ['reservado', 'confirmado'])
    .select('id')
  if (!data || data.length === 0) {
    return { ok: false, error: 'No encontré ese turno a nombre de este número (o ya estaba cancelado).' }
  }
  return { ok: true }
}

function nombreServicio(s: { nombre: string } | { nombre: string }[] | null): string {
  if (!s) return 'turno'
  return Array.isArray(s) ? (s[0]?.nombre ?? 'turno') : s.nombre
}

/** Agenda compacta para el comando 'turnos' del médico (visibilidad mínima, como 'recetas'). */
export async function resumenTurnos(db: SupabaseClient, medicoId: string): Promise<string> {
  const { data } = await db
    .from('wa_turnos')
    .select('starts_at, paciente_nombre, paciente_telefono, estado, servicio:wa_servicios(nombre)')
    .eq('medico_id', medicoId)
    .in('estado', ['reservado', 'confirmado'])
    .gt('starts_at', new Date().toISOString())
    .lte('starts_at', new Date(Date.now() + DIAS_RESUMEN_MEDICO * 86_400_000).toISOString())
    .order('starts_at')
  const rows =
    (data as unknown as
      | {
          starts_at: string
          paciente_nombre: string | null
          paciente_telefono: string
          estado: string
          servicio: { nombre: string } | { nombre: string }[] | null
        }[]
      | null) ?? []

  if (rows.length === 0) return `No hay turnos agendados para los próximos ${DIAS_RESUMEN_MEDICO} días.`

  const lineas = rows
    .map(
      (t) =>
        `• ${fmtFechaCorta(t.starts_at)} ${fmtHora(t.starts_at)} — ${t.paciente_nombre || t.paciente_telefono} (${nombreServicio(t.servicio)})`,
    )
    .join('\n')
  return `📅 Turnos de los próximos ${DIAS_RESUMEN_MEDICO} días (${rows.length}):\n${lineas}`
}

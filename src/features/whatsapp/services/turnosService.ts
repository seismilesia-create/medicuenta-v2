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
/** Tope de líneas del resumen (el texto de WhatsApp corta en 4096 chars; con motivo, 30 entra holgado). */
const MAX_LINEAS_RESUMEN = 30

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
  const { data, error } = await db
    .from('wa_horarios')
    .select('weekday, open_time, close_time')
    .eq('medico_id', medicoId)
    .order('weekday')
  if (error) console.error('[turnos] horarios read error:', error.message)
  return (data as { weekday: number; open_time: string; close_time: string }[] | null) ?? []
}

async function getExcepciones(db: SupabaseClient, medicoId: string): Promise<ScheduleExceptionLite[]> {
  const { data, error } = await db
    .from('wa_excepciones')
    .select('start_date, end_date, kind, ranges')
    .eq('medico_id', medicoId)
    .order('start_date')
  if (error) console.error('[turnos] excepciones read error:', error.message)
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
  const { data: busy, error: busyError } = await db
    .from('wa_turnos')
    .select('starts_at, ends_at')
    .eq('medico_id', medicoId)
    .neq('estado', 'cancelado')
    .gt('ends_at', desdeIso)
    .lte('starts_at', hastaIso)
  if (busyError) console.error('[turnos] busy read error:', busyError.message)
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
  /** SIEMPRE resuelto de getServiciosActivos(medicoId) del MISMO médico — el FK no valida tenant. */
  servicio: ServicioLite
  startsAt: string // ISO UTC, ya validado contra esSlotOfrecido por el caller
  pacienteTelefono: string // ya normalizado con normalizeRecipient
  pacienteNombre: string
  /** Motivo de consulta dicho por el paciente — informativo para el médico (va a `notas`). */
  motivo: string
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
): Promise<{ ok: true; yaExistia?: string } | { ok: false; error: string }> {
  const startMs = new Date(input.startsAt).getTime()
  if (!Number.isFinite(startMs)) {
    // Un throw acá abortaría el turno entero del agente → dead-air para el paciente.
    return { ok: false, error: 'Horario inválido. Volvé a consultar la disponibilidad.' }
  }
  const fecha = arDateString(startMs, 0)

  // Chequeo de día cerrado ERROR-AWARE: un error de lectura NO puede degradar a
  // "sin excepciones" — reservaría en vacaciones y la DB no conoce los días cerrados
  // (el EXCLUDE solo ataja solapes). Es el único read del archivo donde vacío ≠ seguro.
  const { data: excData, error: excError } = await db
    .from('wa_excepciones')
    .select('start_date, end_date, kind, ranges')
    .eq('medico_id', medicoId)
  if (excError) {
    return { ok: false, error: 'No pude verificar la agenda del consultorio. Probá de nuevo en unos minutos.' }
  }
  if (pickException(fecha, (excData as ScheduleExceptionLite[] | null) ?? [])?.kind === 'closed') {
    return { ok: false, error: 'Ese día el consultorio está cerrado.' }
  }

  const endsAt = new Date(startMs + input.servicio.duracion_min * 60_000).toISOString()

  const { error } = await db.from('wa_turnos').insert({
    medico_id: medicoId,
    contacto_id: input.contactoId,
    servicio_id: input.servicio.id,
    paciente_telefono: input.pacienteTelefono,
    paciente_nombre: input.pacienteNombre || null,
    starts_at: input.startsAt,
    ends_at: endsAt,
    estado: 'reservado',
    notas: input.motivo || null,
  })
  if (error) {
    // 23P01 = exclusion_violation: otro turno ganó ese rango en la carrera.
    if (error.code === '23P01') {
      // ¿El que ya ocupa el slot es ESTE MISMO paciente? (doble confirmación o
      // reintento) → éxito idempotente; decirle "probá con otro" lo mandaría a
      // reservar un SEGUNDO turno en otro horario.
      const { data: propio } = await db
        .from('wa_turnos')
        .select('id, starts_at')
        .eq('medico_id', medicoId)
        .eq('paciente_telefono', input.pacienteTelefono)
        .neq('estado', 'cancelado')
        .lt('starts_at', endsAt)
        .gt('ends_at', input.startsAt)
        .limit(1)
      if (propio && propio.length > 0) {
        // Confirmar con el horario REAL del turno existente: en la carrera doble del
        // mismo paciente, el que perdió no debe escuchar el horario perdedor.
        return { ok: true, yaExistia: (propio[0] as { starts_at: string }).starts_at }
      }
      return { ok: false, error: 'Ese horario ya fue tomado. Probá con otro.' }
    }
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
  const { data, error } = await db
    .from('wa_turnos')
    .update({ estado: 'cancelado', updated_at: new Date().toISOString() })
    .eq('medico_id', medicoId)
    .eq('id', turnoId)
    .eq('paciente_telefono', telefonoNormalizado)
    .in('estado', ['reservado', 'confirmado'])
    .select('id')
  if (error) {
    console.error('[turnos] cancelar error:', error.message)
    return { ok: false, error: 'No pude cancelarlo ahora. Probá de nuevo en unos minutos.' }
  }
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
  const { data, error } = await db
    .from('wa_turnos')
    .select('starts_at, paciente_nombre, paciente_telefono, estado, notas, servicio:wa_servicios(nombre)')
    .eq('medico_id', medicoId)
    .in('estado', ['reservado', 'confirmado'])
    .gt('starts_at', new Date().toISOString())
    .lte('starts_at', new Date(Date.now() + DIAS_RESUMEN_MEDICO * 86_400_000).toISOString())
    .order('starts_at')
    .limit(MAX_LINEAS_RESUMEN)
  if (error) {
    console.error('[turnos] resumen error:', error.message)
    return 'No pude leer la agenda ahora. Probá de nuevo en unos minutos.'
  }
  const rows =
    (data as unknown as
      | {
          starts_at: string
          paciente_nombre: string | null
          paciente_telefono: string
          estado: string
          notas: string | null
          servicio: { nombre: string } | { nombre: string }[] | null
        }[]
      | null) ?? []

  if (rows.length === 0) return `No hay turnos agendados para los próximos ${DIAS_RESUMEN_MEDICO} días.`

  // Motivo truncado: 30 líneas × ~115 chars quedan bajo el tope de 4096 de WhatsApp.
  const motivoCorto = (n: string | null) => {
    const m = (n ?? '').trim()
    if (!m) return ''
    return ` — ${m.length > 40 ? `${m.slice(0, 40)}…` : m}`
  }
  const lineas = rows
    .map(
      (t) =>
        `• ${fmtFechaCorta(t.starts_at)} ${fmtHora(t.starts_at)} — ${t.paciente_nombre || t.paciente_telefono} (${nombreServicio(t.servicio)})${motivoCorto(t.notas)}`,
    )
    .join('\n')
  const corto = rows.length === MAX_LINEAS_RESUMEN ? `\n… (mostrando los primeros ${MAX_LINEAS_RESUMEN})` : ''
  const cuenta = rows.length === MAX_LINEAS_RESUMEN ? `${rows.length}+` : `${rows.length}`
  return `📅 Turnos de los próximos ${DIAS_RESUMEN_MEDICO} días (${cuenta}):\n${lineas}${corto}`
}

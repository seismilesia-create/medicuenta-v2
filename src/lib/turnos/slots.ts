/**
 * Motor de slots — lógica pura de cálculo de disponibilidad.
 * Trabaja en hora local de Argentina (UTC-3, sin DST vigente).
 */

export const AR_OFFSET = '-03:00'
export const AR_TZ = 'America/Argentina/Buenos_Aires'

/** Hasta cuántos días para adelante el agente ofrece turnos. */
export const BOOKING_WINDOW_DAYS = 60

export interface Slot {
  startsAt: string // ISO UTC
  endsAt: string // ISO UTC
  label: string // 'HH:MM' hora local AR
}

interface HoursBlock {
  open_time: string // 'HH:MM' o 'HH:MM:SS'
  close_time: string
}

interface BusyRange {
  starts_at: string
  ends_at: string
}

function toDateMs(date: string, time: string): number {
  const t = time.length === 5 ? `${time}:00` : time
  return new Date(`${date}T${t}${AR_OFFSET}`).getTime()
}

function labelFor(ms: number): string {
  return new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: AR_TZ,
  }).format(new Date(ms))
}

/**
 * Calcula los slots disponibles para una fecha dada.
 * @param date 'YYYY-MM-DD' (día local AR)
 * @param durationMin duración del servicio
 * @param hours bloques de atención de ese día (puede haber mañana + tarde)
 * @param busy turnos ocupados (NO cancelados) que solapan el día
 * @param stepMin paso entre slots (default = duración del servicio)
 * @param nowMs si se pasa, descarta slots en el pasado
 */
export function computeSlotsForDate(params: {
  date: string
  durationMin: number
  hours: HoursBlock[]
  busy: BusyRange[]
  stepMin?: number
  nowMs?: number
}): Slot[] {
  const { date, durationMin, hours, busy, stepMin, nowMs } = params
  const step = (stepMin ?? durationMin) * 60_000
  const durMs = durationMin * 60_000
  const slots: Slot[] = []

  const busyRanges = busy.map(
    (b) => [new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime()] as const,
  )

  for (const block of hours) {
    const open = toDateMs(date, block.open_time)
    const close = toDateMs(date, block.close_time)
    for (let start = open; start + durMs <= close; start += step) {
      const end = start + durMs
      const overlaps = busyRanges.some(([bs, be]) => start < be && end > bs)
      const inPast = nowMs != null && start < nowMs
      if (!overlaps && !inPast) {
        slots.push({
          startsAt: new Date(start).toISOString(),
          endsAt: new Date(end).toISOString(),
          label: labelFor(start),
        })
      }
    }
  }

  return slots
}

/** Devuelve 'YYYY-MM-DD' (en hora AR) sumando `offsetDays` a una fecha base. */
export function arDateString(baseMs: number, offsetDays = 0): string {
  const d = new Date(baseMs + offsetDays * 86_400_000)
  // en-CA da formato YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: AR_TZ }).format(d)
}

/** Día de la semana (0=domingo) en hora AR para un 'YYYY-MM-DD'. */
export function weekdayOf(date: string): number {
  // Mediodía local para evitar bordes de día por offset
  return new Date(`${date}T12:00:00${AR_OFFSET}`).getDay()
}

/** Excepción de calendario en forma mínima para el motor de slots. */
export interface ScheduleExceptionLite {
  start_date: string // 'YYYY-MM-DD'
  end_date: string // 'YYYY-MM-DD'
  kind: 'closed' | 'custom' | 'open'
  ranges: { open: string; close: string }[]
}

/**
 * Devuelve la excepción que controla una fecha, o null si no hay ninguna.
 * Precedencia cuando varias cubren la fecha: closed > custom > open.
 * (Comparación lexicográfica válida para fechas 'YYYY-MM-DD'.)
 */
export function pickException(
  date: string,
  exceptions: ScheduleExceptionLite[],
): ScheduleExceptionLite | null {
  const covering = exceptions.filter((e) => e.start_date <= date && date <= e.end_date)
  if (covering.length === 0) return null
  return (
    covering.find((e) => e.kind === 'closed') ??
    covering.find((e) => e.kind === 'custom') ??
    covering.find((e) => e.kind === 'open') ??
    null
  )
}

/**
 * Resuelve los bloques horarios efectivos de un día, combinando el horario semanal
 * con las excepciones. Devuelve `closed: true` si ese día no se atiende.
 */
export function resolveDayHours(params: {
  date: string
  weekday: number
  weekly: { weekday: number; open_time: string; close_time: string }[]
  exceptions: ScheduleExceptionLite[]
}): { closed: boolean; hours: { open_time: string; close_time: string }[] } {
  const exc = pickException(params.date, params.exceptions)
  if (exc?.kind === 'closed') return { closed: true, hours: [] }
  if (exc?.kind === 'custom') {
    return { closed: false, hours: exc.ranges.map((r) => ({ open_time: r.open, close_time: r.close })) }
  }
  // 'open' o sin excepción → horario semanal habitual
  const hours = params.weekly
    .filter((h) => h.weekday === params.weekday)
    .map((h) => ({ open_time: h.open_time, close_time: h.close_time }))
  return { closed: false, hours }
}

// ── Agregados para MediCuenta (no estaban en el motor origen) ────────────────

/** Disponibilidad de un día, como la devuelve el servicio de turnos. */
export interface DayAvailability {
  date: string // YYYY-MM-DD
  weekday: number
  slots: Slot[]
}

/**
 * ¿El instante startsAt es EXACTAMENTE uno de los slots ofrecidos?
 * Barrera anti-horario-inventado: la IA solo puede reservar lo que la tool ofreció.
 */
export function esSlotOfrecido(dias: DayAvailability[], startsAt: string): boolean {
  return dias.some((d) => d.slots.some((s) => s.startsAt === startsAt))
}

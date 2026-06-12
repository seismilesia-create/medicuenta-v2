/**
 * Correlación turno→orden (Fase 3C, spec §9.2 / D8).
 *
 * Lógica pura y decidible (sin DB, sin red): qué turnos/sobreturnos atendidos
 * proponer al facturar, y el control de los 15 minutos que exige OSEP entre
 * atenciones. La capa de servicio hace las queries; acá vive sólo el criterio.
 *
 * Zona horaria: todo se calcula en hora AR vía los helpers de `calendario`/`slots`,
 * nunca con la TZ de la máquina.
 */
import { minutosAR, minutosDeHora } from './calendario'
import { arDateString } from '@/lib/turnos/slots'

// ── Estados que NO cuentan como atención ─────────────────────────────────────
// Turno (wa_turnos):  reservado · confirmado · cancelado · completado · ausente
// Sobreturno:         pendiente · atendido · no_vino · cancelado
const TURNO_NO_ATENDIDO = new Set(['cancelado', 'ausente'])
const SOBRETURNO_NO_ATENDIDO = new Set(['cancelado', 'no_vino'])

/** Umbral OSEP: mínimo de minutos exigido entre dos atenciones del mismo día. */
export const UMBRAL_MINUTOS = 15

export interface TurnoCrudo {
  id: string
  starts_at: string // ISO UTC
  estado: string
  paciente_nombre?: string | null
  paciente_apellido?: string | null
}

export interface SobreturnoCrudo {
  id: string
  fecha: string // YYYY-MM-DD (AR)
  estado: string
  paciente_nombre?: string | null
  paciente_apellido?: string | null
}

export interface SugerenciaTurno {
  tipo: 'turno' | 'sobreturno'
  id: string
  fecha: string // YYYY-MM-DD (AR)
  hora: string | null // HH:MM (AR) — null para sobreturnos (no tienen horario)
  paciente: string // "Apellido, Nombre" o lo que haya
}

/** 'HH:MM' a partir de minutos desde medianoche. */
function horaDeMinutos(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function nombreDe(p: { paciente_apellido?: string | null; paciente_nombre?: string | null }): string {
  const ap = (p.paciente_apellido ?? '').trim()
  const no = (p.paciente_nombre ?? '').trim()
  if (ap && no) return `${ap}, ${no}`
  return ap || no || 'Paciente'
}

/**
 * Un turno cuenta como "atendido" si ya pasó (su inicio es <= ahora) y no fue
 * cancelado ni marcado ausente. Los turnos pasados se asumen atendidos salvo
 * que el médico marque "no vino" (spec §5.4).
 */
export function esTurnoAtendido(t: TurnoCrudo, nowMs: number): boolean {
  if (TURNO_NO_ATENDIDO.has(t.estado)) return false
  return new Date(t.starts_at).getTime() <= nowMs
}

/**
 * Un sobreturno cuenta como "atendido" si su fecha es hoy o anterior (AR) y no
 * fue cancelado ni "no vino".
 */
export function esSobreturnoAtendido(s: SobreturnoCrudo, nowMs: number): boolean {
  if (SOBRETURNO_NO_ATENDIDO.has(s.estado)) return false
  return s.fecha <= arDateString(nowMs, 0)
}

/**
 * Arma la lista de sugerencias (turnos + sobreturnos atendidos) ordenada de la
 * atención MÁS RECIENTE a la más vieja — la que se está facturando suele ser la
 * última. Espera recibir SOLO candidatos del DNI buscado y SIN orden vinculada
 * (eso lo filtra el servicio); acá aplicamos el criterio de "atendido", el
 * formato y el orden.
 */
export function construirSugerencias(
  turnos: TurnoCrudo[],
  sobreturnos: SobreturnoCrudo[],
  nowMs: number,
): SugerenciaTurno[] {
  const deTurnos: SugerenciaTurno[] = turnos
    .filter((t) => esTurnoAtendido(t, nowMs))
    .map((t) => ({
      tipo: 'turno' as const,
      id: t.id,
      fecha: arDateString(new Date(t.starts_at).getTime(), 0),
      hora: horaDeMinutos(minutosAR(t.starts_at)),
      paciente: nombreDe(t),
    }))

  const deSobreturnos: SugerenciaTurno[] = sobreturnos
    .filter((s) => esSobreturnoAtendido(s, nowMs))
    .map((s) => ({
      tipo: 'sobreturno' as const,
      id: s.id,
      fecha: s.fecha,
      hora: null,
      paciente: nombreDe(s),
    }))

  // Orden descendente por fecha y, dentro del día, por hora (los sin hora —
  // sobreturnos— van al final del día).
  return [...deTurnos, ...deSobreturnos].sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1
    const ha = a.hora ? minutosDeHora(a.hora) : -1
    const hb = b.hora ? minutosDeHora(b.hora) : -1
    return hb - ha
  })
}

export interface OrdenDelDia {
  id?: string
  hora: string // HH:MM
  paciente?: string | null
}

export interface ConflictoQuinceMin {
  paciente: string
  hora: string
  brecha: number // minutos de diferencia (siempre < UMBRAL_MINUTOS)
}

/**
 * Control de los 15 minutos (spec §9.2): dada la hora de la orden que se está
 * por guardar y las horas de las OTRAS órdenes del mismo día, devuelve las que
 * quedan a menos de `umbral` minutos. Es un AVISO, no un bloqueo. Devuelve []
 * si la hora nueva es inválida/vacía (no se puede comparar).
 */
export function controlQuinceMinutos(
  horaNueva: string | null | undefined,
  otras: OrdenDelDia[],
  umbral = UMBRAL_MINUTOS,
): ConflictoQuinceMin[] {
  if (!horaNueva || !/^\d{1,2}:\d{2}/.test(horaNueva)) return []
  const minNueva = minutosDeHora(horaNueva)

  return otras
    .filter((o) => o.hora && /^\d{1,2}:\d{2}/.test(o.hora))
    .map((o) => ({ o, brecha: Math.abs(minutosDeHora(o.hora) - minNueva) }))
    .filter(({ brecha }) => brecha < umbral)
    .sort((a, b) => a.brecha - b.brecha)
    .map(({ o, brecha }) => ({
      paciente: (o.paciente ?? '').trim() || 'otra atención',
      hora: o.hora,
      brecha,
    }))
}

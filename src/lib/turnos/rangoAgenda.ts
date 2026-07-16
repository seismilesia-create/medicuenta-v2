/** Resolución del rango de agenda que pide el médico por WhatsApp (hora AR, día calendario). */
import { armarStartsAtISO, fmtFechaLarga } from '@/lib/turnos/formato'
import { AR_TZ } from '@/lib/turnos/slots'

/** Ventana por defecto cuando el médico pregunta genérico ("¿qué turnos tengo?"). */
export const DIAS_DEFAULT = 14

export interface RangoAgenda {
  desde?: string
  hasta?: string
}

export interface RangoResuelto {
  desdeISO: string
  hastaISO: string
  /** Texto del rango, usable tal cual en "📅 Turnos — X (3):" y en "📅 No hay turnos — X.". */
  descriptor: string
}

/** 'YYYY-MM-DD' del instante en hora AR. */
function diaAR(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: AR_TZ }).format(new Date(iso))
}

/** 'jueves 23 de julio' (fmtFechaLarga trae coma: 'jueves, 23 de julio'). */
function diaLargo(iso: string): string {
  return fmtFechaLarga(iso).replace(', ', ' ')
}

/**
 * Resuelve { desde?, hasta? } (fechas AR 'YYYY-MM-DD') a límites ISO + su descriptor.
 * El descriptor sale de la MISMA resolución que la query: así el encabezado no puede
 * mentir sobre lo que se consultó (era exactamente el bug: "próximos 7 días" hardcodeado).
 * Límites de día calendario AR, NO ventana rodante de N×24hs.
 */
export function resolverRangoAgenda(
  rango: RangoAgenda | undefined,
  ahoraMs: number,
): RangoResuelto | { error: string } {
  const desde = rango?.desde?.trim() || undefined
  const hasta = rango?.hasta?.trim() || undefined

  // Piso: 'ahora' si no pidió desde (la pregunta genérica no muestra turnos pasados);
  // si pidió desde, se honra el día completo (permite preguntar por un día puntual o pasado).
  let desdeISO: string
  if (desde) {
    const iso = armarStartsAtISO(desde, '00:00')
    if (!iso) return { error: `No entendí la fecha "${desde}". Usá el formato AAAA-MM-DD.` }
    desdeISO = iso
  } else {
    desdeISO = new Date(ahoraMs).toISOString()
  }

  // Techo: 23:59 AR de 'hasta', o de (desde ?? hoy) + DIAS_DEFAULT.
  let hastaISO: string
  if (hasta) {
    const iso = armarStartsAtISO(hasta, '23:59')
    if (!iso) return { error: `No entendí la fecha "${hasta}". Usá el formato AAAA-MM-DD.` }
    hastaISO = iso
  } else {
    const finDia = diaAR(new Date(new Date(desdeISO).getTime() + DIAS_DEFAULT * 86_400_000).toISOString())
    const iso = armarStartsAtISO(finDia, '23:59')
    if (!iso) return { error: 'No pude calcular el rango de fechas.' }
    hastaISO = iso
  }

  if (new Date(hastaISO).getTime() < new Date(desdeISO).getTime()) {
    return { error: 'El rango está al revés: la fecha de fin es anterior a la de inicio.' }
  }

  const descriptor = !desde && !hasta
    ? `los próximos ${DIAS_DEFAULT} días`
    : diaAR(desdeISO) === diaAR(hastaISO)
      ? `el ${diaLargo(desdeISO)}`
      : `del ${diaLargo(desdeISO)} al ${diaLargo(hastaISO)}`

  return { desdeISO, hastaISO, descriptor }
}

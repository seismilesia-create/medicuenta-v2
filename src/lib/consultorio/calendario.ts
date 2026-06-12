/**
 * Aritmética de calendario para las vistas de agenda (día/semana/mes).
 * Trabaja con fechas 'YYYY-MM-DD' (día local AR) usando aritmética pura sobre UTC,
 * para no depender jamás de la zona horaria de la máquina.
 */
import { arDateString, AR_TZ } from '@/lib/turnos/slots'

function aUtcMs(fecha: string): number {
  const [y, m, d] = fecha.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function addDias(fecha: string, n: number): string {
  return new Date(aUtcMs(fecha) + n * 86_400_000).toISOString().slice(0, 10)
}

/** Lunes de la semana de `fecha` (semana calendario AR: lunes → domingo). */
export function inicioSemana(fecha: string): string {
  const dow = new Date(aUtcMs(fecha)).getUTCDay() // 0 = domingo
  return addDias(fecha, dow === 0 ? -6 : 1 - dow)
}

/** Semanas completas (L→D) que cubren el mes, con relleno de meses vecinos. `mes`: 1-12. */
export function gridMes(anio: number, mes: number): string[][] {
  const claveMes = `${anio}-${String(mes).padStart(2, '0')}`
  let cursor = inicioSemana(`${claveMes}-01`)
  const semanas: string[][] = []
  do {
    const semana: string[] = []
    for (let i = 0; i < 7; i++) {
      semana.push(cursor)
      cursor = addDias(cursor, 1)
    }
    semanas.push(semana)
  } while (cursor.startsWith(claveMes))
  return semanas
}

/** Días enteros desde HOY (día AR) hasta `fecha`; negativo si ya pasó. */
export function diasDesdeHoy(fecha: string, nowMs = Date.now()): number {
  return Math.round((aUtcMs(fecha) - aUtcMs(arDateString(nowMs, 0))) / 86_400_000)
}

/** Minutos desde la medianoche AR para un instante ISO (posicionamiento en el timeline). */
export function minutosAR(iso: string): number {
  const partes = new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: AR_TZ,
  }).formatToParts(new Date(iso))
  const h = Number(partes.find((p) => p.type === 'hour')?.value ?? 0)
  const m = Number(partes.find((p) => p.type === 'minute')?.value ?? 0)
  return h * 60 + m
}

/** 'HH:MM' u 'HH:MM:SS' → minutos desde medianoche (para open_time/close_time). */
export function minutosDeHora(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m || 0)
}

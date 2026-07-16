/**
 * Conversión 24h ↔ 12h para el picker de horarios. Funciones puras. El almacenamiento
 * SIEMPRE es 'HH:MM' 24h canónico (wa_horarios); el 12h es solo presentación en la UI.
 */

export type Periodo = 'AM' | 'PM'

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** 'HH:MM' → { h, m } (24h). Tolera valores raros devolviendo 0. */
export function parseHora(hhmm: string): { h: number; m: number } {
  const [hStr, mStr] = (hhmm ?? '').split(':')
  const h = Number(hStr)
  const m = Number(mStr)
  return {
    h: Number.isInteger(h) && h >= 0 && h <= 23 ? h : 0,
    m: Number.isInteger(m) && m >= 0 && m <= 59 ? m : 0,
  }
}

export function componerHora(h: number, m: number): string {
  return `${pad2(h)}:${pad2(m)}`
}

/** Hora 24h (0–23) → hora de reloj 12h + período. 0→12 AM, 12→12 PM, 13→1 PM. */
export function to12(h24: number): { h12: number; periodo: Periodo } {
  const periodo: Periodo = h24 < 12 ? 'AM' : 'PM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return { h12, periodo }
}

/** Hora de reloj 12h (1–12) + período → hora 24h (0–23). 12 AM→0, 12 PM→12, 1 PM→13. */
export function from12(h12: number, periodo: Periodo): number {
  const base = h12 % 12 // 12 → 0
  return periodo === 'AM' ? base : base + 12
}

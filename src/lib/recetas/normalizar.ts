/** Normalización de identidad y montos para el cobro de recetas. Funciones puras. */

export function normalizarDni(s: string): string {
  return (s ?? '').replace(/\D/g, '')
}

export function normalizarNombre(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Coincidencia de nombre tolerante: tokens (≥3 letras) del nombre dado contra el
 * de la receta. Se usa DESPUÉS de matchear el DNI exacto — el nombre confirma.
 */
export function nombresCoinciden(nombreReceta: string, nombreDado: string): boolean {
  const tokensReceta = new Set(normalizarNombre(nombreReceta).split(' ').filter((t) => t.length >= 3))
  const tokensDados = normalizarNombre(nombreDado).split(' ').filter((t) => t.length >= 3)
  if (!tokensReceta.size || !tokensDados.length) return false
  const comunes = tokensDados.filter((t) => tokensReceta.has(t)).length
  return comunes >= Math.min(2, tokensReceta.size, tokensDados.length)
}

/** '5.000' → 5000 · '7.500,50' → 7500.5 (formato argentino: punto miles, coma decimal). */
export function parseMontoArs(s: string): number | null {
  const limpio = (s ?? '').replace(/[$\s]/g, '')
  if (!limpio) return null
  const n = Number(limpio.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

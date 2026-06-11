/** Helpers puros de la base de pacientes (spec Fase 3 §7). */

/** Acumula teléfonos sin duplicar; tolera jsonb roto (no-array, elementos no-string). */
export function mergeTelefonos(existentes: unknown, nuevo: string | null | undefined): string[] {
  const base = Array.isArray(existentes) ? existentes.filter((x): x is string => typeof x === 'string') : []
  const tel = (nuevo ?? '').trim()
  if (!tel || base.includes(tel)) return base
  return [...base, tel]
}

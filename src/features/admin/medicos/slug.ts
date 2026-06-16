// src/features/admin/medicos/slug.ts

/** Normaliza un texto a un fragmento de slug: sin acentos, minúsculas, guiones. */
function aFragmento(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Slug base a partir del nombre. Prefiere apellido; cae al nombre si no hay. */
export function generarSlugBase(nombre: string, apellido: string): string {
  const ape = aFragmento(apellido)
  if (ape) return `dr-${ape}`
  return `dr-${aFragmento(nombre)}`
}

/** Primer slug libre: la base si no está tomada, si no base-2, base-3, … */
export function siguienteSlugLibre(base: string, tomados: string[]): string {
  const set = new Set(tomados)
  if (!set.has(base)) return base
  let i = 2
  while (set.has(`${base}-${i}`)) i++
  return `${base}-${i}`
}

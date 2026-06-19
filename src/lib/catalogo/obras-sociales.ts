import { normalizarOs, esOsSuspendida } from '@/lib/consultorio/osSuspendidas'

/** Slug alfanumérico: elimina puntuación para comparar "OSEP" ↔ "O.S.E.P." */
function slugOs(s: string): string {
  return normalizarOs(s).replace(/[^a-z0-9]/g, '')
}

export interface ArancelOsRow {
  codigo_os: number
  nombre_os: string
  activa: boolean
  vigencia: string // YYYY-MM-DD
}

export interface OsCatalogoItem {
  codigo_os: number
  nombre_os: string
  activa: boolean
}

/** Una entrada por codigo_os, con la fila de vigencia más reciente. Ordenado por nombre_os. */
export function catalogoVigente(rows: ArancelOsRow[]): OsCatalogoItem[] {
  const porCodigo = new Map<number, ArancelOsRow>()
  for (const r of rows) {
    const prev = porCodigo.get(r.codigo_os)
    if (!prev || r.vigencia > prev.vigencia) porCodigo.set(r.codigo_os, r)
  }
  return Array.from(porCodigo.values())
    .map((r) => ({ codigo_os: r.codigo_os, nombre_os: r.nombre_os, activa: r.activa }))
    .sort((a, b) => a.nombre_os.localeCompare(b.nombre_os))
}

/** ¿La OS de la orden está suspendida? Catálogo del mes (activa=false) OR lista propia del médico. */
export function estaSuspendida(params: {
  codigoOs: number | null
  obraSocial: string | null
  catalogo: OsCatalogoItem[]
  suspendidasMedico: string[]
}): boolean {
  const { codigoOs, obraSocial, catalogo, suspendidasMedico } = params
  const os = normalizarOs(obraSocial ?? '')
  if (!os || os === 'particular') return false

  const item = codigoOs != null
    ? catalogo.find((c) => c.codigo_os === codigoOs)
    : catalogo.find((c) => normalizarOs(c.nombre_os) === os)
  if (item && !item.activa) return true

  if (esOsSuspendida(suspendidasMedico, obraSocial ?? '')) return true
  // Slug fallback: "OSEP" matches "O.S.E.P." after stripping punctuation
  const slug = slugOs(obraSocial ?? '')
  return suspendidasMedico.some((s) => {
    const n = slugOs(s)
    if (!n || n === 'particular') return false
    return n === slug || slug.includes(n) || n.includes(slug)
  })
}

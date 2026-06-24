// 4 tiers reales de la planilla del Círculo (vigencia mensual). Cada médico es
// exactamente uno (lo asigna el admin). El especialista NO recertificado cobra 'medica'.
// Mapeo a las columnas de aranceles_os:
//   medica                      → valor_consulta_medica
//   especialista                → valor_especialista     (columna "especialista recertificado")
//   oftalmologica               → valor_consulta_oftalmologica
//   oftalmologica_recertificado → valor_recertificado    (columna "oftalmológica recertificado")
export type CategoriaArancel =
  | 'medica'
  | 'especialista'
  | 'oftalmologica'
  | 'oftalmologica_recertificado'

export interface ArancelVigente {
  valor_consulta_medica: number | null
  valor_especialista: number | null // especialista recertificado
  valor_consulta_oftalmologica: number | null
  valor_recertificado: number | null // oftalmológica recertificado
  recargo_interior_pct: number | null // +% si el médico atiende en el interior (hoy: solo OSEP = 20)
}

// Categoría arancelaria del médico (de `perfiles`). La devuelve getMiCategoriaArancel
// y la consumen los forms de orden.
export interface MiCategoriaArancel {
  categoria_arancel: CategoriaArancel | null
  atiende_interior: boolean
}

export interface ResultadoHonorario {
  honorario: number // base + recargo, redondeado a 2 decimales
  base: number // valor de la columna elegida
  columna: string // p.ej. 'valor_especialista'
  recargoPct: number // 0 si no aplica
  motivo: string // legible para la UI
}

// Cadena de fallback por tier: si la columna del tier viene vacía para esa OS,
// degrada hacia consulta médica (nunca inventa un valor más alto).
const CADENA: Record<CategoriaArancel, (keyof ArancelVigente)[]> = {
  medica: ['valor_consulta_medica'],
  especialista: ['valor_especialista', 'valor_consulta_medica'],
  oftalmologica: ['valor_consulta_oftalmologica', 'valor_consulta_medica'],
  oftalmologica_recertificado: [
    'valor_recertificado',
    'valor_consulta_oftalmologica',
    'valor_consulta_medica',
  ],
}

const ETIQUETA: Record<string, string> = {
  valor_consulta_medica: 'consulta médica',
  valor_especialista: 'especialista',
  valor_consulta_oftalmologica: 'oftalmológica',
  valor_recertificado: 'oftalmológica recertificado',
}

function redondear2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Honorario de una consulta nivel 1 desde el arancel vigente, según el tier del médico.
 * Devuelve null si no se puede calcular (sin arancel, sin categoría, o todas las
 * columnas de la cadena en null/0) → el form deja el campo manual.
 */
export function calcularHonorarioConsulta(params: {
  arancel: ArancelVigente | null
  categoria: CategoriaArancel | null
  atiendeInterior: boolean
}): ResultadoHonorario | null {
  const { arancel, categoria, atiendeInterior } = params
  if (!arancel || !categoria) return null

  // 1) Elegir columna recorriendo la cadena de fallback del tier.
  let columna: keyof ArancelVigente | null = null
  let base = 0
  for (const c of CADENA[categoria]) {
    const v = arancel[c]
    // > 0: una columna en 0 (o null) se trata como "sin valor" → cae al siguiente candidato.
    if (typeof v === 'number' && v > 0) {
      columna = c
      base = v
      break
    }
  }
  if (columna === null) return null

  // 2) Recargo de interior (hoy solo OSEP: recargo_interior_pct = 20).
  const pct =
    atiendeInterior && typeof arancel.recargo_interior_pct === 'number'
      ? arancel.recargo_interior_pct
      : 0
  const honorario = redondear2(base * (1 + pct / 100))

  // 3) Motivo legible.
  const fmt = (n: number) => n.toLocaleString('es-AR')
  const etiqueta = ETIQUETA[columna] ?? columna
  const motivo =
    pct > 0
      ? `${etiqueta} $${fmt(base)} +${pct}% interior = $${fmt(honorario)}`
      : `${etiqueta} $${fmt(base)}`

  return { honorario, base, columna, recargoPct: pct, motivo }
}

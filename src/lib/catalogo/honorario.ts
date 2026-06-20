export type CategoriaArancel = 'comun' | 'especialista' | 'oftalmologica'

export interface ArancelVigente {
  valor_consulta_medica: number | null
  valor_especialista: number | null
  valor_consulta_oftalmologica: number | null
  valor_recertificado: number | null
  recargo_interior_pct: number | null
}

// Categoría arancelaria del médico (espejo de las columnas de `perfiles`).
// La devuelve la action getMiCategoriaArancel y la consumen los forms de orden.
export interface MiCategoriaArancel {
  categoria_arancel: CategoriaArancel | null
  recertificado: boolean
  atiende_interior: boolean
}

export interface ResultadoHonorario {
  honorario: number   // base + recargo, redondeado a 2 decimales
  base: number        // valor de la columna elegida
  columna: string     // p.ej. 'valor_especialista'
  recargoPct: number  // 0 si no aplica
  motivo: string      // legible para la UI
}

const COLUMNA_BASE: Record<CategoriaArancel, keyof ArancelVigente> = {
  comun: 'valor_consulta_medica',
  especialista: 'valor_especialista',
  oftalmologica: 'valor_consulta_oftalmologica',
}

const ETIQUETA: Record<string, string> = {
  valor_consulta_medica: 'consulta médica',
  valor_especialista: 'especialista',
  valor_consulta_oftalmologica: 'oftalmológica',
  valor_recertificado: 'recertificado',
}

function redondear2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Honorario de una consulta nivel 1 desde el arancel vigente.
 * Devuelve null cuando no se puede calcular (sin arancel, sin categoría, o
 * todas las columnas en null) → el form deja el campo manual.
 */
export function calcularHonorarioConsulta(params: {
  arancel: ArancelVigente | null
  categoria: CategoriaArancel | null
  recertificado: boolean
  atiendeInterior: boolean
}): ResultadoHonorario | null {
  const { arancel, categoria, recertificado, atiendeInterior } = params
  if (!arancel || !categoria) return null

  // 1) Elegir columna con cadena de fallback (el último recurso siempre es consulta médica).
  const colBase = COLUMNA_BASE[categoria]
  const candidatas: (keyof ArancelVigente)[] = []
  if (recertificado) candidatas.push('valor_recertificado')
  candidatas.push(colBase)
  if (colBase !== 'valor_consulta_medica') candidatas.push('valor_consulta_medica')

  let columna: keyof ArancelVigente | null = null
  let base = 0
  for (const c of candidatas) {
    const v = arancel[c]
    // > 0: una columna en 0 (o null) se trata como "sin valor" → cae al siguiente candidato.
    if (typeof v === 'number' && v > 0) { columna = c; base = v; break }
  }
  if (columna === null) return null

  // 2) Recargo de interior.
  const pct = atiendeInterior && typeof arancel.recargo_interior_pct === 'number'
    ? arancel.recargo_interior_pct
    : 0
  const honorario = redondear2(base * (1 + pct / 100))

  // 3) Motivo legible.
  const fmt = (n: number) => n.toLocaleString('es-AR')
  const etiqueta = ETIQUETA[columna] ?? columna
  const motivo = pct > 0
    ? `${etiqueta} $${fmt(base)} +${pct}% interior = $${fmt(honorario)}`
    : `${etiqueta} $${fmt(base)}`

  return { honorario, base, columna, recargoPct: pct, motivo }
}

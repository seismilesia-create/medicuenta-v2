/**
 * Análisis de costos del panel del dueño (spec dashboard §5.1). Puro y decidible:
 * dado el uso por médico, calcula el resumen global y marca a los OUTLIERS (los
 * que gastan bastante más que el promedio en tokens de IA). La query la hace el
 * servicio; acá vive el criterio.
 */

export interface MedicoMetricas {
  medico_id: string
  nombre: string | null
  apellido: string | null
  email: string | null
  alta: string | null
  numero: string | null
  canal_estado: string | null
  plan: string | null
  sub_estado: string | null
  tokens_30d: number
  mensajes_pagos_30d: number
  mensajes_salientes_30d: number
  errores_7d: number
  turnos_total: number
}

export interface MedicoConFlags extends MedicoMetricas {
  /** Gasta ≥50% más tokens que el promedio (y hay con qué comparar). */
  esOutlier: boolean
}

export interface ResumenCostos {
  totalMedicos: number
  totalTokens30d: number
  promedioTokens: number
  totalMensajesPagos30d: number
  totalErrores7d: number
  cantOutliers: number
}

export interface AnalisisCostos {
  resumen: ResumenCostos
  medicos: MedicoConFlags[] // ordenados por tokens desc
}

/** Un médico es outlier si supera el promedio por este factor. */
export const UMBRAL_OUTLIER = 1.5

export function analizarCostos(rows: MedicoMetricas[]): AnalisisCostos {
  const totalMedicos = rows.length
  const totalTokens30d = rows.reduce((a, r) => a + (r.tokens_30d || 0), 0)
  const totalMensajesPagos30d = rows.reduce((a, r) => a + (r.mensajes_pagos_30d || 0), 0)
  const totalErrores7d = rows.reduce((a, r) => a + (r.errores_7d || 0), 0)
  const promedioTokens = totalMedicos > 0 ? totalTokens30d / totalMedicos : 0

  // Outlier solo tiene sentido comparando: ≥2 médicos y promedio > 0.
  const puedeComparar = totalMedicos >= 2 && promedioTokens > 0

  const medicos: MedicoConFlags[] = rows
    .map((r) => ({
      ...r,
      esOutlier: puedeComparar && r.tokens_30d > promedioTokens * UMBRAL_OUTLIER,
    }))
    .sort((a, b) => b.tokens_30d - a.tokens_30d)

  return {
    resumen: {
      totalMedicos,
      totalTokens30d,
      promedioTokens,
      totalMensajesPagos30d,
      totalErrores7d,
      cantOutliers: medicos.filter((m) => m.esOutlier).length,
    },
    medicos,
  }
}

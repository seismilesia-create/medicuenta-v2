/** Faltantes que generan débito (item 2 backlog contador). */
export type FaltanteDebito = 'firma_afiliado' | 'diagnostico' | 'firma_sello_medico'

export const FALTANTE_LABELS: Record<FaltanteDebito, string> = {
  firma_afiliado: 'Firma del afiliado',
  diagnostico: 'Diagnóstico',
  firma_sello_medico: 'Firma y sello del médico',
}

/** Forma mínima necesaria para evaluar riesgo. Sirve para datos de form o filas de DB. */
export interface OrdenRiesgoInput {
  tipo: string
  obra_social?: string | null
  nivel?: number | null
  firma_paciente?: boolean | null
  diagnostico_cie10?: string | null
  firma_sello_medico?: boolean | null
}

export interface ResultadoRiesgo {
  enRiesgo: boolean
  faltantes: FaltanteDebito[]
}

function tieneTexto(v: string | null | undefined): boolean {
  return !!v && v.trim().length > 0
}

/**
 * Riesgo de débito derivado (no se persiste). Solo aplica a obra social, nivel 1.
 * El orden de `faltantes` es estable: firma_afiliado, diagnostico, firma_sello_medico.
 */
export function evaluarRiesgoOrden(orden: OrdenRiesgoInput): ResultadoRiesgo {
  const nivel = orden.nivel ?? 1
  if (orden.tipo !== 'obra_social' || nivel !== 1) {
    return { enRiesgo: false, faltantes: [] }
  }
  const faltantes: FaltanteDebito[] = []
  if (!orden.firma_paciente) faltantes.push('firma_afiliado')
  if (!tieneTexto(orden.diagnostico_cie10)) faltantes.push('diagnostico')
  if (!orden.firma_sello_medico) faltantes.push('firma_sello_medico')
  return { enRiesgo: faltantes.length > 0, faltantes }
}

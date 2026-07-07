/**
 * Completitud de la orden para PRESENTARLA a la obra social. Derivada, no se
 * persiste (mismo patrón que riesgo-debito.ts). Exige la identidad de
 * facturación; diagnóstico y firmas los cubre riesgo-debito, el plan es
 * informativo. Solo aplica a obra social.
 */
export type CampoFaltante =
  | 'nro_orden'
  | 'fecha_emision'
  | 'nro_afiliado'
  | 'nro_documento'
  | 'obra_social'
  | 'nombre_practica'
  | 'honorario'

export const CAMPO_FALTANTE_LABELS: Record<CampoFaltante, string> = {
  nro_orden: 'N° de orden',
  fecha_emision: 'Fecha de emisión',
  nro_afiliado: 'N° de afiliado',
  nro_documento: 'DNI',
  obra_social: 'Obra social',
  nombre_practica: 'Tipo de práctica',
  honorario: 'Honorario',
}

/** Forma mínima para evaluar: sirve para datos de form o filas de DB. */
export interface OrdenCompletitudInput {
  tipo: string
  nro_comprobante?: string | null
  token_osep?: string | null
  fecha_emision?: string | null
  nro_afiliado?: string | null
  nro_documento?: string | null
  obra_social?: string | null
  nombre_practica?: string | null
  honorario_calculado?: number | null
}

function tieneTexto(v: string | null | undefined): boolean {
  return !!v && v.trim().length > 0
}

export function evaluarCompletitud(
  orden: OrdenCompletitudInput,
): { completa: boolean; faltantes: CampoFaltante[] } {
  if (orden.tipo !== 'obra_social') {
    return { completa: true, faltantes: [] }
  }
  const faltantes: CampoFaltante[] = []
  if (!tieneTexto(orden.nro_comprobante) && !tieneTexto(orden.token_osep)) {
    faltantes.push('nro_orden')
  }
  if (!tieneTexto(orden.fecha_emision)) faltantes.push('fecha_emision')
  if (!tieneTexto(orden.nro_afiliado)) faltantes.push('nro_afiliado')
  if (!tieneTexto(orden.nro_documento)) faltantes.push('nro_documento')
  if (!tieneTexto(orden.obra_social)) faltantes.push('obra_social')
  if (!tieneTexto(orden.nombre_practica)) faltantes.push('nombre_practica')
  if (!(orden.honorario_calculado && orden.honorario_calculado > 0)) {
    faltantes.push('honorario')
  }
  return { completa: faltantes.length === 0, faltantes }
}

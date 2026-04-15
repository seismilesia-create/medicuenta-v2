import {
  PERIODOS,
  TIPOS_REPORTE,
  NIVEL_FILTRO,
  AGENTE_FILTRO,
  type ReportesFilters,
  type Periodo,
  type TipoReporte,
  type NivelFiltro,
  type AgenteFiltro,
} from '../types/reportes'

function isIn<T extends readonly string[]>(value: string | undefined, arr: T): value is T[number] {
  return !!value && (arr as readonly string[]).includes(value)
}

export function parseFilters(searchParams: Record<string, string | string[] | undefined>): ReportesFilters {
  const get = (key: string): string | undefined => {
    const v = searchParams[key]
    if (Array.isArray(v)) return v[0]
    return v
  }

  const periodo: Periodo = isIn(get('periodo'), PERIODOS) ? (get('periodo') as Periodo) : 'mes'
  const tipo: TipoReporte = isIn(get('tipo'), TIPOS_REPORTE) ? (get('tipo') as TipoReporte) : 'todas'
  const nivel: NivelFiltro = isIn(get('nivel'), NIVEL_FILTRO) ? (get('nivel') as NivelFiltro) : 'ambos'
  const agente: AgenteFiltro = isIn(get('agente'), AGENTE_FILTRO) ? (get('agente') as AgenteFiltro) : 'todos'

  const obra_social = get('os')
  const institucion = get('institucion')

  const fecha_desde = get('desde')
  const fecha_hasta = get('hasta')

  return {
    periodo,
    tipo,
    nivel,
    agente,
    obra_social: obra_social && obra_social !== 'all' ? obra_social : undefined,
    institucion: institucion && institucion !== 'all' ? institucion : undefined,
    fecha_desde: periodo === 'personalizado' ? fecha_desde : undefined,
    fecha_hasta: periodo === 'personalizado' ? fecha_hasta : undefined,
  }
}

export function resolveRango(filters: ReportesFilters, now: Date = new Date()): { desde: string; hasta: string } {
  const year = now.getFullYear()
  const month = now.getMonth()

  const fmt = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  if (filters.periodo === 'personalizado') {
    return {
      desde: filters.fecha_desde ?? fmt(new Date(year, month, 1)),
      hasta: filters.fecha_hasta ?? fmt(new Date(year, month + 1, 0)),
    }
  }

  const hasta = fmt(new Date(year, month + 1, 0))

  switch (filters.periodo) {
    case 'mes':
      return { desde: fmt(new Date(year, month, 1)), hasta }
    case '3meses':
      return { desde: fmt(new Date(year, month - 2, 1)), hasta }
    case '6meses':
      return { desde: fmt(new Date(year, month - 5, 1)), hasta }
    case 'anio':
      return { desde: fmt(new Date(year, 0, 1)), hasta }
  }
}

export function buildFiltersUrl(current: ReportesFilters, overrides: Partial<ReportesFilters>): string {
  const merged = { ...current, ...overrides }
  const params = new URLSearchParams()
  if (merged.periodo !== 'mes') params.set('periodo', merged.periodo)
  if (merged.tipo !== 'todas') params.set('tipo', merged.tipo)
  if (merged.nivel !== 'ambos') params.set('nivel', merged.nivel)
  if (merged.agente !== 'todos') params.set('agente', merged.agente)
  if (merged.obra_social) params.set('os', merged.obra_social)
  if (merged.institucion) params.set('institucion', merged.institucion)
  if (merged.periodo === 'personalizado') {
    if (merged.fecha_desde) params.set('desde', merged.fecha_desde)
    if (merged.fecha_hasta) params.set('hasta', merged.fecha_hasta)
  }
  const qs = params.toString()
  return qs ? `/reportes?${qs}` : '/reportes'
}

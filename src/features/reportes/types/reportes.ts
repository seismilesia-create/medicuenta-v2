import type { AgenteFacturador } from '@/features/ordenes/types/ordenes'
import type { MotivoDebito } from '@/features/debitos/types/debitos'

export const PERIODOS = ['mes', '3meses', '6meses', 'anio', 'personalizado'] as const
export type Periodo = (typeof PERIODOS)[number]

export const PERIODO_LABELS: Record<Periodo, string> = {
  mes: 'Este mes',
  '3meses': 'Últimos 3 meses',
  '6meses': 'Últimos 6 meses',
  anio: 'Este año',
  personalizado: 'Personalizado',
}

export const TIPOS_REPORTE = ['todas', 'consultas', 'cirugias'] as const
export type TipoReporte = (typeof TIPOS_REPORTE)[number]

export const TIPO_REPORTE_LABELS: Record<TipoReporte, string> = {
  todas: 'Todas',
  consultas: 'Solo consultas',
  cirugias: 'Solo cirugías',
}

export const NIVEL_FILTRO = ['ambos', '1', '2'] as const
export type NivelFiltro = (typeof NIVEL_FILTRO)[number]

export const NIVEL_FILTRO_LABELS: Record<NivelFiltro, string> = {
  ambos: 'Ambos niveles',
  '1': '1° Nivel',
  '2': '2° Nivel',
}

export const AGENTE_FILTRO = ['todos', 'circulo_medico', 'medical_group', 'comunidad'] as const
export type AgenteFiltro = (typeof AGENTE_FILTRO)[number]

export const APLICADO_POR_LABELS: Record<string, string> = {
  circulo_medico: 'Círculo Médico',
  institucion: 'Institución',
  medical_group: 'Medical Group',
  comunidad: 'Nosocomio Comunidad',
  obra_social: 'Obra Social',
  sin_dato: 'Sin dato',
}

export interface ReportesFilters {
  periodo: Periodo
  fecha_desde?: string
  fecha_hasta?: string
  obra_social?: string // undefined o 'all' = todas
  tipo: TipoReporte
  nivel: NivelFiltro
  agente: AgenteFiltro
  institucion?: string
}

export interface ReporteKPIs {
  facturado: number
  cobrado: number
  debitos: number
  plus: number
  cirugias2doSinLiquidar: {
    count: number
    monto: number
  }
  descuentoPorAgente: Record<AgenteFacturador, number>
}

export interface MonthPoint {
  key: string // YYYY-MM
  label: string // "Abr 26"
}

export interface TendenciaPoint extends MonthPoint {
  facturado: number
  cobrado: number
  debitos: number
}

export interface FacturacionPorOSPoint {
  obra_social: string
  monto: number
}

export interface DebitosPorMotivoPoint {
  motivo: MotivoDebito
  monto: number
  count: number
}

export interface DescuentosApiladosPoint extends MonthPoint {
  circulo_medico: number
  institucion: number
  medical_group: number
  comunidad: number
  obra_social: number
  sin_dato: number
}

export interface PlusMensualPoint extends MonthPoint {
  monto: number
}

export interface InstitucionPendientePoint {
  institucion: string
  monto: number
  count: number
}

export interface TablaMesRow extends MonthPoint {
  facturado: number
  cobrado: number
  debitos: number
  plus: number
  neto: number
}

export interface ReportesData {
  filters: ReportesFilters
  kpis: ReporteKPIs
  tendencia: TendenciaPoint[]
  facturacionPorOS: FacturacionPorOSPoint[]
  debitosPorMotivo: DebitosPorMotivoPoint[]
  descuentosApilados: DescuentosApiladosPoint[]
  plusMensual: PlusMensualPoint[]
  institucionPendiente: InstitucionPendientePoint[]
  tabla12Meses: TablaMesRow[]
  obrasSocialesDisponibles: string[]
  institucionesDisponibles: string[]
  rango: { desde: string; hasta: string }
}

export interface OrdenRow {
  estado: string
  honorario_calculado: number
  monto_particular: number
  monto_plus: number
  fecha_atencion: string
  obra_social: string | null
  agente_facturador: AgenteFacturador
  tipo: string
}

export interface CirugiaRow {
  estado: string
  total_calculado: number
  honorarios: number
  gastos: number
  fecha: string
  fecha_alta_paciente: string | null
  obra_social: string
  nivel: number
  agente_facturador: AgenteFacturador
  institucion: string | null
}

export interface DebitoRow {
  monto: number
  fecha: string
  motivo: MotivoDebito
  aplicado_por: string | null
}

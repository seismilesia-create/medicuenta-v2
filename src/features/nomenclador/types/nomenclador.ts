export type { Prestacion } from '@/features/ordenes/types/ordenes'

export interface CalculatorItem {
  id: number
  codigo: string
  detalle: string
  honorarios: number
  gastos: number
  total: number
  porcentajeHonorarios: number
  honorariosCalculados: number
  subtotal: number
}

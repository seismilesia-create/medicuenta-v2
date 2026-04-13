import { z } from 'zod'

// --- Enums ---

export const ESTADOS_LIQUIDACION = ['pendiente', 'parcial', 'pagado'] as const
export type EstadoLiquidacion = (typeof ESTADOS_LIQUIDACION)[number]

export const OBRAS_SOCIALES = [
  'OSEP',
  'PAMI',
  'Swiss Medical',
  'OSDE',
  'Galeno',
  'Medife',
  'Accord Salud',
  'OSPAT',
  'OSPIA',
  'Otra',
] as const
export type ObraSocial = (typeof OBRAS_SOCIALES)[number]

// --- Interfaces ---

export interface Liquidacion {
  id: string
  medico_id: string
  periodo_inicio: string
  periodo_fin: string
  obra_social: string | null
  monto_presentado: number
  monto_liquidado: number
  monto_debitado: number
  estado: EstadoLiquidacion
  observaciones: string | null
  created_at: string
  updated_at: string
}

// --- Zod Schemas ---

export const liquidacionSchema = z.object({
  periodo_inicio: z.string().min(1, 'Periodo inicio requerido'),
  periodo_fin: z.string().min(1, 'Periodo fin requerido'),
  obra_social: z.string().optional(),
  monto_presentado: z.coerce.number().min(0, 'Monto presentado debe ser mayor o igual a 0'),
  monto_liquidado: z.coerce.number().min(0).default(0),
  monto_debitado: z.coerce.number().min(0).default(0),
  observaciones: z.string().optional(),
})

export type LiquidacionFormData = z.infer<typeof liquidacionSchema>

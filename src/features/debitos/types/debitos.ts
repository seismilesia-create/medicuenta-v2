import { z } from 'zod'

// --- Enums ---

export const MOTIVOS_DEBITO = [
  'falta_token',
  'falta_firma',
  'falta_diagnostico',
  'no_autorizada',
  'error_codigo',
  'otro',
] as const
export type MotivoDebito = (typeof MOTIVOS_DEBITO)[number]

// --- Interfaces ---

export interface Debito {
  id: string
  medico_id: string
  orden_id: string | null
  liquidacion_id: string | null
  motivo: MotivoDebito
  motivo_detalle: string | null
  monto: number
  refacturable: boolean
  refacturado: boolean
  fecha: string
  created_at: string
}

// --- Labels ---

export const MOTIVO_LABELS: Record<MotivoDebito, string> = {
  falta_token: 'Falta de token',
  falta_firma: 'Falta de firma',
  falta_diagnostico: 'Falta de diagnóstico',
  no_autorizada: 'No autorizada',
  error_codigo: 'Error en código',
  otro: 'Otro motivo',
}

// --- Zod Schemas ---

export const debitoSchema = z.object({
  motivo: z.enum(MOTIVOS_DEBITO),
  motivo_detalle: z.string().optional(),
  monto: z.coerce.number().min(0, 'Monto debe ser mayor o igual a 0'),
  refacturable: z.boolean().default(false),
  fecha: z.string().min(1, 'Fecha requerida'),
})

export type DebitoFormData = z.infer<typeof debitoSchema>

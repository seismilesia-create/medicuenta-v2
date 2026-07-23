import { z } from 'zod'

// --- Enums ---

export const CONCEPTOS_COBRO = ['plus', 'consulta_particular'] as const
export type ConceptoCobro = (typeof CONCEPTOS_COBRO)[number]

export const MEDIOS_COBRO = ['efectivo', 'transferencia', 'debito_qr', 'mercadopago'] as const
export type MedioCobro = (typeof MEDIOS_COBRO)[number]

export const ESTADOS_COBRO = ['pendiente', 'cobrado', 'anulado', 'devuelto'] as const
export type EstadoCobro = (typeof ESTADOS_COBRO)[number]

export const MEDIO_LABELS: Record<MedioCobro, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito_qr: 'Débito / QR',
  mercadopago: 'MercadoPago',
}

export const CONCEPTO_LABELS: Record<ConceptoCobro, string> = {
  plus: 'Plus',
  consulta_particular: 'Consulta particular',
}

// --- Interfaces ---

export interface Cobro {
  id: string
  medico_id: string
  concepto: ConceptoCobro
  monto: number
  medio: MedioCobro
  estado: EstadoCobro
  orden_id: string | null
  turno_id: string | null
  sobreturno_id: string | null
  paciente_nombre: string | null
  paciente_dni: string | null
  mp_preference_id: string | null
  mp_payment_id: string | null
  registrado_por: string | null
  cobrado_at: string | null
  created_at: string
  updated_at: string
}

// --- Zod ---

export const generarLinkCobroSchema = z.object({
  monto: z.coerce.number().positive('El monto debe ser mayor a 0'),
  concepto: z.enum(CONCEPTOS_COBRO).default('plus'),
  pacienteNombre: z.string().trim().max(120).optional(),
  turnoId: z.string().uuid().optional(),
  // Regenerar el link de un cobro pendiente existente (p.ej. cambió el monto).
  cobroId: z.string().uuid().optional(),
})
export type GenerarLinkCobroInput = z.infer<typeof generarLinkCobroSchema>

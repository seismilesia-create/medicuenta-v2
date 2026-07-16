// src/features/admin/medicos/types.ts
import { z } from 'zod'

export interface MedicoFila {
  id: string
  nombre: string | null
  apellido: string | null
  especialidad: string | null
  email: string | null
  slug: string | null
  link: string | null
  cableadoActivo: boolean
}

export interface OnboardMedicoResult {
  slug: string
  link: string
  medicoId: string
}

export const editarMedicoSchema = z.object({
  nombre: z.string().trim().min(1, 'Nombre requerido'),
  apellido: z.string().trim().min(1, 'Apellido requerido'),
  especialidad: z.string().trim().optional().default(''),
  matricula: z.string().trim().optional().default(''),
  cuit: z.string().trim().optional().default(''),
  telefono: z.string().trim().optional().default(''),
  categoria_arancel: z.enum(['medica', 'especialista', 'oftalmologica', 'oftalmologica_recertificado']).optional(),
  atiende_interior: z.boolean().optional().default(false),
  numeroWhatsapp: z
    .string()
    .trim()
    .min(8, 'Número de WhatsApp inválido')
    .refine((v) => v.replace(/\D/g, '').length >= 10, 'Número de WhatsApp inválido'),
})

export type EditarMedicoInput = z.infer<typeof editarMedicoSchema>

export interface MedicoDetalle {
  nombre: string
  apellido: string
  especialidad: string
  matricula: string
  cuit: string
  telefono: string
  numeroWhatsapp: string
  slug: string | null
  categoria_arancel: 'medica' | 'especialista' | 'oftalmologica' | 'oftalmologica_recertificado' | '' // '' = sin categoría asignada
  atiende_interior: boolean
}

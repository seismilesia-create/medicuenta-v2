// src/features/admin/medicos/types.ts
import { z } from 'zod'

// El slug público: minúsculas, números y guiones (formato /c/<slug>).
const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const onboardMedicoSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.string().email('Email inválido')),
  nombre: z.string().trim().min(1, 'Nombre requerido'),
  apellido: z.string().trim().min(1, 'Apellido requerido'),
  especialidad: z.string().trim().optional().default(''),
  matricula: z.string().trim().optional().default(''),
  cuit: z.string().trim().optional().default(''),
  telefono: z.string().trim().optional().default(''),
  // Número de WhatsApp del médico, dígitos (puede venir con +, espacios o guiones).
  numeroWhatsapp: z
    .string()
    .trim()
    .min(8, 'Número de WhatsApp inválido')
    .refine((v) => v.replace(/\D/g, '').length >= 10, 'Número de WhatsApp inválido'),
  slug: z.string().trim().regex(slugRegex, 'Slug inválido (solo minúsculas, números y guiones)'),
})

export type OnboardMedicoInput = z.infer<typeof onboardMedicoSchema>

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

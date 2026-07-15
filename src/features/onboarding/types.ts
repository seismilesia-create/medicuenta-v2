import { z } from 'zod'
import { passwordSchema } from './password'
import { normalizarWhatsappAr } from '@/lib/whatsapp/numeroAr'

export const altaMedicoSchema = z
  .object({
    nombre: z.string().trim().min(1, 'Nombre requerido'),
    apellido: z.string().trim().min(1, 'Apellido requerido'),
    especialidad: z.string().trim().optional().default(''),
    matricula: z.string().trim().optional().default(''),
    cuit: z.string().trim().optional().default(''),
    telefono: z.string().trim().optional().default(''),
    email: z.string().trim().toLowerCase().pipe(z.string().email('Email inválido')),
    numeroWhatsapp: z
      .string()
      .trim()
      .refine((v) => normalizarWhatsappAr(v) !== null, 'Número de WhatsApp inválido (ej: 383 4222049)'),
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .refine((d) => d.password === d.passwordConfirm, {
    message: 'Las contraseñas no coinciden',
    path: ['passwordConfirm'],
  })

export type AltaMedicoInput = z.infer<typeof altaMedicoSchema>

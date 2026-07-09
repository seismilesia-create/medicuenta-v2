import { z } from 'zod'

// Contraseña: mínimo 8, con al menos una letra y un número (baseline usable para médicos).
const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'La contraseña debe incluir letras y números')

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
      .min(8, 'Número de WhatsApp inválido')
      .refine((v) => v.replace(/\D/g, '').length >= 10, 'Número de WhatsApp inválido'),
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .refine((d) => d.password === d.passwordConfirm, {
    message: 'Las contraseñas no coinciden',
    path: ['passwordConfirm'],
  })

export type AltaMedicoInput = z.infer<typeof altaMedicoSchema>

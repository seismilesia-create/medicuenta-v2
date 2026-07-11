import { z } from 'zod'

// Contraseña: mínimo 8, con al menos una letra y un número (baseline usable para médicos).
export const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'La contraseña debe incluir letras y números')

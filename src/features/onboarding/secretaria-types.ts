import { z } from 'zod'
import { passwordSchema } from './password'

export const altaSecretariaSchema = z
  .object({
    nombre: z.string().trim().min(1, 'Nombre requerido'),
    apellido: z.string().trim().min(1, 'Apellido requerido'),
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .refine((d) => d.password === d.passwordConfirm, {
    message: 'Las contraseñas no coinciden',
    path: ['passwordConfirm'],
  })

export type AltaSecretariaInput = z.infer<typeof altaSecretariaSchema>

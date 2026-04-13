import { z } from 'zod'
import { OBRAS_SOCIALES } from '@/features/ordenes/types/ordenes'

// --- Interface ---

export interface Perfil {
  id: string
  nombre: string | null
  apellido: string | null
  matricula: string | null
  rol: string
  circulo_medico: boolean
  especialidad: string | null
  cuit: string | null
  email: string | null
  telefono: string | null
  obras_sociales: string[]
}

// --- Zod Schema ---

export const perfilUpdateSchema = z.object({
  nombre: z.string().min(1, 'Nombre requerido'),
  apellido: z.string().min(1, 'Apellido requerido'),
  matricula: z.string().optional(),
  cuit: z.string().optional(),
  telefono: z.string().optional(),
  especialidad: z.string().optional(),
  obras_sociales: z.array(z.string()).default([]),
})

export type PerfilFormData = z.infer<typeof perfilUpdateSchema>

export { OBRAS_SOCIALES }

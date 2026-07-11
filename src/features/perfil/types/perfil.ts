import { z } from 'zod'

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
  telefono: string | null
}

// --- Zod Schema ---

export const perfilUpdateSchema = z.object({
  nombre: z.string().min(1, 'Nombre requerido'),
  apellido: z.string().min(1, 'Apellido requerido'),
  matricula: z.string().optional(),
  cuit: z.string().optional(),
  telefono: z.string().optional(),
  especialidad: z.string().optional(),
})

export type PerfilFormData = z.infer<typeof perfilUpdateSchema>

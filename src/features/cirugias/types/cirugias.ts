import { z } from 'zod'

// Re-export from ordenes
export {
  OBRAS_SOCIALES,
  AGENTES_FACTURADORES,
  AGENTE_LABELS,
  type AgenteFacturador,
} from '@/features/ordenes/types/ordenes'
import { AGENTES_FACTURADORES, type AgenteFacturador } from '@/features/ordenes/types/ordenes'

// --- Enums ---

export const ESTADOS_CIRUGIA = ['borrador', 'presentada', 'aprobada', 'debitada'] as const
export type EstadoCirugia = (typeof ESTADOS_CIRUGIA)[number]

export const NIVELES_CIRUGIA = [1, 2] as const
export type NivelCirugia = (typeof NIVELES_CIRUGIA)[number]

export const NIVEL_LABELS: Record<NivelCirugia, string> = {
  1: '1° Nivel (ambulatoria en consultorio)',
  2: '2° Nivel (en institución)',
}

export const TIPOS_ANESTESIA = [
  'Local',
  'Regional',
  'General',
  'Sedacion',
  'Raquidea',
  'Peridural',
] as const
export type TipoAnestesia = (typeof TIPOS_ANESTESIA)[number]

// --- Interfaces ---

export interface PracticaAdicional {
  codigo: string
  detalle: string
  honorarios: number
  gastos: number
  total: number
}

export interface Cirugia {
  id: string
  medico_id: string
  nombre_paciente: string
  fecha: string
  obra_social: string
  codigo_practica: string
  nombre_practica: string
  honorarios: number
  gastos: number
  total: number
  estado: EstadoCirugia
  nivel: NivelCirugia
  agente_facturador: AgenteFacturador
  observaciones: string | null
  ayudante: string | null
  anestesiologo: string | null
  instrumentador: string | null
  tipo_anestesia: string | null
  duracion_minutos: number | null
  institucion: string | null
  sala: string | null
  practicas_adicionales: PracticaAdicional[]
  total_calculado: number
  created_at: string
  updated_at: string
}

// --- Filters ---

export interface CirugiaFilters {
  obra_social?: string
  estado?: EstadoCirugia
  fecha_desde?: string
  fecha_hasta?: string
  busqueda?: string
}

// --- Zod Schema ---

const practicaAdicionalSchema = z.object({
  codigo: z.string(),
  detalle: z.string(),
  honorarios: z.coerce.number().min(0),
  gastos: z.coerce.number().min(0),
  total: z.coerce.number().min(0),
})

export const cirugiaSchema = z.object({
  nombre_paciente: z.string().min(2, 'Nombre del paciente requerido'),
  fecha: z.string().min(1, 'Fecha requerida'),
  obra_social: z.string().min(1, 'Obra social requerida'),
  codigo_practica: z.string().min(1, 'Practica principal requerida'),
  nombre_practica: z.string().optional(),
  honorarios: z.coerce.number().min(0).default(0),
  gastos: z.coerce.number().min(0).default(0),
  total: z.coerce.number().min(0).default(0),
  observaciones: z.string().optional(),
  // Nivel y agente facturador
  nivel: z.coerce.number().pipe(z.union([z.literal(1), z.literal(2)])).default(2),
  agente_facturador: z.enum(AGENTES_FACTURADORES).default('circulo_medico'),
  // Equipo quirurgico (opcionales)
  ayudante: z.string().optional(),
  anestesiologo: z.string().optional(),
  instrumentador: z.string().optional(),
  // Anestesia y lugar (opcionales)
  tipo_anestesia: z.string().optional(),
  duracion_minutos: z.coerce.number().min(0).optional(),
  institucion: z.string().optional(),
  sala: z.string().optional(),
  // Practicas adicionales
  practicas_adicionales: z.array(practicaAdicionalSchema).default([]),
}).refine(
  (data) => data.nivel !== 2 || (data.institucion && data.institucion.trim().length > 0),
  { message: 'Institución es requerida para cirugías de 2° Nivel', path: ['institucion'] },
)

export type CirugiaFormData = z.infer<typeof cirugiaSchema>

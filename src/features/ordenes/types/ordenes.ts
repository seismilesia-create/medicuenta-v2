import { z } from 'zod'

// --- Enums ---

export const TIPOS_ATENCION = ['obra_social', 'particular'] as const
export type TipoAtencion = (typeof TIPOS_ATENCION)[number]

export const ESTADOS_ORDEN = ['borrador', 'presentada', 'aprobada', 'debitada'] as const
export type EstadoOrden = (typeof ESTADOS_ORDEN)[number]

export const OBRAS_SOCIALES = [
  'OSEP',
  'PAMI',
  'Swiss Medical',
  'OSDE',
  'Galeno',
  'Medife',
  'Accord Salud',
  'OSPAT',
  'OSPIA',
  'Otra',
] as const
export type ObraSocial = (typeof OBRAS_SOCIALES)[number]

// --- Interfaces ---

export interface Orden {
  id: string
  medico_id: string
  tipo: TipoAtencion
  nombre_paciente: string
  nro_afiliado: string | null
  obra_social: string | null
  token_osep: string | null
  firma_paciente: boolean
  codigo_practica: string | null
  nombre_practica: string | null
  diagnostico_cie10: string | null
  honorario_calculado: number
  monto_particular: number
  monto_plus: number
  estado: EstadoOrden
  fecha_atencion: string
  observaciones: string | null
  created_at: string
  updated_at: string
}

export interface Prestacion {
  id: number
  codigo: string
  detalle: string
  honorarios: number | null
  gastos: number | null
  total: number | null
  seccion: string
  categoria: string | null
  obra_social: string
}

// --- Filtros ---

export interface OrdenFilters {
  tipo?: TipoAtencion
  obra_social?: string
  estado?: EstadoOrden
  fecha_desde?: string
  fecha_hasta?: string
  busqueda?: string
}

// --- Dashboard Stats ---

export interface DashboardStats {
  facturado: number
  cobrado: number
  pendiente: number
  perdido: number
}

// --- Zod Schemas ---

export const ordenBaseSchema = z.object({
  tipo: z.enum(TIPOS_ATENCION),
  nombre_paciente: z.string().min(2, 'Nombre del paciente requerido'),
  fecha_atencion: z.string().min(1, 'Fecha requerida'),
  observaciones: z.string().optional(),
  monto_plus: z.coerce.number().min(0).default(0),
})

export const ordenObraSocialSchema = ordenBaseSchema.extend({
  tipo: z.literal('obra_social'),
  obra_social: z.string().min(1, 'Obra social requerida'),
  nro_afiliado: z.string().min(1, 'Numero de afiliado requerido'),
  token_osep: z.string().optional(),
  firma_paciente: z.boolean().default(false),
  codigo_practica: z.string().min(1, 'Codigo de practica requerido'),
  nombre_practica: z.string().optional(),
  diagnostico_cie10: z.string().optional(),
  honorario_calculado: z.coerce.number().min(0).default(0),
})

export const ordenParticularSchema = ordenBaseSchema.extend({
  tipo: z.literal('particular'),
  nombre_practica: z.string().min(1, 'Descripcion de la prestacion requerida'),
  monto_particular: z.coerce.number().min(0, 'Monto debe ser mayor a 0'),
})

export const ordenSchema = z.discriminatedUnion('tipo', [
  ordenObraSocialSchema,
  ordenParticularSchema,
])

export type OrdenFormData = z.infer<typeof ordenSchema>

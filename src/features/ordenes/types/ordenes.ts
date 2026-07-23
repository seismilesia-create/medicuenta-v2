import { z } from 'zod'

// --- Enums ---

export const TIPOS_ATENCION = ['obra_social', 'particular'] as const
export type TipoAtencion = (typeof TIPOS_ATENCION)[number]

export const ESTADOS_ORDEN = ['borrador', 'presentada', 'aprobada', 'debitada'] as const
export type EstadoOrden = (typeof ESTADOS_ORDEN)[number]

export function esEstadoOrden(v: string): v is EstadoOrden {
  return (ESTADOS_ORDEN as readonly string[]).includes(v)
}

/**
 * Transiciones de estado permitidas. Desde borrador se presenta (manual o vía
 * emitirPlanilla); una vez presentada cicla entre presentada/aprobada/debitada
 * según responda la OS. NO se vuelve a borrador desde un estado presentado: la
 * presentación es un snapshot de lo entregado físicamente al Círculo y volver
 * atrás lo desincronizaría (des-presentar sería un flujo dedicado aparte).
 */
export const TRANSICIONES_ORDEN: Record<EstadoOrden, EstadoOrden[]> = {
  borrador: ['presentada'],
  presentada: ['aprobada', 'debitada'],
  aprobada: ['presentada', 'debitada'],
  debitada: ['presentada', 'aprobada'],
}

/** ¿Se puede pasar de `desde` a `hasta`? (misma → misma = no-op permitido). */
export function transicionOrdenPermitida(desde: EstadoOrden, hasta: EstadoOrden): boolean {
  return desde === hasta || TRANSICIONES_ORDEN[desde].includes(hasta)
}

export const AGENTES_FACTURADORES = ['circulo_medico', 'medical_group', 'comunidad'] as const
export type AgenteFacturador = (typeof AGENTES_FACTURADORES)[number]

// Nivel 1 = consulta / práctica ambulatoria (foto). Nivel 2 = foja quirúrgica (voz).
export const NIVELES = [1, 2] as const
export type Nivel = (typeof NIVELES)[number]

export const ROLES_MEDICO = ['cirujano_principal', 'ayudante'] as const
export type RolMedico = (typeof ROLES_MEDICO)[number]

export const ROL_MEDICO_LABELS: Record<RolMedico, string> = {
  cirujano_principal: 'Cirujano principal',
  ayudante: 'Ayudante',
}

export const AGENTE_LABELS: Record<AgenteFacturador, string> = {
  circulo_medico: 'Círculo Médico',
  medical_group: 'Medical Group',
  comunidad: 'Nosocomio de la Comunidad',
}

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
  codigo_os: number | null
  token_osep: string | null
  firma_paciente: boolean
  firma_sello_medico: boolean
  faltantes_confirmados_at: string | null
  codigo_practica: string | null
  nombre_practica: string | null
  diagnostico_cie10: string | null
  honorario_calculado: number
  monto_particular: number
  monto_plus: number
  estado: EstadoOrden
  agente_facturador: AgenteFacturador
  fecha_atencion: string
  observaciones: string | null
  // Campos adicionales (OCR / orden completa)
  nro_documento: string | null
  nro_comprobante: string | null
  grupo_afiliado: string | null
  fecha_vencimiento: string | null
  cantidad: number | null
  medico_solicitante: string | null
  horario_realizacion: string | null
  // Captura completa de la orden OSEP
  delegacion: string | null
  titulo_autorizacion: string | null
  nro_internacion: string | null
  fecha_solicitud: string | null
  fecha_prescripcion: string | null
  fecha_emision: string | null
  hora_emision: string | null
  titular_nombre: string | null
  cobertura: string | null
  parentesco: string | null
  domicilio: string | null
  tipo_documento: string | null
  alias: string | null
  cara: string | null
  pieza: string | null
  forma_pago: string | null
  cod_pago: string | null
  origen: string | null
  arancelista: string | null
  cajero: string | null
  total_cargo_afiliado: number | null
  matricula_profesional: string | null
  profesional: string | null
  entidad: string | null
  responsable: string | null
  imagen_comprobante: string | null
  // OCR crudo de la foto (para reproceso). { version, datos: OrdenExtraida }.
  datos_ocr: unknown | null
  // Nivel (1 = ambulatoria/consulta, 2 = foja quirúrgica)
  nivel: number
  cirugia_adicional: string | null
  cirugia_adicional_codigo: string | null
  cirugia_adicional_honorario: number | null
  rol_medico: string | null
  // Correlación 3C: turno de la agenda del que salió esta orden (nullable).
  turno_id: string | null
  presentacion_id: string | null
  created_at: string
  updated_at: string
}

export interface Presentacion {
  id: string
  medico_id: string
  periodo_mes: string
  obra_social: string
  agente_facturador: AgenteFacturador
  fecha_emision: string
  cantidad_ordenes: number
  monto_total: number
  created_at: string
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
  codigo_os?: number
  estado?: EstadoOrden
  agente_facturador?: AgenteFacturador
  fecha_desde?: string
  fecha_hasta?: string
  busqueda?: string
}

// --- Zod Schemas ---

export const ordenBaseSchema = z.object({
  tipo: z.enum(TIPOS_ATENCION),
  nombre_paciente: z.string().min(2, 'Nombre del paciente requerido'),
  fecha_atencion: z.string().min(1, 'Fecha requerida'),
  observaciones: z.string().optional(),
  monto_plus: z.coerce.number().min(0).default(0),
  agente_facturador: z.enum(AGENTES_FACTURADORES).default('circulo_medico'),
  // Campos adicionales (OCR / orden completa) — todos opcionales
  nro_documento: z.string().optional(),
  nro_comprobante: z.string().optional(),
  grupo_afiliado: z.string().optional(),
  fecha_vencimiento: z.string().optional(),
  cantidad: z.coerce.number().min(0).optional(),
  medico_solicitante: z.string().optional(),
  horario_realizacion: z.string().optional(),
  // Captura completa de la orden OSEP
  delegacion: z.string().optional(),
  titulo_autorizacion: z.string().optional(),
  nro_internacion: z.string().optional(),
  fecha_solicitud: z.string().optional(),
  fecha_prescripcion: z.string().optional(),
  fecha_emision: z.string().optional(),
  hora_emision: z.string().optional(),
  titular_nombre: z.string().optional(),
  cobertura: z.string().optional(),
  parentesco: z.string().optional(),
  domicilio: z.string().optional(),
  tipo_documento: z.string().optional(),
  alias: z.string().optional(),
  cara: z.string().optional(),
  pieza: z.string().optional(),
  forma_pago: z.string().optional(),
  cod_pago: z.string().optional(),
  origen: z.string().optional(),
  arancelista: z.string().optional(),
  cajero: z.string().optional(),
  total_cargo_afiliado: z.coerce.number().min(0).optional(),
  matricula_profesional: z.string().optional(),
  profesional: z.string().optional(),
  entidad: z.string().optional(),
  responsable: z.string().optional(),
  imagen_comprobante: z.string().optional(),
  datos_ocr: z.unknown().optional(),
  // Nivel + foja quirúrgica (Nivel 2)
  nivel: z.coerce.number().optional(),
  cirugia_adicional: z.string().optional(),
  cirugia_adicional_codigo: z.string().optional(),
  cirugia_adicional_honorario: z.coerce.number().min(0).optional(),
  rol_medico: z.enum(ROLES_MEDICO).optional(),
  // Correlación 3C: id del turno vinculado (uuid). '' del form → undefined.
  turno_id: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.string().uuid().optional(),
  ),
})

export const ordenObraSocialSchema = ordenBaseSchema.extend({
  tipo: z.literal('obra_social'),
  obra_social: z.string().min(1, 'Obra social requerida'),
  codigo_os: z.coerce.number().int().optional(),
  nro_afiliado: z.string().optional(),
  token_osep: z.string().optional(),
  firma_paciente: z.boolean().default(false),
  firma_sello_medico: z.boolean().default(false),
  codigo_practica: z.string().optional(),
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

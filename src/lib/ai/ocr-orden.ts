import { z } from 'zod'

/**
 * Schema único de extracción OCR de una orden médica (OSEP y similares).
 * Compartido por la ruta /api/ocr-orden y la tool analizar_imagen_orden.
 * Solo depende de zod → seguro de importar desde cliente o servidor.
 */
export const ordenExtraidaSchema = z.object({
  es_orden_medica: z.boolean(),
  motivo_rechazo: z.string().nullable().describe('Si es_orden_medica=false, por qué no lo es'),

  // Paciente / afiliado
  paciente: z.string().nullable().describe('Apellido y nombre del BENEFICIARIO (no el titular si difieren)'),
  nro_documento: z.string().nullable().describe('N° de Documento / DNI del beneficiario'),
  obra_social: z.string().nullable(),
  nro_afiliado: z.string().nullable().describe('N° de Afiliado (sin el grupo)'),
  grupo_afiliado: z.string().nullable().describe('Grupo del afiliado (ej: "01", "02"), va junto al N° afiliado'),

  // Comprobante / práctica
  nro_comprobante: z.string().nullable().describe('N° de Comprobante de la orden (identificador único, suele tener 8 dígitos)'),
  codigo_practica: z.string().nullable().describe('Código de la práctica (ej: 01-420101-01)'),
  nombre_practica: z.string().nullable().describe('Descripción de la práctica'),
  cantidad: z.number().nullable().describe('Cantidad de la práctica (campo "Cant.", normalmente 1)'),
  importe: z.number().nullable().describe('Importe / Total a Cargo Afiliado en pesos (ej: 2026.31). Solo el número, sin símbolo.'),
  diagnostico: z.string().nullable(),

  // Fechas (la orden suele tener 4 — extraé las dos que importan)
  fecha_realizacion: z.string().nullable().describe('Fecha de REALIZACIÓN/atención en YYYY-MM-DD. Es la fecha en que se hizo la práctica (NO la de solicitud ni vencimiento). Si no figura, usá la de emisión.'),
  fecha_vencimiento: z.string().nullable().describe('Fecha de Vencimiento de la orden en YYYY-MM-DD'),
  horario_realizacion: z.string().nullable().describe('Hora de realización en HH:MM si figura'),

  // Profesional / facturación
  medico_solicitante: z.string().nullable().describe('Médico prescriptor / profesional'),
  agente_facturador: z
    .enum(['circulo_medico', 'medical_group', 'comunidad'])
    .nullable()
    .describe('Inferido del campo "Responsable": CÍRCULO MÉDICO→circulo_medico, MEDICAL GROUP→medical_group, COMUNIDAD→comunidad. Si no figura, null.'),

  // OSEP
  token_osep: z.string().nullable().describe('Token de 6 dígitos numéricos. Las órdenes electrónicas (Web Service) pueden NO tenerlo → null en ese caso'),
  firma_paciente: z.boolean().nullable(),

  observaciones: z.string().nullable(),
  confianza: z.enum(['alta', 'media', 'baja']),
  campos_dudosos: z.array(z.string()).describe('Lista de campos con baja confianza'),
})

export type OrdenExtraida = z.infer<typeof ordenExtraidaSchema>

export const OCR_ORDEN_PROMPT = `Analizá esta imagen de una orden médica argentina (típicamente OSEP - Catamarca). Extraé TODOS los campos que puedas leer.

Reglas:
- **Beneficiario vs Titular**: "paciente" = el BENEFICIARIO (quien recibe la atención). Si titular y beneficiario difieren, usá el beneficiario.
- **N° Documento** = DNI del beneficiario.
- **Afiliado**: separá "Grupo" (ej: 01) de "N° Afiliado" (ej: 033883) en sus campos.
- **N° Comprobante**: el número largo (≈8 dígitos) que identifica la orden. NO lo confundas con el token.
- **Importe**: el "Total a Cargo Afiliado" o "Importe" — devolvé solo el número (ej: 2026.31), sin "$" ni separador de miles.
- **Fechas**: la orden tiene varias (Solicitud, Vencimiento, Emisión, Realización). fecha_realizacion = la de realización/atención (si no está, la de emisión). fecha_vencimiento = la de vencimiento. Formato YYYY-MM-DD. Las fechas argentinas son DD/MM/YYYY.
- **Agente facturador**: leelo del campo "Responsable" (ej: "CÍRCULO MÉDICO DE CATAMARCA" → circulo_medico).
- **Token OSEP** = 6 dígitos numéricos. OJO: las órdenes electrónicas ("COMPROBANTE AUTORIZACIÓN", "Web Service") suelen NO tener token → dejá token_osep en null y usá el N° de Comprobante como identificador.
- Intentá leer letra manuscrita.
- Para cada campo del que NO estés seguro, agregalo a campos_dudosos.
- Confianza "alta" = casi todo legible sin ambigüedad; "media" = algunos campos a verificar; "baja" = mucha incertidumbre.
- Si la imagen NO es una orden médica: es_orden_medica=false + motivo_rechazo breve.`

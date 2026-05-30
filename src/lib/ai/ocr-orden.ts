import { z } from 'zod'

/**
 * Schema único de extracción OCR de una orden médica (OSEP y similares).
 * Compartido por la ruta /api/ocr-orden y la tool analizar_imagen_orden.
 * Solo depende de zod → seguro de importar desde cliente o servidor.
 *
 * IMPORTANTE: NO usar .nullable()/.optional() (union types). Claude limita a 16
 * parámetros con uniones; superarlo tira el error de "too many union parameters".
 * En su lugar, campos requeridos con valor vacío ("" / 0) cuando no se detectan.
 */
export const ordenExtraidaSchema = z.object({
  es_orden_medica: z.boolean(),
  motivo_rechazo: z.string().describe('Si es_orden_medica=false, por qué no lo es. Si es válida, cadena vacía.'),

  // Paciente / afiliado
  paciente: z.string().describe('Apellido y nombre del BENEFICIARIO (no el titular si difieren). "" si no se lee.'),
  nro_documento: z.string().describe('N° de Documento / DNI del beneficiario. "" si no figura.'),
  obra_social: z.string().describe('Obra social (ej: OSEP). "" si no se identifica.'),
  nro_afiliado: z.string().describe('N° de Afiliado (sin el grupo). "" si no figura.'),
  grupo_afiliado: z.string().describe('Grupo del afiliado (ej: "01", "02"). "" si no figura.'),

  // Comprobante / práctica
  nro_comprobante: z.string().describe('N° de Comprobante de la orden (identificador único, ~8 dígitos). "" si no figura.'),
  codigo_practica: z.string().describe('Código de la práctica (ej: 01-420101-01). "" si no figura.'),
  nombre_practica: z.string().describe('Descripción de la práctica. "" si no figura.'),
  cantidad: z.number().describe('Cantidad de la práctica (campo "Cant.", normalmente 1). 0 si no figura.'),
  importe: z.number().describe('Importe / Total a Cargo Afiliado en pesos (ej: 2026.31). Solo el número. 0 si no figura.'),
  diagnostico: z.string().describe('Diagnóstico. "" si no figura.'),

  // Fechas (la orden suele tener 4 — extraé las dos que importan)
  fecha_realizacion: z.string().describe('Fecha de REALIZACIÓN/atención en YYYY-MM-DD (NO solicitud ni vencimiento). Si no figura, la de emisión, o "".'),
  fecha_vencimiento: z.string().describe('Fecha de Vencimiento de la orden en YYYY-MM-DD. "" si no figura.'),
  horario_realizacion: z.string().describe('Hora de realización en HH:MM si figura, o "".'),

  // Profesional / facturación
  medico_solicitante: z.string().describe('Médico prescriptor / profesional. "" si no figura.'),
  agente_facturador: z
    .enum(['circulo_medico', 'medical_group', 'comunidad', ''])
    .describe('Inferido del campo "Responsable": CÍRCULO MÉDICO→circulo_medico, MEDICAL GROUP→medical_group, COMUNIDAD→comunidad. "" si no figura.'),

  // OSEP
  token_osep: z.string().describe('Token de 6 dígitos numéricos. Las órdenes electrónicas (Web Service) pueden NO tenerlo → "" en ese caso.'),
  firma_paciente: z.boolean().describe('true si hay firma del afiliado, false si no.'),

  observaciones: z.string().describe('Notas adicionales relevantes, o "".'),
  confianza: z.enum(['alta', 'media', 'baja']),
  campos_dudosos: z.array(z.string()).describe('Lista de campos con baja confianza'),
})

export type OrdenExtraida = z.infer<typeof ordenExtraidaSchema>

export const OCR_ORDEN_PROMPT = `Analizá esta imagen de una orden médica argentina (típicamente OSEP - Catamarca). Extraé TODOS los campos que puedas leer.

Reglas de valores vacíos: si un campo de texto no se lee o no figura, devolvé cadena vacía "". Para campos numéricos sin valor, devolvé 0. Para agente_facturador sin dato, "". NO inventes datos.

Reglas de lectura:
- **Beneficiario vs Titular**: "paciente" = el BENEFICIARIO (quien recibe la atención). Si titular y beneficiario difieren, usá el beneficiario.
- **N° Documento** = DNI del beneficiario.
- **Afiliado**: separá "Grupo" (ej: 01) de "N° Afiliado" (ej: 033883) en sus campos.
- **N° Comprobante**: el número largo (≈8 dígitos) que identifica la orden. NO lo confundas con el token.
- **Importe**: el "Total a Cargo Afiliado" o "Importe" — solo el número (ej: 2026.31), sin "$" ni separador de miles.
- **Fechas**: la orden tiene varias (Solicitud, Vencimiento, Emisión, Realización). fecha_realizacion = la de realización/atención (si no está, la de emisión). fecha_vencimiento = la de vencimiento. Formato YYYY-MM-DD. Las fechas argentinas son DD/MM/YYYY.
- **Agente facturador**: leelo del campo "Responsable" (ej: "CÍRCULO MÉDICO DE CATAMARCA" → circulo_medico).
- **Token OSEP** = 6 dígitos numéricos. OJO: las órdenes electrónicas ("COMPROBANTE AUTORIZACIÓN", "Web Service") suelen NO tener token → dejá token_osep en "" y usá el N° de Comprobante como identificador.
- Intentá leer letra manuscrita.
- Para cada campo del que NO estés seguro, agregalo a campos_dudosos.
- Confianza "alta" = casi todo legible sin ambigüedad; "media" = algunos campos a verificar; "baja" = mucha incertidumbre.
- Si la imagen NO es una orden médica: es_orden_medica=false + motivo_rechazo breve.`

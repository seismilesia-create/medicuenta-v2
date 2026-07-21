import { z } from 'zod'

/**
 * Schema único de extracción OCR de una orden médica OSEP — CAPTURA COMPLETA.
 * Compartido por la ruta /api/ocr-orden y la tool analizar_imagen_orden.
 * Solo depende de zod → seguro de importar desde cliente o servidor.
 *
 * IMPORTANTE: NO usar .nullable()/.optional() (union types). Claude limita a 16
 * parámetros con uniones. Todos los campos son requeridos con valor vacío
 * ("" / 0) cuando no se detectan; el modelo igual devuelve vacío.
 */
export const ordenExtraidaSchema = z.object({
  es_orden_medica: z.boolean(),
  motivo_rechazo: z.string().describe('Si es_orden_medica=false, por qué. Si es válida, "".'),

  // Cabecera
  delegacion: z.string().describe('N° de Delegación. "" si no figura.'),
  titulo_autorizacion: z.string().describe('Título del comprobante (ej: "CONSUMO DE AUT. N°", "COMPROBANTE AUTORIZACIÓN"). "" si no figura.'),
  nro_comprobante: z.string().describe('N° de Comprobante (~8 dígitos, identificador único). "" si no figura.'),
  nro_internacion: z.string().describe('N° de Internación. "" si no figura (suele ser 0).'),

  // Fechas (YYYY-MM-DD; las fechas argentinas son DD/MM/YYYY)
  fecha_solicitud: z.string().describe('Fecha de Solicitud. "" si no figura.'),
  fecha_vencimiento: z.string().describe('Fecha de Vencimiento. "" si no figura.'),
  fecha_prescripcion: z.string().describe('Fecha de Prescripción (suele estar vacía). "" si no figura.'),
  fecha_emision: z.string().describe('Fecha de Emisión. "" si no figura.'),
  hora_emision: z.string().describe('Hora de Emisión en HH:MM. "" si no figura.'),

  // Titular / afiliado
  titular_nombre: z.string().describe('Apellido y Nombre del TITULAR. "" si no figura.'),
  medico_solicitante: z.string().describe('Prescriptor / médico solicitante (suele estar vacío). "" si no figura.'),
  grupo_afiliado: z.string().describe('Grupo del afiliado (ej: "01"). "" si no figura.'),
  nro_afiliado: z.string().describe('N° de Afiliado (sin el grupo). "" si no figura.'),

  // Beneficiario
  paciente: z.string().describe('Apellido y Nombre del BENEFICIARIO (quien recibe la atención). "" si no se lee.'),
  cobertura: z.string().describe('Cobertura (ej: "COBERTURA GENERAL"). "" si no figura.'),
  parentesco: z.string().describe('Parentesco (ej: "00"). "" si no figura.'),

  // Documento
  domicilio: z.string().describe('Domicilio del beneficiario. "" si no figura.'),
  tipo_documento: z.string().describe('Tipo de documento (ej: "DNI"). "" si no figura.'),
  nro_documento: z.string().describe('N° de Documento / DNI. "" si no figura.'),

  // Obra social
  obra_social: z.string().describe('Obra social (ej: OSEP). "" si no se identifica.'),

  // Práctica
  codigo_practica: z.string().describe('Código de la práctica (ej: 01-420101-01). "" si no figura.'),
  alias: z.string().describe('Alias de la práctica (suele estar vacío). "" si no figura.'),
  nombre_practica: z.string().describe('Descripción de la práctica. "" si no figura.'),
  cantidad: z.number().describe('Cantidad (campo "Cant.", normalmente 1). 0 si no figura.'),
  cara: z.string().describe('Cara (odontología, suele estar vacío). "" si no figura.'),
  pieza: z.string().describe('Pieza (odontología). "" si no figura.'),
  importe: z.number().describe('Importe de la práctica en pesos (solo el número). 0 si no figura.'),

  // Pago
  forma_pago: z.string().describe('Forma/s de Pago (ej: "Contado", "Posnet Físico"). "" si no figura.'),
  cod_pago: z.string().describe('Código de pago "Cod." (solo aparece si es posnet físico). "" si no figura.'),
  origen: z.string().describe('Origen (ej: "Prestador", "Web Service"). "" si no figura.'),

  // Diagnóstico / arancel — SON CAMPOS DISTINTOS, no los confundas
  diagnostico: z.string().describe('Diagnóstico (suele estar VACÍO). NO pongas acá el arancelista. "" si no figura.'),
  arancelista: z.string().describe('Arancelista (ej: "PASTEUREREYES", "FCOLONSALTA"). "" si no figura.'),
  cajero: z.string().describe('Cajero. "" si no figura.'),

  // Total
  total_cargo_afiliado: z.number().describe('Total a Cargo Afiliado en pesos (solo el número). 0 si no figura.'),

  // Realización
  fecha_realizacion: z.string().describe('Fecha de Realización/atención en YYYY-MM-DD (NO solicitud ni vencimiento). Si no está, la de emisión, o "".'),
  horario_realizacion: z.string().describe('Hora de Realización en HH:MM. "" si no figura.'),

  // Profesional
  matricula_profesional: z.string().describe('Matrícula Profesional (ej: "1735"). "" si no figura.'),
  profesional: z.string().describe('Apellido y Nombre del Profesional que realizó la práctica. "" si no figura.'),
  entidad: z.string().describe('Entidad (ej: "SANATORIO PASTEUR S.A."). "" si no figura.'),
  responsable: z.string().describe('Responsable tal como figura (ej: "CIRCULO MEDICO DE CATAMARCA"). "" si no figura.'),
  agente_facturador: z
    .enum(['circulo_medico', 'medical_group', 'comunidad', ''])
    .describe('Inferido del Responsable: CÍRCULO MÉDICO→circulo_medico, MEDICAL GROUP→medical_group, COMUNIDAD→comunidad. "" si no figura.'),

  // OSEP
  token_osep: z.string().describe('Token de 6 dígitos. Las órdenes electrónicas (Web Service) pueden NO tenerlo → "".'),
  firma_paciente: z.boolean().describe('true si hay firma del afiliado, false si no.'),
  firma_sello_medico: z.boolean().describe('true si hay firma Y sello del médico en la orden, false si no.'),

  observaciones: z.string().describe('Notas adicionales relevantes, o "".'),
  no_encontrados: z
    .array(z.string())
    .describe('Claves del núcleo (nro_comprobante, fecha_emision, fecha_realizacion, paciente, nro_documento, nro_afiliado, cobertura, obra_social, nombre_practica, codigo_practica, diagnostico) que NO pudiste encontrar/leer en la imagen. Solo texto/número; NO incluyas firmas.'),
  confianza: z.enum(['alta', 'media', 'baja']),
  campos_dudosos: z.array(z.string()).describe('Lista de campos con baja confianza'),
})

export type OrdenExtraida = z.infer<typeof ordenExtraidaSchema>

/** Versión del prompt/schema OCR — se guarda con el crudo para reproceso. */
export const OCR_ORDEN_PROMPT_VERSION = 'v2-generico-2026-07'

/**
 * Núcleo común de facturación: los campos de texto/número que se extraen de
 * CUALQUIER obra social (no solo OSEP). Las claves son las del schema OCR.
 * Las firmas (booleanos) NO forman parte de esta lista (ver completitud).
 */
export const CAMPOS_NUCLEO = [
  'nro_comprobante',
  'fecha_emision',
  'fecha_realizacion',
  'paciente',
  'nro_documento',
  'nro_afiliado',
  'cobertura',
  'obra_social',
  'nombre_practica',
  'codigo_practica',
  'diagnostico',
] as const

export type CampoNucleo = (typeof CAMPOS_NUCLEO)[number]

export const NUCLEO_LABELS: Record<CampoNucleo, string> = {
  nro_comprobante: 'N° de orden',
  fecha_emision: 'Fecha de emisión',
  fecha_realizacion: 'Fecha de práctica',
  paciente: 'Apellido y nombre',
  nro_documento: 'DNI',
  nro_afiliado: 'N° de afiliado',
  cobertura: 'Plan / cobertura',
  obra_social: 'Obra social',
  nombre_practica: 'Tipo de práctica',
  codigo_practica: 'Codificación',
  diagnostico: 'Diagnóstico',
}

/**
 * Etiquetas legibles de TODOS los campos del OCR (no solo el núcleo). Se usa en los
 * avisos post-escaneo ("Verificá: …", "Faltan: …") para no mostrarle al médico los
 * nombres crudos de las columnas. `campos_dudosos` puede traer cualquier campo del
 * schema (incluidos los específicos de OSEP), por eso este mapa es más amplio que
 * NUCLEO_LABELS (que solo cubre lo que aparece en `no_encontrados`).
 */
export const CAMPO_OCR_LABELS: Record<string, string> = {
  ...NUCLEO_LABELS,
  // Cabecera
  delegacion: 'Delegación',
  titulo_autorizacion: 'Título de autorización',
  nro_internacion: 'N° de internación',
  // Fechas
  fecha_solicitud: 'Fecha de solicitud',
  fecha_vencimiento: 'Fecha de vencimiento',
  fecha_prescripcion: 'Fecha de prescripción',
  hora_emision: 'Hora de emisión',
  // Titular / afiliado
  titular_nombre: 'Titular',
  medico_solicitante: 'Médico solicitante',
  grupo_afiliado: 'Grupo',
  // Beneficiario / documento
  parentesco: 'Parentesco',
  domicilio: 'Domicilio',
  tipo_documento: 'Tipo de documento',
  // Práctica
  alias: 'Alias de la práctica',
  cantidad: 'Cantidad',
  cara: 'Cara (odontología)',
  pieza: 'Pieza (odontología)',
  importe: 'Importe',
  // Pago
  forma_pago: 'Forma de pago',
  cod_pago: 'Código de pago',
  origen: 'Origen',
  // Arancel / total
  arancelista: 'Arancelista',
  cajero: 'Cajero',
  total_cargo_afiliado: 'Total a cargo del afiliado',
  // Realización
  horario_realizacion: 'Hora de realización',
  // Profesional
  matricula_profesional: 'Matrícula profesional',
  profesional: 'Profesional',
  entidad: 'Entidad',
  responsable: 'Responsable',
  agente_facturador: 'Agente facturador',
  // OSEP / firmas
  token_osep: 'Token OSEP',
  firma_paciente: 'Firma del afiliado',
  firma_sello_medico: 'Firma y sello del médico',
  observaciones: 'Observaciones',
}

/**
 * Etiqueta legible para una clave del OCR. Si la clave no está mapeada, cae a una
 * versión prettificada (guiones bajos → espacios, primera en mayúscula) para no
 * mostrar nunca el nombre crudo de la columna.
 */
export function etiquetaCampoOcr(clave: string): string {
  return CAMPO_OCR_LABELS[clave] ?? clave.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

export const OCR_ORDEN_PROMPT = `Analizá esta imagen de una orden médica de CUALQUIER obra social argentina (puede ser OSEP, PAMI, Swiss Medical, OSDE u otra) y extraé TODOS los campos que reconozcas. Cada obra social tiene un formato distinto: leé por SIGNIFICADO, no por posición fija. Si un campo propio de OSEP (delegación, arancelista, cajero, token, cara/pieza) no existe en esta orden, dejalo vacío.

Valores vacíos: texto que no se lee/no figura → "". Numéricos sin valor → 0. agente_facturador sin dato → "". NUNCA inventes datos.

**REGLA DE ORO — ante la duda, vacío**: si NO estás seguro de lo que dice un campo (ilegible, borroso, ambiguo, o no sabés qué corresponde ahí), DEJALO VACÍO ("" o 0) y agregalo a campos_dudosos. Es MEJOR dejar un campo en blanco que rellenarlo con un valor adivinado o "que podría ser". No completes un campo solo porque parece que algo debería ir ahí. Solo poné un valor cuando lo leíste con razonable certeza.

Lectura campo por campo:
- **Beneficiario vs Titular**: "paciente" = el BENEFICIARIO; "titular_nombre" = el TITULAR (a veces son la misma persona, a veces no).
- **Afiliado**: separá "Grupo" (ej: 01) del "N° Afiliado" (ej: 033883).
- **N° Comprobante**: el número largo (~8 dígitos). NO es el token.
- **Práctica**: código (ej: 01-130104-00), descripción, cantidad, e "importe" (el número de la fila de la práctica).
- **Total a Cargo Afiliado**: el total de abajo a la derecha (solo el número).
- **Forma de Pago**: si es "Contado" no hay código; si es "Posnet Físico" suele venir un "Cod." (ej: 046755) → ponelo en cod_pago.
- **DIAGNÓSTICO ≠ ARANCELISTA**: son campos distintos y están cerca. El "Diagnóstico" casi siempre está VACÍO → si no ves un diagnóstico claro, dejá diagnostico="". El "Arancelista" es un nombre/código (ej: PASTEUREREYES, FCOLONSALTA) → va en arancelista, NUNCA en diagnostico.
- **Fechas**: la orden tiene Solicitud, Vencimiento, Prescripción y Emisión arriba, y Realización abajo. Extraé cada una en su campo, formato YYYY-MM-DD (las argentinas son DD/MM/YYYY). fecha_realizacion = la de la sección "Fecha y Hora Realización".
- **Profesional (abajo)**: matrícula (ej: 1735), nombre del profesional, entidad (ej: SANATORIO PASTEUR S.A.) y "Responsable".
- **Agente facturador**: inferilo del "Responsable" (ej: "CÍRCULO MÉDICO DE CATAMARCA" → circulo_medico).
- **Token OSEP** = 6 dígitos. Las órdenes electrónicas ("Web Service") NO suelen tenerlo → token_osep="" y usá el N° de Comprobante como identificador.
- **Firmas**: firma_paciente = ¿hay firma manuscrita del AFILIADO? firma_sello_medico = ¿hay firma Y sello del MÉDICO? Son dos cosas distintas; evaluá cada una por separado.
- Intentá leer letra manuscrita. Lo que no estés seguro → agregalo a campos_dudosos.
- **no_encontrados**: además de dejar en "" lo que no está, listá en \`no_encontrados\` las claves del NÚCLEO que no pudiste encontrar/leer: nro_comprobante, fecha_emision, fecha_realizacion, paciente, nro_documento, nro_afiliado, cobertura, obra_social, nombre_practica, codigo_practica, diagnostico. NO incluyas firmas. Si encontraste todo el núcleo, no_encontrados=[].
- confianza: "alta" = casi todo claro; "media" = algunos a verificar; "baja" = mucha incertidumbre.
- Si NO es una orden médica: es_orden_medica=false + motivo_rechazo breve.`

import { z } from 'zod'
import { generateObject } from 'ai'
import { getVisionModel } from '@/lib/ai/openrouter'
import { normalizarDni, normalizarNombre } from '@/lib/recetas/normalizar'

// Estilo "anti-Claude" como ocr-orden.ts: campos string requeridos, "" cuando falta
// (evita .nullable()/.optional() que complican el tool-schema de Claude).
export const recetaExtraidaSchema = z.object({
  paciente_nombre: z.string().describe('Nombre completo del paciente tal como figura. "" si no se lee.'),
  paciente_dni: z.string().describe('DNI del paciente, SOLO dígitos sin puntos. "" si no se lee.'),
  nro_receta: z.string().describe('Número del código de barras superior, transcripto DÍGITO POR DÍGITO. "" si no se lee.'),
  obra_social: z.string().describe('Obra social (ej. "OSEP Catamarca"). "" si no figura.'),
  fecha_creada: z.string().describe('Fecha de creación en formato YYYY-MM-DD. "" si no se lee.'),
  prescriptor_nombre: z.string().describe('Nombre del médico prescriptor. "" si no figura.'),
  prescriptor_matricula: z.string().describe('Matrícula del prescriptor (solo el número). "" si no figura.'),
  medicamentos: z.array(
    z.object({
      droga: z.string().describe('Nombre genérico/droga (ej. TADALAFILO)'),
      presentacion: z.string().describe('Presentación (ej. "5 mg comp.rec.x 30")'),
      cantidad: z.string().describe('Cantidad recetada (ej. "1")'),
    }),
  ),
  diagnosticos: z.array(
    z.object({
      texto: z.string(),
      codigo: z.string().describe('Código CIE-10 si figura (ej. "Z76.9"), "" si no'),
    }),
  ),
  confianza: z
    .enum(['alta', 'media', 'baja'])
    .describe('alta = nombre y DNI se leen perfecto; media = dudas menores en otros campos; baja = nombre o DNI ilegibles/dudosos'),
})

export type RecetaExtraida = z.infer<typeof recetaExtraidaSchema>

export const OCR_RECETA_PROMPT = `Sos un extractor de datos de recetas médicas electrónicas argentinas (formato RCD — "Tu Recetario Digital" — usado por OSEP Catamarca).
Extraé EXACTAMENTE lo impreso, sin inventar nada. Si un campo no se lee con claridad, devolvé "".
Reglas:
- paciente_dni: SOLO dígitos, sin puntos ni espacios. NO confundir con el CUIL (el CUIL tiene 11 dígitos; el DNI 7-8).
- nro_receta: transcribí el número que acompaña al código de barras superior DÍGITO POR DÍGITO, verificando uno por uno.
- fecha_creada: convertir a YYYY-MM-DD.
- confianza: 'alta' solo si nombre y DNI del paciente se leen perfecto.`

/** Corre el OCR sobre el PDF de la receta (probado en spike: content-part 'file' + Claude Haiku 4.5). */
export async function extraerRecetaDePdf(pdf: Buffer): Promise<RecetaExtraida> {
  const { object } = await generateObject({
    model: getVisionModel(),
    schema: recetaExtraidaSchema,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: OCR_RECETA_PROMPT },
          { type: 'file', data: pdf, mediaType: 'application/pdf' },
        ],
      },
    ],
  })
  return object
}

/** ¿La identidad extraída alcanza para cobrar sin riesgo de entregar a la persona equivocada? */
export function validarIdentidadExtraida(r: RecetaExtraida): boolean {
  if (r.confianza === 'baja') return false
  if (normalizarDni(r.paciente_dni).length < 7) return false
  if (normalizarNombre(r.paciente_nombre).length < 5) return false
  return true
}

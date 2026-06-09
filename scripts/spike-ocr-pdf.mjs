// SPIKE (temporal): ¿Claude Haiku 4.5 vía OpenRouter acepta un PDF como content-part 'file'
// dentro de generateObject? Si esto extrae nombre+DNI de la receta real, la Fase 1 va por acá.
// Uso: node scripts/spike-ocr-pdf.mjs <ruta-al-pdf>
import { readFileSync } from 'node:fs'
import { generateObject } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { z } from 'zod'

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })
const pdf = readFileSync(process.argv[2])

const schema = z.object({
  paciente_nombre: z.string(),
  paciente_dni: z.string().describe('solo dígitos, sin puntos'),
  nro_receta: z.string().describe('número del código de barras superior'),
  obra_social: z.string(),
  prescriptor_nombre: z.string(),
  prescriptor_matricula: z.string(),
  medicamentos: z.array(z.object({ droga: z.string(), presentacion: z.string(), cantidad: z.string() })),
  confianza: z.enum(['alta', 'media', 'baja']),
})

const t0 = Date.now()
const { object, usage } = await generateObject({
  model: openrouter('anthropic/claude-haiku-4.5'),
  schema,
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Extraé los datos de esta receta médica electrónica argentina (RCD / OSEP Catamarca). Usá "" si un campo no se lee.' },
        { type: 'file', data: pdf, mediaType: 'application/pdf' },
      ],
    },
  ],
})
console.log(JSON.stringify(object, null, 2))
console.log('ms:', Date.now() - t0, '| usage:', JSON.stringify(usage))

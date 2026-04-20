import { NextResponse } from 'next/server'
import { z } from 'zod'
import { generateObject } from 'ai'
import { openrouter, MODELS } from '@/lib/ai/openrouter'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

const ordenExtraidaSchema = z.object({
  es_orden_medica: z.boolean(),
  motivo_rechazo: z.string().nullable(),
  paciente: z.string().nullable(),
  obra_social: z.string().nullable(),
  nro_afiliado: z.string().nullable(),
  codigo_practica: z.string().nullable(),
  nombre_practica: z.string().nullable(),
  diagnostico: z.string().nullable(),
  fecha: z.string().nullable(),
  medico_solicitante: z.string().nullable(),
  token_osep: z.string().nullable(),
  firma_paciente: z.boolean().nullable(),
  horario_atencion: z.string().nullable(),
  observaciones: z.string().nullable(),
  confianza: z.enum(['alta', 'media', 'baja']),
  campos_dudosos: z.array(z.string()),
})

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const body = await req.json()
    const imagen = body?.imagen
    if (typeof imagen !== 'string' || !imagen) {
      return NextResponse.json({ error: 'imagen requerida' }, { status: 400 })
    }

    const { object } = await generateObject({
      model: openrouter(MODELS.vision),
      schema: ordenExtraidaSchema,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analizá esta imagen de una orden médica argentina. Extraé todos los campos que puedas.

Reglas:
- Token OSEP = 6 dígitos numéricos
- Obras sociales comunes: OSEP, PAMI, Swiss Medical, OSDE, Galeno, Medife, Accord Salud, OSPAT, OSPIA
- Intentá leer letra manuscrita
- Para cada campo que no esté seguro, incluilo en campos_dudosos
- Confianza alta = casi todo legible sin ambigüedad
- Confianza media = algunos campos requieren verificación
- Confianza baja = mucha incertidumbre
- Si NO es una orden médica: es_orden_medica=false + motivo_rechazo breve.`,
            },
            { type: 'image', image: imagen },
          ],
        },
      ],
    })

    return NextResponse.json(object)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error procesando imagen' },
      { status: 500 },
    )
  }
}

import { NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { openrouter, MODELS } from '@/lib/ai/openrouter'
import { createClient } from '@/lib/supabase/server'
import { ordenExtraidaSchema, OCR_ORDEN_PROMPT } from '@/lib/ai/ocr-orden'

export const maxDuration = 60

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
            { type: 'text', text: OCR_ORDEN_PROMPT },
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

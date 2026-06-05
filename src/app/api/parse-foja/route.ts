import { NextResponse } from 'next/server'
import { z } from 'zod'
import { generateObject } from 'ai'
import { openrouter, MODELS } from '@/lib/ai/openrouter'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

// Extracción del dictado de una foja quirúrgica (Nivel 2).
// Sin .nullable() (union types) — campos requeridos con "" cuando no hay dato.
const fojaSchema = z.object({
  nombre: z.string().describe('Nombre del paciente. "" si no se dice.'),
  apellido: z.string().describe('Apellido del paciente. "" si no se dice.'),
  obra_social: z.string().describe('Obra social (ej: OSEP, PAMI). "" si no se dice.'),
  cirugia_principal_busqueda: z
    .string()
    .describe('Nombre o código de la cirugía PRINCIPAL, en MAYÚSCULAS y SIN acentos (ej: COLECISTECTOMIA). "" si no se dice.'),
  cirugia_adicional_busqueda: z
    .string()
    .describe('Nombre o código de la cirugía ADICIONAL, en MAYÚSCULAS y SIN acentos. "" si no hay adicional.'),
  rol_medico: z
    .enum(['cirujano_principal', 'ayudante', ''])
    .describe('Rol del médico: cirujano_principal o ayudante. "" si no se dice.'),
})

type PrestacionMatch = { codigo: string; detalle: string; total: number | null } | null

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const body = await req.json()
    const transcript = typeof body?.transcript === 'string' ? body.transcript.trim() : ''
    if (!transcript) return NextResponse.json({ error: 'transcript requerido' }, { status: 400 })

    const { object } = await generateObject({
      model: openrouter(MODELS.agent),
      schema: fojaSchema,
      messages: [
        {
          role: 'user',
          content: `Extraé los datos de esta foja quirúrgica dictada por un médico argentino. Si un dato no se menciona, dejalo en "". El rol "fui cirujano / operé / cirujano principal" → cirujano_principal; "ayudé / fui ayudante" → ayudante.\n\nDictado: "${transcript}"`,
        },
      ],
    })

    // Buscar las cirugías en el nomenclador (best-effort, OSEP).
    async function buscar(termino: string): Promise<PrestacionMatch> {
      const t = termino.trim()
      if (!t) return null
      const { data } = await supabase
        .from('prestaciones')
        .select('codigo, detalle, total')
        .eq('obra_social', 'OSEP')
        .or(`codigo.ilike.%${t}%,detalle.ilike.%${t}%`)
        .limit(1)
      if (data && data.length) {
        return { codigo: data[0].codigo, detalle: data[0].detalle, total: data[0].total }
      }
      return null
    }

    const [principal, adicional] = await Promise.all([
      buscar(object.cirugia_principal_busqueda),
      buscar(object.cirugia_adicional_busqueda),
    ])

    return NextResponse.json({
      nombre: object.nombre,
      apellido: object.apellido,
      obra_social: object.obra_social,
      rol_medico: object.rol_medico,
      // Texto crudo + match del nomenclador (puede ser null si no se encontró).
      principal_texto: object.cirugia_principal_busqueda,
      adicional_texto: object.cirugia_adicional_busqueda,
      principal,
      adicional,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error procesando el dictado' },
      { status: 500 },
    )
  }
}

import { openrouter, MODELS } from '@/lib/ai/openrouter'
import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from 'ai'
import { SYSTEM_PROMPT } from '@/features/assistant/config/systemPrompt'
import { PLATFORM_KNOWLEDGE } from '@/features/assistant/config/platformKnowledge'
import { assistantTools } from '@/features/assistant/config/tools'
import { createClient } from '@/lib/supabase/server'
import {
  crearConversacion,
  persistirUserMessage,
  persistirOnFinish,
} from '@/features/assistant/services/messages'
import { cargarHistorialModelMessages } from '@/features/assistant/services/history'

export const maxDuration = 60

interface ChatRequestBody {
  messages: UIMessage[]
  conversationId?: string
}

function extractText(msg: UIMessage | undefined): string {
  if (!msg) return ''
  const parts = msg.parts ?? []
  return parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join(' ')
    .trim()
}

// Devuelve una fecha YYYY-MM-DD en la zona horaria de Catamarca, Argentina,
// offset desde hoy en días (0 = hoy, -1 = ayer, -7 = hace una semana).
function fechaArgentina(offsetDias = 0): string {
  const ahora = new Date()
  ahora.setUTCDate(ahora.getUTCDate() + offsetDias)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Catamarca',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora)
}

function buildContextoTemporal(): string {
  const hoy = fechaArgentina(0)
  const ayer = fechaArgentina(-1)
  const anteayer = fechaArgentina(-2)
  const haceUnaSemana = fechaArgentina(-7)
  // Días de la semana hoy (para "el lunes pasado", etc.)
  const diaSemana = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Catamarca',
    weekday: 'long',
  }).format(new Date())

  return `## CONTEXTO TEMPORAL (zona horaria Catamarca, Argentina)
**FUENTE ÚNICA DE VERDAD PARA FECHAS — sobrescribe cualquier fecha mencionada en mensajes previos de esta conversación.**

- HOY es: ${hoy} (${diaSemana})
- "ayer" = ${ayer}
- "anteayer" = ${anteayer}
- "hace una semana" ≈ ${haceUnaSemana}

REGLAS DE FECHA:
0. **AUTORIDAD**: si en mensajes previos de la conversación dijiste una fecha distinta (ej: "2024-05-23"), esa fecha está MAL — usá SIEMPRE los valores de arriba. Antes de confirmar cualquier registro, releé las fechas a la luz de este contexto y corregí si hace falta.
1. NUNCA inventes una fecha. Si dudás, preguntá.
2. Fechas relativas ("hoy", "ayer", "el lunes pasado"): usá los valores de arriba.
3. **Formato argentino DD/MM/YYYY** — interpretá SIEMPRE así. Ejemplos:
   - "11/05/2026" → 2026-05-11 (11 de MAYO, no de noviembre)
   - "11/5" → ${hoy.slice(0, 4)}-05-11 (asumí año actual)
   - "11-5-26" → 2026-05-11
4. Texto natural: "11 de mayo", "11 de mayo de 2026", "mayo 11" → todos válidos, convertir a YYYY-MM-DD.
5. Si el médico tira "lunes" / "viernes" sin más, asumí el más reciente pasado y confirmá: "¿el viernes pasado, ${haceUnaSemana.slice(8)}/${haceUnaSemana.slice(5,7)}?"
6. Al confirmar la orden/cirugía/débito antes de registrar, mostrá la fecha en formato DD/MM/YYYY para que el médico la verifique fácil. Internamente la tool recibe YYYY-MM-DD.`
}

export async function POST(req: Request) {
  const { messages, conversationId }: ChatRequestBody = await req.json()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  const medicoId = user.id

  // Resolver o crear la conversación.
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')
  const lastUserText = extractText(lastUserMessage)

  let convId = conversationId ?? null
  if (!convId) {
    convId = await crearConversacion(supabase, medicoId, lastUserText || 'Nueva conversación')
    if (!convId) return new Response('No se pudo crear la conversación', { status: 500 })
  }

  // Calcular step_index base contando mensajes ya existentes en la conversación.
  let baseStepIndex = 0
  const { count } = await supabase
    .from('chat_mensajes')
    .select('id', { count: 'exact', head: true })
    .eq('conversacion_id', convId)
  if (typeof count === 'number') baseStepIndex = count

  // Si la conversación es preexistente, cargamos historial ANTES de persistir el user
  // para evitar duplicación. Si es nueva, usamos messages tal cual.
  const isExisting = !!conversationId
  const historyMessages = isExisting ? await cargarHistorialModelMessages(supabase, convId) : []
  const newTurnMessages = await convertToModelMessages(messages)
  const modelMessages = isExisting ? [...historyMessages, ...newTurnMessages] : newTurnMessages

  // Persistir el user message ANTES del stream (sincrónico).
  if (lastUserText) {
    await persistirUserMessage(supabase, medicoId, convId, lastUserText, baseStepIndex)
    baseStepIndex += 1
  }

  const conversacionIdResolved = convId

  const result = streamText({
    model: openrouter(MODELS.agent),
    system: `${SYSTEM_PROMPT}\n\n${buildContextoTemporal()}\n\n${PLATFORM_KNOWLEDGE}`,
    messages: modelMessages,
    tools: assistantTools,
    stopWhen: stepCountIs(5),
    onFinish: async (event) => {
      try {
        await persistirOnFinish(supabase, medicoId, conversacionIdResolved, event, baseStepIndex)
      } catch (err) {
        console.error('[chat] onFinish persistence failed:', err)
      }
    },
  })

  return result.toUIMessageStreamResponse({
    messageMetadata: () => ({ conversationId: conversacionIdResolved }),
  })
}

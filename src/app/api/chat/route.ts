import { openrouter, getAgentModel } from '@/lib/ai/openrouter'
import { registrarUsoIa } from '@/lib/ai/usoIa'
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

  // Para conversaciones existentes: contar mensajes (para step_index) y cargar
  // historial EN PARALELO. Para nuevas: arrancamos en 0 sin tocar la BD.
  const isExisting = !!conversationId
  let baseStepIndex = 0
  let historyMessages: Awaited<ReturnType<typeof cargarHistorialModelMessages>> = []
  if (isExisting) {
    const [countRes, history] = await Promise.all([
      supabase
        .from('chat_mensajes')
        .select('id', { count: 'exact', head: true })
        .eq('conversacion_id', convId),
      cargarHistorialModelMessages(supabase, convId),
    ])
    if (typeof countRes.count === 'number') baseStepIndex = countRes.count
    historyMessages = history
  }

  const newTurnMessages = await convertToModelMessages(messages)
  const modelMessages = isExisting ? [...historyMessages, ...newTurnMessages] : newTurnMessages

  // step_index: el user ocupa baseStepIndex; assistant/tools arrancan en el siguiente.
  // OJO: persistimos al final (en onFinish), NO antes del stream, para no agregar
  // latencia antes del primer token.
  const userStepIndex = baseStepIndex
  const assistantBaseStepIndex = lastUserText ? baseStepIndex + 1 : baseStepIndex

  const conversacionIdResolved = convId

  // ── Diagnóstico de latencia/tool-calling (temporal) ──
  const modelId = getAgentModel()
  const t0 = Date.now()
  console.log(`[chat] ▶ model=${modelId} conv=${convId} existing=${isExisting} historyMsgs=${historyMessages.length}`)

  const result = streamText({
    model: openrouter(modelId),
    system: `${SYSTEM_PROMPT}\n\n${buildContextoTemporal()}\n\n${PLATFORM_KNOWLEDGE}`,
    messages: modelMessages,
    tools: assistantTools,
    stopWhen: stepCountIs(5),
    onError: (e) => {
      console.error(`[chat] ✖ streamText error (model=${modelId}, +${Date.now() - t0}ms):`, e)
    },
    onFinish: async (event) => {
      const toolNames = event.steps.flatMap((s) => s.toolCalls.map((c) => c.toolName))
      console.log(
        `[chat] ✔ finish model=${modelId} +${Date.now() - t0}ms reason=${event.finishReason} steps=${event.steps.length} tools=[${toolNames.join(',')}]`,
      )
      try {
        // Persistimos user + assistant juntos, ya terminado el stream.
        if (lastUserText) {
          await persistirUserMessage(supabase, medicoId, conversacionIdResolved, lastUserText, userStepIndex)
        }
        await persistirOnFinish(supabase, medicoId, conversacionIdResolved, event, assistantBaseStepIndex)
      } catch (err) {
        console.error('[chat] onFinish persistence failed:', err)
      }
      // Costo de IA (spec §5.1): tokens del asistente de facturación. Best-effort.
      await registrarUsoIa(supabase, {
        medicoId,
        origen: 'panel',
        modelo: modelId,
        usage: event.totalUsage,
        conversacionId: conversacionIdResolved,
      })
    },
  })

  return result.toUIMessageStreamResponse({
    messageMetadata: () => ({ conversationId: conversacionIdResolved }),
  })
}

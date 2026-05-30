import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { OnFinishEvent, ToolSet } from 'ai'

const TITULO_MAX = 60

function autoTitulo(firstUserText: string): string {
  const clean = firstUserText.replace(/\s+/g, ' ').trim()
  if (clean.length === 0) return 'Nueva conversación'
  return clean.length > TITULO_MAX ? clean.slice(0, TITULO_MAX) + '…' : clean
}

/**
 * Crea una conversación nueva con título derivado del primer mensaje del usuario.
 * Devuelve el id. Si falla, devuelve null y el caller decide qué hacer.
 */
export async function crearConversacion(
  supabase: SupabaseClient,
  medicoId: string,
  primerMensajeUsuario: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('chat_conversaciones')
    .insert({
      medico_id: medicoId,
      titulo_auto: autoTitulo(primerMensajeUsuario),
    })
    .select('id')
    .single()

  if (error) {
    console.error('[chat] crearConversacion error:', error.message)
    return null
  }
  return data.id
}

/**
 * Inserta el user message al inicio del turno (antes del stream).
 */
export async function persistirUserMessage(
  supabase: SupabaseClient,
  medicoId: string,
  conversacionId: string,
  content: string,
  stepIndex: number,
): Promise<void> {
  const { error } = await supabase.from('chat_mensajes').insert({
    medico_id: medicoId,
    conversacion_id: conversacionId,
    role: 'user',
    content,
    step_index: stepIndex,
  })
  if (error) console.error('[chat] persistirUserMessage error:', error.message)
}

/**
 * Mapea tool_name -> nombre de columna FK (orden_id / cirugia_id / debito_id).
 */
function fkColumnForTool(toolName: string): 'orden_id' | 'cirugia_id' | 'debito_id' | null {
  switch (toolName) {
    case 'registrar_orden':
      return 'orden_id'
    case 'registrar_cirugia':
      return 'cirugia_id'
    case 'registrar_debito':
      return 'debito_id'
    default:
      return null
  }
}

interface ToolOutputMaybeSuccess {
  success?: boolean
  id?: string
  [k: string]: unknown
}

/**
 * Persiste todo el output del stream (assistant text + tool calls) iterando
 * los steps que devuelve el AI SDK v6 en onFinish.
 *
 * step_index empieza en `baseStepIndex` (el user message ya consumió uno).
 */
export async function persistirOnFinish<TOOLS extends ToolSet>(
  supabase: SupabaseClient,
  medicoId: string,
  conversacionId: string,
  event: OnFinishEvent<TOOLS>,
  baseStepIndex: number,
): Promise<void> {
  const rows: Array<Record<string, unknown>> = []
  let stepIndex = baseStepIndex

  for (const step of event.steps) {
    // 1) Texto del assistant en este step (si hay)
    const text = step.text?.trim()
    if (text && text.length > 0) {
      rows.push({
        medico_id: medicoId,
        conversacion_id: conversacionId,
        role: 'assistant',
        content: text,
        step_index: stepIndex++,
      })
    }

    // 2) Cada tool call con su resultado (matched por toolCallId)
    const resultsByCallId = new Map(step.toolResults.map((r) => [r.toolCallId, r]))

    for (const call of step.toolCalls) {
      const result = resultsByCallId.get(call.toolCallId)
      const output = (result?.output ?? null) as ToolOutputMaybeSuccess | null

      // Linkeo a registro real solo si success === true y la tool es de registro.
      const fkCol = fkColumnForTool(call.toolName)
      const linkId =
        fkCol && output && output.success === true && typeof output.id === 'string'
          ? output.id
          : null

      const row: Record<string, unknown> = {
        medico_id: medicoId,
        conversacion_id: conversacionId,
        role: 'tool',
        tool_name: call.toolName,
        tool_input: call.input ?? null,
        tool_result: output,
        step_index: stepIndex++,
      }
      if (fkCol && linkId) row[fkCol] = linkId

      rows.push(row)
    }
  }

  if (rows.length === 0) return

  const { error } = await supabase.from('chat_mensajes').insert(rows)
  if (error) console.error('[chat] persistirOnFinish error:', error.message)
}

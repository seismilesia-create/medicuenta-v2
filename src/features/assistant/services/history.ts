import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ModelMessage } from 'ai'
import type {
  AssistantContent,
  TextPart,
  ToolCallPart,
  ToolResultPart,
} from '@ai-sdk/provider-utils'

const HISTORY_LIMIT = 30

interface HistoryRow {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string | null
  tool_name: string | null
  tool_input: Record<string, unknown> | null
  tool_result: Record<string, unknown> | null
}

interface AssistantBuffer {
  texts: string[]
  toolCalls: ToolCallPart[]
  toolResults: ToolResultPart[]
}

function emptyBuffer(): AssistantBuffer {
  return { texts: [], toolCalls: [], toolResults: [] }
}

function bufferIsEmpty(b: AssistantBuffer): boolean {
  return b.texts.length === 0 && b.toolCalls.length === 0
}

function flush(buffer: AssistantBuffer, out: ModelMessage[]): void {
  if (bufferIsEmpty(buffer)) return

  // Assistant message: texto + tool-calls del mismo "turno"
  const content: AssistantContent = []
  if (buffer.texts.length > 0) {
    const text = buffer.texts.join('\n\n').trim()
    if (text.length > 0) {
      const part: TextPart = { type: 'text', text }
      content.push(part)
    }
  }
  for (const tc of buffer.toolCalls) content.push(tc)
  if (content.length > 0) out.push({ role: 'assistant', content })

  // Tool message con los resultados que matchean los tool-calls
  if (buffer.toolResults.length > 0) {
    out.push({ role: 'tool', content: buffer.toolResults })
  }
}

/**
 * Carga los últimos HISTORY_LIMIT mensajes de una conversación y los convierte
 * a ModelMessage[] para alimentar al LLM con la conversación previa.
 *
 * Usa el shape estructurado (`tool-call` + `tool-result`) en lugar de un dump
 * textual: así el LLM entiende que esas tools YA se ejecutaron y NO necesita
 * repetir ni hablar su payload. Resuelve el bug donde el LLM "transcribía"
 * el resultado del tool dentro del texto del assistant.
 */
export async function cargarHistorialModelMessages(
  supabase: SupabaseClient,
  conversacionId: string,
): Promise<ModelMessage[]> {
  const { data, error } = await supabase
    .from('chat_mensajes')
    .select('id, role, content, tool_name, tool_input, tool_result, step_index, created_at')
    .eq('conversacion_id', conversacionId)
    .order('step_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(HISTORY_LIMIT)

  if (error || !data) return []

  const out: ModelMessage[] = []
  let buffer = emptyBuffer()

  for (const row of data as HistoryRow[]) {
    if (row.role === 'user') {
      flush(buffer, out)
      buffer = emptyBuffer()
      out.push({ role: 'user', content: row.content ?? '' })
      continue
    }

    if (row.role === 'assistant') {
      // Si ya cerramos un assistant (con tool-results) y aparece texto nuevo,
      // empezamos un nuevo turno del assistant.
      if (buffer.toolResults.length > 0) {
        flush(buffer, out)
        buffer = emptyBuffer()
      }
      if (row.content) buffer.texts.push(row.content)
      continue
    }

    // row.role === 'tool'
    if (!row.tool_name) continue
    const toolCallId = `hist-${row.id}`
    buffer.toolCalls.push({
      type: 'tool-call',
      toolCallId,
      toolName: row.tool_name,
      input: row.tool_input ?? {},
    })
    buffer.toolResults.push({
      type: 'tool-result',
      toolCallId,
      toolName: row.tool_name,
      output: { type: 'json', value: (row.tool_result ?? null) as never },
    })
  }

  flush(buffer, out)
  return out
}

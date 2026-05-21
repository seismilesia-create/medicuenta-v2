import type { UIMessage } from 'ai'
import type { ChatMensaje } from '../types/chat-history'

interface ExtraToolPartFields {
  _recordDeleted?: boolean
  _recordHref?: string
}

/**
 * Devuelve href a la página del registro vivo o null si fue eliminado o no aplica.
 */
function resolveRecordLink(row: ChatMensaje): { href: string | null; deleted: boolean } {
  if (!row.tool_name) return { href: null, deleted: false }

  const success =
    row.tool_result && typeof row.tool_result === 'object'
      ? (row.tool_result as { success?: unknown }).success === true
      : false

  if (!success) return { href: null, deleted: false }

  switch (row.tool_name) {
    case 'registrar_orden':
      return row.orden_id
        ? { href: `/ordenes/${row.orden_id}`, deleted: false }
        : { href: null, deleted: true }
    case 'registrar_cirugia':
      return row.cirugia_id
        ? { href: `/cirugias/${row.cirugia_id}`, deleted: false }
        : { href: null, deleted: true }
    case 'registrar_debito':
      return row.debito_id
        ? { href: `/debitos/${row.debito_id}`, deleted: false }
        : { href: null, deleted: true }
    default:
      return { href: null, deleted: false }
  }
}

/**
 * Convierte rows de chat_mensajes a UIMessage[] para que useChat los renderice
 * como mensajes históricos. Cada row se mapea a un UIMessage independiente.
 */
export function rowsToUIMessages(rows: ChatMensaje[]): UIMessage[] {
  return rows.map((row) => {
    if (row.role === 'user') {
      return {
        id: row.id,
        role: 'user',
        parts: [{ type: 'text', text: row.content ?? '', state: 'done' }],
      }
    }

    if (row.role === 'assistant') {
      return {
        id: row.id,
        role: 'assistant',
        parts: [{ type: 'text', text: row.content ?? '', state: 'done' }],
      }
    }

    // role === 'tool'
    const { href, deleted } = resolveRecordLink(row)
    const toolPart: Record<string, unknown> & ExtraToolPartFields = {
      type: `tool-${row.tool_name}`,
      toolCallId: `hist-${row.id}`,
      state: 'output-available',
      input: row.tool_input ?? {},
      output: row.tool_result ?? null,
    }
    if (deleted) toolPart._recordDeleted = true
    if (href) toolPart._recordHref = href

    return {
      id: row.id,
      role: 'assistant',
      parts: [toolPart as never],
    }
  })
}

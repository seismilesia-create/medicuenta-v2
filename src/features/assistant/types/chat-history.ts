export type ChatMessageRole = 'user' | 'assistant' | 'tool'

export interface ChatConversacion {
  id: string
  medico_id: string
  titulo_auto: string
  created_at: string
  last_message_at: string
}

export interface ChatMensaje {
  id: string
  conversacion_id: string
  medico_id: string
  role: ChatMessageRole
  content: string | null
  tool_name: string | null
  tool_input: Record<string, unknown> | null
  tool_result: Record<string, unknown> | null
  orden_id: string | null
  cirugia_id: string | null
  debito_id: string | null
  step_index: number | null
  created_at: string
}

export interface ChatSearchResultRow {
  message_id: string
  conversacion_id: string
  titulo_auto: string
  role: ChatMessageRole
  tool_name: string | null
  orden_id: string | null
  cirugia_id: string | null
  debito_id: string | null
  created_at: string
  snippet_html: string
  rank: number
}

export interface ChatSearchFilters {
  q?: string
  tool?: string
  from?: string
  to?: string
  paciente?: string
}

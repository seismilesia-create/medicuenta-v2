import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

interface SearchRow {
  message_id: string
  conversacion_id: string
  titulo_auto: string
  role: 'user' | 'assistant' | 'tool'
  tool_name: string | null
  orden_id: string | null
  cirugia_id: string | null
  debito_id: string | null
  created_at: string
  snippet: string
  rank: number
}

// Escapa HTML y luego reemplaza sentinelas §§MARK§§ por <mark> reales.
function snippetToSafeHtml(snippet: string | null): string {
  if (!snippet) return ''
  const escaped = snippet
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped
    .replace(/§§MARK§§/g, '<mark>')
    .replace(/§§\/MARK§§/g, '</mark>')
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const url = new URL(req.url)
  const q = url.searchParams.get('q') ?? ''
  const tool = url.searchParams.get('tool')
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const paciente = url.searchParams.get('paciente')
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 30), 100)

  if (!q.trim() && !tool && !from && !to && !paciente) {
    return NextResponse.json({ results: [] })
  }

  const { data, error } = await supabase.rpc('search_chat_messages', {
    p_q: q,
    p_tool: tool,
    p_from: from,
    p_to: to,
    p_paciente: paciente,
    p_limit: limit,
  })

  if (error) return new Response(error.message, { status: 500 })

  const rows = (data ?? []) as SearchRow[]
  const results = rows.map((r) => ({
    message_id: r.message_id,
    conversacion_id: r.conversacion_id,
    titulo_auto: r.titulo_auto,
    role: r.role,
    tool_name: r.tool_name,
    orden_id: r.orden_id,
    cirugia_id: r.cirugia_id,
    debito_id: r.debito_id,
    created_at: r.created_at,
    snippet_html: snippetToSafeHtml(r.snippet),
    rank: r.rank,
  }))

  return NextResponse.json({ results })
}

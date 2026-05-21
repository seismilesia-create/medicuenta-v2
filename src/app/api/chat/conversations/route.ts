import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const DEFAULT_LIMIT = 50

export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT), 200)
  const cursor = url.searchParams.get('cursor') // ISO timestamp del last_message_at del último resultado anterior

  let query = supabase
    .from('chat_conversaciones')
    .select('id, titulo_auto, created_at, last_message_at')
    .eq('medico_id', user.id)
    .order('last_message_at', { ascending: false })
    .limit(limit)

  if (cursor) query = query.lt('last_message_at', cursor)

  const { data, error } = await query
  if (error) return new Response(error.message, { status: 500 })

  const nextCursor =
    data && data.length === limit ? data[data.length - 1].last_message_at : null

  return NextResponse.json({ conversations: data ?? [], nextCursor })
}

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

interface Ctx {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  // Validar pertenencia a través de RLS — el SELECT con eq medico_id falla si no es del médico.
  const { data: conv, error: convErr } = await supabase
    .from('chat_conversaciones')
    .select('id, titulo_auto, created_at, last_message_at')
    .eq('id', id)
    .eq('medico_id', user.id)
    .single()

  if (convErr || !conv) return new Response('Not found', { status: 404 })

  const { data: messages, error } = await supabase
    .from('chat_mensajes')
    .select(
      'id, role, content, tool_name, tool_input, tool_result, orden_id, cirugia_id, debito_id, step_index, created_at',
    )
    .eq('conversacion_id', id)
    .order('step_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (error) return new Response(error.message, { status: 500 })

  return NextResponse.json({ conversation: conv, messages: messages ?? [] })
}

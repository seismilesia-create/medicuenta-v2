import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

interface Ctx {
  params: Promise<{ id: string }>
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { error } = await supabase
    .from('chat_conversaciones')
    .delete()
    .eq('id', id)
    .eq('medico_id', user.id)

  if (error) return new Response(error.message, { status: 500 })
  return NextResponse.json({ ok: true })
}

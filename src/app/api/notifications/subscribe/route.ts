import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

interface WebPushSubscription {
  endpoint?: string
  keys?: { p256dh?: string; auth?: string }
}

/**
 * Guarda la suscripción push del dispositivo actual. El user_id sale de la SESIÓN
 * (no del cliente) y la escritura pasa por RLS con el cliente autenticado.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const body = (await request.json()) as {
    subscription?: WebPushSubscription
    userAgent?: string
    oldEndpoint?: string
  }
  const sub = body.subscription

  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: 'Suscripción inválida' }, { status: 400 })
  }

  // Rotación de suscripción (pushsubscriptionchange): borrar la vieja del usuario.
  if (body.oldEndpoint) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', body.oldEndpoint)
  }

  // Upsert por (user_id, endpoint): re-suscribir el mismo device no duplica filas.
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      user_agent: body.userAgent ?? null,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,endpoint' }
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

/** Borra la suscripción del dispositivo (al desactivar o desuscribirse). */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { endpoint } = (await request.json()) as { endpoint?: string }
  if (!endpoint) {
    return NextResponse.json({ error: 'Falta endpoint' }, { status: 400 })
  }

  // RLS ya limita a las propias, pero filtramos por user_id igual (defensa en profundidad).
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', endpoint)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

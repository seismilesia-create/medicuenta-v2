import { NextResponse, type NextRequest } from 'next/server'
import { sendPushToUser, type PushPayload } from '@/features/notifications/services/send-push'

export const runtime = 'nodejs'

/**
 * Dispara una notificación push a un usuario. Endpoint INTERNO: se autentica con
 * el service role (lo usan triggers server-side / cron, no el navegador).
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { userId, notification } = (await request.json()) as {
    userId?: string
    notification?: PushPayload
  }

  if (!userId || !notification?.title) {
    return NextResponse.json({ error: 'Faltan userId o notification.title' }, { status: 400 })
  }

  try {
    const result = await sendPushToUser(userId, notification)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

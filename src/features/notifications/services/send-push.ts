import 'server-only'
import webpush from 'web-push'
import { createServiceClient } from '@/lib/supabase/server'

let vapidConfigured = false

function configureVapid() {
  if (vapidConfigured) return
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:noreply@medicuenta.app'
  if (!publicKey || !privateKey) {
    throw new Error('Faltan NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY')
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  vapidConfigured = true
}

export interface PushPayload {
  title: string
  body?: string
  url?: string
  icon?: string
  tag?: string
  requireInteraction?: boolean
  data?: Record<string, unknown>
}

export interface SendResult {
  sent: number
  failed: number
}

/**
 * Envía una notificación push a TODOS los dispositivos de un usuario.
 * Corre server-side con service_role (bypassa RLS para leer las suscripciones).
 * Limpia automáticamente las suscripciones que el push service reporta como
 * muertas (404/410) — Apple a veces falla en silencio (sin statusCode), también
 * se limpian esas.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<SendResult> {
  configureVapid()
  const supabase = createServiceClient()

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (!subs?.length) return { sent: 0, failed: 0 }

  const body = JSON.stringify(payload)
  let sent = 0
  let failed = 0

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        )
        sent++
      } catch (err) {
        failed++
        const status = (err as { statusCode?: number }).statusCode
        // 404/410 = suscripción muerta. Sin statusCode = fallo silencioso de Apple.
        if (!status || status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        }
      }
    })
  )

  return { sent, failed }
}

import { createServiceClient } from '@/lib/supabase/server'
import { verifyMetaSignature } from '@/lib/whatsapp/signature'
import { parseIncomingMessage } from '@/lib/whatsapp/parse'
import { handleIncomingWhatsApp } from '@/features/whatsapp/runner'

export const runtime = 'nodejs' // necesitamos node:crypto + Buffer

// ── GET: verificación del webhook (handshake de Meta) ──
export async function GET(req: Request) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')
  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? '', { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

// ── POST: mensajes entrantes ──
export async function POST(req: Request) {
  // 1) Leer el RAW body ANTES de parsear (necesario para verificar la firma).
  const rawBody = await req.text()

  // 2) Verificar la firma de Meta (X-Hub-Signature-256).
  const appSecret = process.env.WHATSAPP_APP_SECRET
  const signature = req.headers.get('x-hub-signature-256')
  if (!appSecret || !verifyMetaSignature(rawBody, signature, appSecret)) {
    return new Response('Invalid signature', { status: 401 })
  }

  // 3) Parsear el payload.
  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  // 4) Idempotencia: dedupe por wamid (Meta reintenta).
  const incoming = parseIncomingMessage(payload)
  if (incoming) {
    const db = createServiceClient()
    const { error } = await db
      .from('wa_eventos_webhook')
      .insert({ wamid: incoming.messageId })
    // Violación de UNIQUE → ya lo procesamos → devolvemos 200 sin re-procesar.
    if (error) {
      if (error.code === '23505') return new Response('OK', { status: 200 })
      console.error('[wa] dedupe insert error:', error)
    }
  }

  // 5) Procesar (best-effort) y SIEMPRE responder 200 (o Meta reintenta).
  try {
    await handleIncomingWhatsApp(payload)
  } catch (e) {
    console.error('[wa] handler error:', e)
  }
  return new Response('OK', { status: 200 })
}

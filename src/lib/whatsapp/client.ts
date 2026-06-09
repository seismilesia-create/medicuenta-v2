/** Cliente de Meta WhatsApp Cloud API (envío de texto + marcar leído). */
const GRAPH_VERSION = 'v21.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`

/**
 * Normaliza el número destinatario para el envío.
 * Argentina (54): los entrantes llegan como `549XXXXXXXXXX` (con 9), pero la
 * Cloud API exige enviar a `54XXXXXXXXXX` (sin el 9), o Meta rechaza (#131030).
 */
export function normalizeRecipient(to: string): string {
  const digits = to.replace(/\D/g, '')
  if (digits.startsWith('549')) return '54' + digits.slice(3)
  return digits
}

interface SendParams {
  phoneNumberId: string
  accessToken: string
  to: string
}

export async function sendWhatsAppText(params: SendParams & { text: string }): Promise<boolean> {
  const res = await fetch(`${GRAPH_BASE}/${params.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${params.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizeRecipient(params.to),
      type: 'text',
      text: { body: params.text },
    }),
  })
  if (!res.ok) console.error('WhatsApp sendText error:', await res.text())
  return res.ok
}

/** Marca un mensaje entrante como leído (los dos tildes azules). */
export async function markAsRead(params: SendParams & { messageId: string }): Promise<void> {
  await fetch(`${GRAPH_BASE}/${params.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${params.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: params.messageId }),
  }).catch(() => {})
}

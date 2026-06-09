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

/** Descarga un archivo de media de WhatsApp (imagen/PDF) como Buffer. */
export async function fetchWhatsAppMedia(
  mediaId: string,
  accessToken: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const meta = await fetch(`${GRAPH_BASE}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then((r) => r.json())
    if (!meta?.url) return null
    const bin = await fetch(meta.url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!bin.ok) return null
    return {
      buffer: Buffer.from(await bin.arrayBuffer()),
      mimeType: typeof meta.mime_type === 'string' ? meta.mime_type : 'application/octet-stream',
    }
  } catch {
    return null
  }
}

/** Sube un archivo a Meta y devuelve su media_id (para enviarlo como document). */
export async function uploadWhatsAppMedia(params: {
  phoneNumberId: string
  accessToken: string
  buffer: Buffer
  mimeType: string
  filename: string
}): Promise<string | null> {
  const form = new FormData()
  form.append('messaging_product', 'whatsapp')
  form.append('type', params.mimeType)
  form.append('file', new Blob([new Uint8Array(params.buffer)], { type: params.mimeType }), params.filename)
  const res = await fetch(`${GRAPH_BASE}/${params.phoneNumberId}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${params.accessToken}` },
    body: form,
  })
  if (!res.ok) {
    console.error('WhatsApp uploadMedia error:', await res.text())
    return null
  }
  const json = (await res.json()) as { id?: string }
  return json?.id ?? null
}

/** Envía un documento (PDF) por media_id. Meta lo entrega con link autenticado temporal. */
export async function sendWhatsAppDocument(
  params: SendParams & { mediaId: string; filename: string; caption?: string },
): Promise<boolean> {
  const res = await fetch(`${GRAPH_BASE}/${params.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${params.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizeRecipient(params.to),
      type: 'document',
      document: { id: params.mediaId, filename: params.filename, caption: params.caption },
    }),
  })
  if (!res.ok) console.error('WhatsApp sendDocument error:', await res.text())
  return res.ok
}

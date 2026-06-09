export interface IncomingMessage {
  phoneNumberId: string // número del negocio que recibió (para enrutar)
  from: string // teléfono del remitente
  messageId: string
  contactName?: string
  type: 'text' | 'image' | 'audio' | 'document' | 'other'
  text?: string
  mediaId?: string // imágenes / audio / documentos (se descargan aparte)
  filename?: string // sólo documentos
}

/**
 * Extrae el mensaje entrante de un payload del webhook de Meta.
 * Devuelve null si el evento no es un mensaje de usuario (ej. status updates).
 */
export function parseIncomingMessage(payload: unknown): IncomingMessage | null {
  try {
    const entry = (payload as { entry?: unknown[] })?.entry?.[0] as
      | { changes?: { value?: Record<string, unknown> }[] }
      | undefined
    const value = entry?.changes?.[0]?.value
    if (!value) return null

    const metadata = value.metadata as { phone_number_id?: string } | undefined
    const messages = value.messages as Record<string, unknown>[] | undefined
    const msg = messages?.[0]
    if (!msg || !metadata?.phone_number_id) return null

    const contacts = value.contacts as { profile?: { name?: string } }[] | undefined
    const rawType = String(msg.type)
    const known = rawType === 'text' || rawType === 'image' || rawType === 'audio' || rawType === 'document'
    const base: IncomingMessage = {
      phoneNumberId: metadata.phone_number_id,
      from: String(msg.from),
      messageId: String(msg.id),
      contactName: contacts?.[0]?.profile?.name,
      type: known ? (rawType as IncomingMessage['type']) : 'other',
    }

    if (rawType === 'text') base.text = (msg.text as { body?: string })?.body
    else if (rawType === 'image') {
      base.mediaId = (msg.image as { id?: string })?.id
      base.text = (msg.image as { caption?: string })?.caption
    } else if (rawType === 'audio') {
      base.mediaId = (msg.audio as { id?: string })?.id
    } else if (rawType === 'document') {
      base.mediaId = (msg.document as { id?: string })?.id
      base.filename = (msg.document as { filename?: string })?.filename
      base.text = (msg.document as { caption?: string })?.caption
    }

    return base
  } catch {
    return null
  }
}

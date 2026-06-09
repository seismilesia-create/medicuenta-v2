import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Verifica el header `X-Hub-Signature-256` de Meta contra el raw body.
 * El raw body DEBE ser exactamente el recibido (sin re-serializar).
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false
  const esperada = 'sha256=' + createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(signatureHeader)
  const b = Buffer.from(esperada)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

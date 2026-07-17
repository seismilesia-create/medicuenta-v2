/**
 * Validación de la firma `x-signature` de los webhooks de MercadoPago.
 *
 * Por qué acá sí y en el webhook de recetas no: aquel se defiende re-consultando el pago
 * a MP y comparando el `collector_id`, así que un body falso no logra nada. Este escribe
 * directo sobre el ACCESO al sistema — un evento falsificado activaría una suscripción
 * gratis. Acá hacemos las dos cosas: firma y re-consulta.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

export interface FirmaPartes {
  ts: string
  v1: string
}

/** `x-signature: ts=1704908010,v1=618c8534...` → sus partes. Null si viene rota. */
export function parseXSignature(header: string | null | undefined): FirmaPartes | null {
  if (!header) return null
  let ts = ''
  let v1 = ''
  for (const trozo of header.split(',')) {
    const i = trozo.indexOf('=')
    if (i < 0) continue
    const k = trozo.slice(0, i).trim()
    const v = trozo.slice(i + 1).trim()
    if (k === 'ts') ts = v
    else if (k === 'v1') v1 = v
  }
  return ts && v1 ? { ts, v1 } : null
}

/**
 * El manifest que MP firma. El formato es literal y quisquilloso:
 *
 *   id:<data.id EN MINÚSCULAS>;request-id:<x-request-id>;ts:<ts>;
 *
 * Detalles que rompen la validación si se ignoran:
 *  - El `;` FINAL va.
 *  - `data.id` en minúsculas. En los pagos son numéricos y da igual, pero los id de
 *    preapproval son alfanuméricos → acá el lowercase importa de verdad.
 *  - Si falta `data.id` o `x-request-id`, su trozo se ELIMINA entero; no se deja vacío.
 */
export function buildManifest(args: {
  dataId?: string | null
  requestId?: string | null
  ts: string
}): string {
  let m = ''
  if (args.dataId) m += `id:${args.dataId.toLowerCase()};`
  if (args.requestId) m += `request-id:${args.requestId};`
  m += `ts:${args.ts};`
  return m
}

/** Comparación en tiempo constante. Distinta longitud = distinto, sin filtrar el largo. */
function igualSeguro(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/**
 * ¿La notificación la mandó MercadoPago?
 *
 * Sin `secret` devuelve false: si la variable no está cargada, preferimos ignorar los
 * eventos a procesar cualquier cosa que llegue. Un webhook que no valida es peor que uno
 * que no anda — el segundo se nota.
 */
export function validarFirma(args: {
  xSignature: string | null | undefined
  xRequestId: string | null | undefined
  dataId: string | null | undefined
  secret: string | undefined
}): boolean {
  if (!args.secret) {
    console.error('[mp/sub] falta MP_WEBHOOK_SECRET: no se valida ningún evento')
    return false
  }
  const partes = parseXSignature(args.xSignature)
  if (!partes) return false

  const manifest = buildManifest({
    dataId: args.dataId,
    requestId: args.xRequestId,
    ts: partes.ts,
  })
  const esperado = createHmac('sha256', args.secret).update(manifest).digest('hex')
  return igualSeguro(esperado, partes.v1)
}

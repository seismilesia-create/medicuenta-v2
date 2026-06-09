/** Cliente HTTP de MercadoPago (Checkout Pro). El token SIEMPRE es del médico. */

const MP_BASE = 'https://api.mercadopago.com'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function buildExternalReference(recetaId: string): string {
  return `receta:${recetaId}`
}

export function parseExternalReference(ref: string): string | null {
  if (!ref.startsWith('receta:')) return null
  const id = ref.slice('receta:'.length)
  return UUID_RE.test(id) ? id : null
}

export interface PreferenciaInput {
  recetaId: string
  titulo: string
  monto: number
  notificationUrl: string
  expiraEnDias: number
}

export function buildPreferenciaBody(input: PreferenciaInput, ahora: Date) {
  const expira = new Date(ahora.getTime() + input.expiraEnDias * 24 * 60 * 60 * 1000)
  return {
    items: [{ title: input.titulo, quantity: 1, unit_price: input.monto, currency_id: 'ARS' }],
    external_reference: buildExternalReference(input.recetaId),
    notification_url: input.notificationUrl,
    expires: true,
    expiration_date_to: expira.toISOString(),
  }
}

export async function crearPreferencia(
  accessToken: string,
  body: ReturnType<typeof buildPreferenciaBody>,
): Promise<{ id: string; initPoint: string } | null> {
  const res = await fetch(`${MP_BASE}/checkout/preferences`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    console.error('[mp] crearPreferencia error:', await res.text())
    return null
  }
  const json = (await res.json()) as { id?: string; init_point?: string; sandbox_init_point?: string }
  if (!json?.id || !json?.init_point) return null
  return { id: json.id, initPoint: json.init_point }
}

export interface PagoMP {
  id: string
  status: string
  externalReference: string
  transactionAmount: number
  collectorId: string
}

function mapPago(json: Record<string, unknown>): PagoMP {
  const collector = json.collector as { id?: unknown } | undefined
  return {
    id: String(json.id ?? ''),
    status: String(json.status ?? ''),
    externalReference: String(json.external_reference ?? ''),
    transactionAmount: Number(json.transaction_amount ?? NaN),
    collectorId: String(json.collector_id ?? collector?.id ?? ''),
  }
}

export async function consultarPago(accessToken: string, paymentId: string): Promise<PagoMP | null> {
  const res = await fetch(`${MP_BASE}/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    console.error('[mp] consultarPago error:', res.status, await res.text())
    return null
  }
  return mapPago((await res.json()) as Record<string, unknown>)
}

/** Reconciliación: busca un pago APROBADO por external_reference (por si el webhook se perdió). */
export async function buscarPagoAprobadoPorReferencia(
  accessToken: string,
  externalReference: string,
): Promise<PagoMP | null> {
  const url = `${MP_BASE}/v1/payments/search?sort=date_created&criteria=desc&external_reference=${encodeURIComponent(externalReference)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) return null
  const json = (await res.json()) as { results?: Record<string, unknown>[] }
  const aprobado = (json.results ?? []).map(mapPago).find((p) => p.status === 'approved')
  return aprobado ?? null
}

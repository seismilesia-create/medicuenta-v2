/**
 * Suscripciones de MercadoPago (API `preapproval`) — la Pieza B: MediCuenta le cobra
 * al médico.
 *
 * OJO, es la dirección OPUESTA a client.ts/oauth.ts. Ahí el token es del MÉDICO (él le
 * cobra al paciente y la plata va a su cuenta). Acá el token es de MediCuenta y la plata
 * viene hacia nosotros. No comparten nada salvo el proveedor: no mezclar los tokens.
 *
 * Va SIN plan asociado y con `status: 'pending'` a propósito: es la única rama que NO
 * exige tokenizar la tarjeta (con plan, MP obliga a card_token_id + status authorized,
 * o sea Checkout API/Bricks del lado nuestro). El médico pone la tarjeta en MP.
 */
import type { Plan } from '@/lib/admin/planes'

const MP_BASE = 'https://api.mercadopago.com'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Mínimo real de MP para cobrar con tarjeta en AR. Los ejemplos oficiales usan 10 y no cobran. */
export const MONTO_MINIMO_ARS = 100

export function buildExternalReference(medicoId: string): string {
  return `suscripcion:${medicoId}`
}

/** El inverso: de la referencia al médico. Null si no es nuestra o el id no es un UUID. */
export function parseExternalReference(ref: string): string | null {
  if (!ref?.startsWith('suscripcion:')) return null
  const id = ref.slice('suscripcion:'.length)
  return UUID_RE.test(id) ? id : null
}

export interface PreapprovalInput {
  medicoId: string
  plan: Plan
  montoArs: number
  /** El email de la cuenta de MP del médico (D11): si no coincide, MP rechaza el pago. */
  payerEmail: string
  backUrl: string
}

/**
 * El body de POST /preapproval. `reason`, `external_reference` y `back_url` son
 * obligatorios sin plan (la reference los marca "optional" en el tipo, pero el texto
 * los exige).
 *
 * Sin `start_date`/`end_date`: MP ignora start_date en silencio si no va con end_date,
 * y no queremos que la suscripción venza sola.
 */
export function buildPreapprovalBody(input: PreapprovalInput) {
  return {
    reason: `MediCuenta - Plan ${input.plan === 'full' ? 'Full' : 'Basico'}`,
    external_reference: buildExternalReference(input.medicoId),
    back_url: input.backUrl,
    payer_email: input.payerEmail,
    status: 'pending' as const,
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months' as const,
      transaction_amount: input.montoArs,
      currency_id: 'ARS' as const,
    },
  }
}

export type StatusPreapproval = 'pending' | 'authorized' | 'paused' | 'cancelled'

/**
 * Normaliza el status crudo.
 *
 * ⚠ MP se contradice consigo mismo: la reference dice `canceled` (una L) y todos los
 * SDK usan `cancelled` (dos L). Aceptamos las dos y devolvemos una sola forma. Un valor
 * desconocido devuelve null: el enum de MP es un conjunto abierto y no vamos a romper
 * ni a inventar un estado por un valor que no conocemos.
 */
export function normalizarStatusPreapproval(raw: unknown): StatusPreapproval | null {
  const s = String(raw ?? '').toLowerCase()
  if (s === 'pending' || s === 'authorized' || s === 'paused') return s
  if (s === 'cancelled' || s === 'canceled') return 'cancelled'
  return null
}

export interface PreapprovalMP {
  id: string
  status: StatusPreapproval | null
  externalReference: string
  /** Cuándo cae el próximo cobro. Es de donde sale `current_period_end`. */
  nextPaymentDate: string | null
  transactionAmount: number | null
}

/** Mapea la respuesta de MP. Defensivo: los tipos de la doc no coinciden con la realidad
 *  (transaction_amount aparece como number y como string según la fuente). */
export function parsePreapproval(json: unknown): PreapprovalMP | null {
  if (!json || typeof json !== 'object') return null
  const o = json as Record<string, unknown>
  const id = String(o.id ?? '')
  if (!id) return null

  const auto = (o.auto_recurring ?? {}) as Record<string, unknown>
  const montoCrudo = auto.transaction_amount
  const monto = montoCrudo == null ? null : Number(montoCrudo)

  return {
    id,
    status: normalizarStatusPreapproval(o.status),
    externalReference: String(o.external_reference ?? ''),
    nextPaymentDate: typeof o.next_payment_date === 'string' ? o.next_payment_date : null,
    transactionAmount: monto != null && Number.isFinite(monto) ? monto : null,
  }
}

// ── Efectos ────────────────────────────────────────────────────────────────
// El token SIEMPRE es el de MediCuenta (MP_PLATAFORMA_ACCESS_TOKEN), nunca el del médico.

function headers(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

export interface PreapprovalCreado {
  id: string
  /** A dónde mandamos al médico a poner la tarjeta. No existe sandbox_init_point acá. */
  initPoint: string
}

export async function crearPreapproval(
  token: string,
  body: ReturnType<typeof buildPreapprovalBody>,
): Promise<PreapprovalCreado | null> {
  let res: Response
  try {
    res = await fetch(`${MP_BASE}/preapproval`, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify(body),
    })
  } catch (e) {
    console.error('[mp/sub] crearPreapproval: fallo de red', e)
    return null
  }
  if (!res.ok) {
    // El body puede traer el payer_email; logueamos solo el status y el error de MP.
    console.error('[mp/sub] crearPreapproval rechazado:', res.status, await res.text())
    return null
  }
  const json = (await res.json()) as { id?: string; init_point?: string }
  if (!json?.id || !json?.init_point) {
    console.error('[mp/sub] crearPreapproval: respuesta sin id o init_point')
    return null
  }
  return { id: json.id, initPoint: json.init_point }
}

export async function consultarPreapproval(token: string, id: string): Promise<PreapprovalMP | null> {
  const res = await fetch(`${MP_BASE}/preapproval/${encodeURIComponent(id)}`, {
    headers: headers(token),
  })
  if (!res.ok) {
    console.error('[mp/sub] consultarPreapproval:', res.status)
    return null
  }
  return parsePreapproval(await res.json())
}

/** Cancela. ⚠ En MP es IRREVERSIBLE: para pausas temporales va `pausarPreapproval`. */
export async function cancelarPreapproval(token: string, id: string): Promise<boolean> {
  const res = await fetch(`${MP_BASE}/preapproval/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify({ status: 'cancelled' }),
  })
  if (!res.ok) console.error('[mp/sub] cancelarPreapproval:', res.status, await res.text())
  return res.ok
}

/**
 * Cambia el monto de una suscripción ya autorizada (R6: el precio se actualiza por
 * inflación). Es el mecanismo oficial documentado.
 *
 * ⚠ NO está confirmado si un aumento grande obliga al médico a re-autorizar. La doc no
 * lo menciona, pero ausencia de mención no es ausencia de límite: probarlo antes de
 * subir precios en producción.
 */
export async function actualizarMonto(token: string, id: string, montoArs: number): Promise<boolean> {
  const res = await fetch(`${MP_BASE}/preapproval/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify({ auto_recurring: { transaction_amount: montoArs, currency_id: 'ARS' } }),
  })
  if (!res.ok) console.error('[mp/sub] actualizarMonto:', res.status, await res.text())
  return res.ok
}

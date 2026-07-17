import { createServiceClient } from '@/lib/supabase/server'
import { validarFirma } from '@/lib/mercadopago/firma'
import {
  consultarPreapproval,
  consultarCuota,
  parseExternalReference,
} from '@/lib/mercadopago/preapproval'
import {
  decidirPorPreapproval,
  decidirPorCuota,
  type AccionSuscripcion,
} from '@/lib/mercadopago/decidirSuscripcion'

export const runtime = 'nodejs' // service-role + crypto para la firma

/**
 * Webhook de SUSCRIPCIONES (spec F4.3 §9). Ruta aparte de `/api/mercadopago/webhook`,
 * que es el de las recetas: son integraciones opuestas (allá cobra el médico con SU
 * token; acá cobra MediCuenta con el suyo) y mezclarlas sería pedir un accidente.
 *
 * Cómo se defiende, en orden:
 *  1. Firma `x-signature` (HMAC, constant-time). Sin secreto configurado no procesa nada.
 *  2. NUNCA cree en el body: el estado sale de re-consultar la API de MP.
 *  3. Idempotencia por id de evento: MP exige activar el topic `payment` ADEMÁS de los
 *     de suscripción, así que el mismo cobro llega duplicado por dos vías.
 *  4. El médico se resuelve por `external_reference`/`mp_subscription_id` que vienen de
 *     MP, jamás por algo del querystring.
 *
 * Siempre 200: MP reintenta cada 15 min si no lo recibe, y un 500 nuestro por un evento
 * que no entendemos nos deja un reintento en loop.
 */
export async function POST(req: Request) {
  const url = new URL(req.url)

  let body: { type?: string; topic?: string; data?: { id?: string | number } } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    // MP también notifica por querystring (IPN legacy).
  }

  const tipo = String(body.type ?? body.topic ?? url.searchParams.get('type') ?? url.searchParams.get('topic') ?? '')
  // La doc dice tomar data.id del QUERY, pero eso solo está documentado para `payment`;
  // para suscripciones no está confirmado que lo mande. Probamos query y caemos al body.
  const dataId = String(url.searchParams.get('data.id') ?? body.data?.id ?? '')

  const firmaOk = validarFirma({
    xSignature: req.headers.get('x-signature'),
    xRequestId: req.headers.get('x-request-id'),
    dataId,
    secret: process.env.MP_WEBHOOK_SECRET,
  })
  if (!firmaOk) {
    console.error(`[mp/sub] firma inválida (tipo=${tipo}) — se ignora`)
    return new Response('OK', { status: 200 })
  }

  // `payment` llega por el mismo cobro que `subscription_authorized_payment`. Lo
  // procesamos por el segundo, que trae la cuota y el pago juntos.
  if (tipo !== 'subscription_preapproval' && tipo !== 'subscription_authorized_payment') {
    return new Response('OK', { status: 200 })
  }
  if (!dataId) return new Response('OK', { status: 200 })

  const token = process.env.MP_PLATAFORMA_ACCESS_TOKEN?.trim()
  if (!token) {
    console.error('[mp/sub] falta MP_PLATAFORMA_ACCESS_TOKEN')
    return new Response('OK', { status: 200 })
  }

  try {
    const db = createServiceClient()

    const idEvento = `${tipo}:${dataId}`

    // Idempotencia: se CONSULTA acá y se REGISTRA recién al final, después de aplicar el
    // cambio. Al revés (registrar primero) parece más seguro y es peor: si MP no
    // responde o falla el update, el evento queda marcado como procesado y el reintento
    // de MP se ignora para siempre → el médico paga y no se le activa nada nunca.
    //
    // El riesgo de dar esta vuelta (dos duplicados simultáneos se procesan los dos) no
    // hace daño: el update se DERIVA de los datos de MP — mismo debit_date, mismo
    // current_period_end — así que aplicarlo dos veces deja exactamente el mismo estado.
    // Perder un evento cuesta plata; repetirlo no.
    const { data: yaVisto } = await db
      .from('mp_eventos_suscripcion')
      .select('id')
      .eq('id', idEvento)
      .maybeSingle()
    if (yaVisto) {
      console.log(`[mp/sub] evento repetido, se ignora: ${idEvento}`)
      return new Response('OK', { status: 200 })
    }

    let accion: AccionSuscripcion
    let medicoId: string | null = null
    let preapprovalId: string | null = null
    let statusCrudo: string | null = null

    if (tipo === 'subscription_preapproval') {
      const pre = await consultarPreapproval(token, dataId)
      if (!pre) return new Response('OK', { status: 200 })
      medicoId = parseExternalReference(pre.externalReference)
      preapprovalId = pre.id
      statusCrudo = pre.status
      accion = decidirPorPreapproval(pre.status, pre.nextPaymentDate)
    } else {
      const c = await consultarCuota(token, dataId)
      if (!c) return new Response('OK', { status: 200 })
      medicoId = parseExternalReference(c.externalReference)
      preapprovalId = c.preapprovalId
      statusCrudo = c.cuota.status
      accion = decidirPorCuota(c.cuota)
    }

    // Si MP no mandó una referencia nuestra, lo buscamos por el id del preapproval.
    if (!medicoId && preapprovalId) {
      const { data } = await db
        .from('suscripciones')
        .select('medico_id')
        .eq('mp_subscription_id', preapprovalId)
        .maybeSingle<{ medico_id: string }>()
      medicoId = data?.medico_id ?? null
    }
    if (!medicoId) {
      console.error(`[mp/sub] evento sin médico identificable (${idEvento}, pre=${preapprovalId})`)
      return new Response('OK', { status: 200 })
    }

    if (accion.accion === 'ignorar') {
      // Se marca visto igual: lo entendimos y decidimos no hacer nada. Reprocesarlo
      // daría lo mismo, pero no hay razón para volver a pegarle a MP.
      await marcarVisto(db, idEvento, tipo)
      console.log(`[mp/sub] ${idEvento} → ignorar: ${accion.motivo}`)
      return new Response('OK', { status: 200 })
    }

    const fila: Record<string, unknown> = {
      estado: accion.estado,
      mp_preapproval_status: statusCrudo,
      ultimo_evento_mp: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    // Solo pisamos el período si MP nos dio uno: si no, dejamos el que había en vez de
    // borrarlo y hacerle creer al médico que no pagó nunca.
    if (accion.currentPeriodEnd) fila.current_period_end = accion.currentPeriodEnd
    if (preapprovalId) fila.mp_subscription_id = preapprovalId

    // service-role a propósito: `suscripciones` no tiene INSERT/UPDATE por RLS.
    const { error } = await db.from('suscripciones').update(fila).eq('medico_id', medicoId)
    if (error) {
      // NO lo marcamos visto: que el reintento de MP (cada 15 min) lo vuelva a
      // intentar. Es exactamente el caso que la idempotencia mal puesta se comía.
      console.error('[mp/sub] no se pudo actualizar la suscripción:', error.message)
      return new Response('OK', { status: 200 })
    }

    await marcarVisto(db, idEvento, tipo)
    console.log(`[mp/sub] ${idEvento} medico=${medicoId} → ${accion.estado}`)
  } catch (e) {
    console.error('[mp/sub] webhook error:', e)
  }
  return new Response('OK', { status: 200 })
}

/** Registra el evento como procesado. Idempotente: el duplicado simultáneo no rompe. */
async function marcarVisto(
  db: ReturnType<typeof createServiceClient>,
  id: string,
  tipo: string,
): Promise<void> {
  const { error } = await db.from('mp_eventos_suscripcion').upsert({ id, tipo }, { onConflict: 'id' })
  if (error) console.error('[mp/sub] no se pudo marcar el evento como visto:', error.message)
}

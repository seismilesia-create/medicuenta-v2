import { createServiceClient } from '@/lib/supabase/server'
import { consultarPago } from '@/lib/mercadopago/client'
import { procesarPagoNotificado, type ProcesarPagoDeps } from '@/lib/mercadopago/procesarPago'
import { procesarPagoCobroNotificado, type ProcesarPagoCobroDeps } from '@/lib/mercadopago/procesarPagoCobro'
import { getConexionActiva } from '@/features/whatsapp/services/mpConexiones'
import { resolverSaliente } from '@/features/whatsapp/services/nodos'
import { getRecetaDelMedico, marcarPagada, marcarDevuelta } from '@/features/whatsapp/services/recetasService'
import { entregarReceta } from '@/features/whatsapp/services/entrega'
import { marcarCobrado, marcarDevuelto } from '@/features/cobros/services/cobrosService'
import { sendWhatsAppText } from '@/lib/whatsapp/client'
import { sendPushToUser } from '@/features/notifications/services/send-push'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: Request) {
  const url = new URL(req.url)

  let body: { type?: string; topic?: string; data?: { id?: number | string } } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    // MP también notifica con query params (IPN legacy); seguimos con la URL.
  }

  const tipo = String(body.type ?? body.topic ?? url.searchParams.get('type') ?? url.searchParams.get('topic') ?? '')
  const paymentId = String(body.data?.id ?? url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? '')
  const recetaId = url.searchParams.get('receta') ?? ''
  const cobroId = url.searchParams.get('cobro') ?? ''

  // Solo notificaciones de pago con un objeto nuestro identificable en la URL.
  // Ramas disjuntas: ?receta= (entrega de recetas) vs ?cobro= (plus/particular).
  if (tipo === 'payment' && paymentId) {
    if (UUID_RE.test(recetaId)) await webhookReceta(recetaId, paymentId)
    else if (UUID_RE.test(cobroId)) await webhookCobro(cobroId, paymentId)
  }
  return new Response('OK', { status: 200 })
}

async function webhookReceta(recetaId: string, paymentId: string): Promise<void> {
  try {
    const db = createServiceClient()

    // La receta se busca SIN asumir el médico: primero la fila (por id), y todo lo
    // demás se valida contra MP con el token del médico dueño (decidirAccionPago).
    const { data: recetaRow } = await db
      .from('recetas')
      .select('id, medico_id, monto, estado')
      .eq('id', recetaId)
      .maybeSingle()

    const deps: ProcesarPagoDeps = {
      getReceta: async () =>
        (recetaRow as { id: string; medico_id: string; monto: number | null; estado: string } | null) ?? null,
      getConexion: (medicoId) => getConexionActiva(db, medicoId),
      consultarPago: (token, id) => consultarPago(token, id),
      marcarPagada: (medicoId, id, paymentId2) => marcarPagada(db, medicoId, id, paymentId2),
      marcarDevuelta: (medicoId, id) => marcarDevuelta(db, medicoId, id),
      entregar: async (id) => {
        const medicoId = (recetaRow as { medico_id: string } | null)?.medico_id
        if (!medicoId) return false
        const receta = await getRecetaDelMedico(db, medicoId, id)
        const canal = await resolverSaliente(db, medicoId)
        if (!receta || !canal) return false
        return entregarReceta(db, canal, receta)
      },
      avisarMedico: async (medicoId, texto) => {
        const canal = await resolverSaliente(db, medicoId)
        if (!canal) return
        await sendWhatsAppText({
          phoneNumberId: canal.phoneNumberId,
          accessToken: canal.accessToken,
          to: canal.numeroPersonal,
          text: texto,
        })
      },
    }

    const out = await procesarPagoNotificado(deps, { recetaId, paymentId })
    console.log(`[mp] webhook receta=${recetaId} payment=${paymentId} → ${out}`)
  } catch (e) {
    console.error('[mp] webhook receta error:', e)
  }
}

async function webhookCobro(cobroId: string, paymentId: string): Promise<void> {
  try {
    const db = createServiceClient()

    // Mismo contrato que la rama receta: la fila se busca por id sin asumir médico
    // y el pago se re-consulta con el token del dueño (decidirAccionPagoCobro).
    const { data: cobroRow } = await db
      .from('cobros')
      .select('id, medico_id, concepto, monto, estado, paciente_nombre')
      .eq('id', cobroId)
      .maybeSingle()

    const deps: ProcesarPagoCobroDeps = {
      getCobro: async () =>
        (cobroRow as {
          id: string
          medico_id: string
          concepto: string
          monto: number
          estado: string
          paciente_nombre: string | null
        } | null) ?? null,
      getConexion: (medicoId) => getConexionActiva(db, medicoId),
      consultarPago: (token, id) => consultarPago(token, id),
      marcarCobrado: (medicoId, id, paymentId2) => marcarCobrado(db, medicoId, id, paymentId2),
      marcarDevuelto: (medicoId, id) => marcarDevuelto(db, medicoId, id),
      notificarMedico: async (medicoId, aviso) => {
        // El aviso de un cobro va por push al panel (no por WhatsApp: es plata
        // del mostrador). Sin suscripción o sin VAPID no rompe el webhook.
        try {
          await sendPushToUser(medicoId, {
            title: aviso.titulo,
            body: aviso.cuerpo,
            url: '/agenda',
            tag: 'cobro',
          })
        } catch (e) {
          console.error('[mp] push cobro falló:', e)
        }
      },
    }

    const out = await procesarPagoCobroNotificado(deps, { cobroId, paymentId })
    console.log(`[mp] webhook cobro=${cobroId} payment=${paymentId} → ${out}`)
  } catch (e) {
    console.error('[mp] webhook cobro error:', e)
  }
}

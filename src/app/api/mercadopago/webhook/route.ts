import { createServiceClient } from '@/lib/supabase/server'
import { consultarPago } from '@/lib/mercadopago/client'
import { procesarPagoNotificado, type ProcesarPagoDeps } from '@/lib/mercadopago/procesarPago'
import { getConexionActiva } from '@/features/whatsapp/services/mpConexiones'
import { resolverSaliente } from '@/features/whatsapp/services/nodos'
import { getRecetaDelMedico, marcarPagada, marcarDevuelta } from '@/features/whatsapp/services/recetasService'
import { entregarReceta } from '@/features/whatsapp/services/entrega'
import { sendWhatsAppText } from '@/lib/whatsapp/client'

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

  // Solo procesamos notificaciones de pago con una receta nuestra identificable.
  if (tipo !== 'payment' || !paymentId || !UUID_RE.test(recetaId)) {
    return new Response('OK', { status: 200 })
  }

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
    console.error('[mp] webhook error:', e)
  }
  return new Response('OK', { status: 200 })
}

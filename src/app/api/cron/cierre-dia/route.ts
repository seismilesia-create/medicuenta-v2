import { createServiceClient } from '@/lib/supabase/server'
import { hoyArgentina } from '@/shared/lib/fechas'
import { AR_OFFSET } from '@/lib/turnos/slots'
import { getResumenDia } from '@/features/cierre/services/cierreService'
import { sendPushToUser } from '@/features/notifications/services/send-push'

export const runtime = 'nodejs'

const $ = (n: number) => `$${(Number(n) || 0).toLocaleString('es-AR')}`

/**
 * Cron de las 23:00 ART (vercel.json "0 2 * * *" UTC; AR sin DST): cierra el
 * día de cada médico con actividad y le manda el resumen por push, aunque
 * nadie haya cerrado a mano. ON CONFLICT DO NOTHING: el cierre manual GANA.
 */
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const db = createServiceClient()
  const fecha = hoyArgentina()
  const desdeIso = new Date(`${fecha}T00:00:00${AR_OFFSET}`).toISOString()
  const hastaIso = new Date(new Date(desdeIso).getTime() + 86_400_000).toISOString()

  // Médicos con actividad hoy: cargaron órdenes, cobraron o tuvieron turnos.
  const [ordenesRes, cobrosRes, turnosRes] = await Promise.all([
    db.from('ordenes').select('medico_id').gte('created_at', desdeIso).lt('created_at', hastaIso),
    db.from('cobros').select('medico_id').gte('created_at', desdeIso).lt('created_at', hastaIso),
    db.from('wa_turnos').select('medico_id').gte('starts_at', desdeIso).lt('starts_at', hastaIso).neq('estado', 'cancelado'),
  ])
  const medicos = new Set<string>([
    ...(((ordenesRes.data as { medico_id: string }[] | null) ?? []).map((r) => r.medico_id)),
    ...(((cobrosRes.data as { medico_id: string }[] | null) ?? []).map((r) => r.medico_id)),
    ...(((turnosRes.data as { medico_id: string }[] | null) ?? []).map((r) => r.medico_id)),
  ])

  let cerrados = 0
  let pushes = 0
  for (const medicoId of medicos) {
    try {
      const resumen = await getResumenDia(db, medicoId, fecha)
      const { error } = await db.from('cierres_dia').upsert(
        {
          medico_id: medicoId,
          fecha,
          snapshot: resumen,
          total_honorarios: resumen.ordenes.honorariosTotal,
          total_plus: resumen.caja.plusTotal,
          total_mp: resumen.caja.porMedio.mercadopago,
          cerrado_por: null, // cierre automático
        },
        { onConflict: 'medico_id,fecha', ignoreDuplicates: true },
      )
      if (!error) cerrados++

      try {
        const r = await sendPushToUser(medicoId, {
          title: `Cierre del día — ${$(resumen.caja.total)} en caja`,
          body: `${resumen.ordenes.total} órdenes · plus ${$(resumen.caja.plusTotal)} · MP ${$(resumen.caja.porMedio.mercadopago)} · ${resumen.turnos.atendidos} atendidos`,
          url: '/cierre',
          tag: 'cierre-dia',
        })
        pushes += r.sent
      } catch (e) {
        console.error('[cierre-dia] push falló:', medicoId, e)
      }
    } catch (e) {
      console.error('[cierre-dia] resumen falló:', medicoId, e)
    }
  }

  console.log(`[cierre-dia] ${fecha}: ${medicos.size} médicos, ${cerrados} cierres nuevos, ${pushes} pushes`)
  return Response.json({ fecha, medicos: medicos.size, cerrados, pushes })
}

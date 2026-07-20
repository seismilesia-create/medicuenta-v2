import { procesarYEnviarDigest } from '@/lib/admin/orquestadorEnvio'
import { reconciliarPruebasVencidas } from '@/lib/admin/suscripciones'
import { enviarPushTrial } from '@/features/notifications/services/trial-push'
import { createServiceClient } from '@/lib/supabase/server'

export const runtime = 'nodejs' // service-role + fetch a Resend

/**
 * Cron del orquestador (spec §6, v1b). Vercel Cron lo pega por GET a diario
 * (ver vercel.json) con `Authorization: Bearer ${CRON_SECRET}`. Calcula las
 * alertas y, si hay novedades, le manda el digest por email al dueño.
 *
 * Desde F4.3 también reconcilia las pruebas vencidas. Va ACÁ y no dentro de
 * `procesarYEnviarDigest` por dos razones:
 *  1. El orden importa: primero se pone al día la base, después se arman las alertas
 *     — así el digest dice "suspendida" y no "prueba vencida, definir si pasa a pago".
 *  2. `procesarYEnviarDigest` también lo llama el botón "Enviar ahora" del panel, y ese
 *     botón NO debería cambiarle el estado a nadie como efecto colateral.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  }

  try {
    // Si la reconciliación falla no se corta el digest: son independientes, y el dueño
    // igual quiere sus alertas. El error queda logueado adentro.
    const recon = await reconciliarPruebasVencidas(createServiceClient())
    const r = await procesarYEnviarDigest({})

    // Push de la prueba a los médicos INACTIVOS (re-enganche + urgencia de 3 días). Va
    // DESPUÉS de reconciliar: las vencidas ya pasaron a 'suspendida' y salen del set
    // 'prueba', así nadie recibe "faltan 3 días" el día que ya se venció. En su propio
    // try/catch: si el push falla, el digest al dueño ya salió igual.
    let pushTrial: Awaited<ReturnType<typeof enviarPushTrial>> | null = null
    try {
      pushTrial = await enviarPushTrial(createServiceClient())
    } catch (e) {
      console.error('Cron push trial error:', e)
    }

    return Response.json({ ok: true, ...r, suspendidas: recon.suspendidas, pushTrial })
  } catch (e) {
    console.error('Cron orquestador error:', e)
    return Response.json({ ok: false, error: 'Error interno' }, { status: 500 })
  }
}

import { procesarYEnviarDigest } from '@/lib/admin/orquestadorEnvio'

export const runtime = 'nodejs' // service-role + fetch a Resend

/**
 * Cron del orquestador (spec §6, v1b). Vercel Cron lo pega por GET a diario
 * (ver vercel.json) con `Authorization: Bearer ${CRON_SECRET}`. Calcula las
 * alertas y, si hay novedades, le manda el digest por email al dueño.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  }

  try {
    const r = await procesarYEnviarDigest({})
    return Response.json({ ok: true, ...r })
  } catch (e) {
    console.error('Cron orquestador error:', e)
    return Response.json({ ok: false, error: 'Error interno' }, { status: 500 })
  }
}

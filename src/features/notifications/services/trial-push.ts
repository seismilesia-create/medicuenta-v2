import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendPushToUser } from './send-push'
import { decidirPushTrial, mensajeTrial } from './trial-push-logic'

/**
 * Envío del push de la prueba (trial). Se corre desde el cron diario del orquestador
 * con service-role. La decisión de a quién notificar es pura y vive en
 * `trial-push-logic.ts` (testeada). Acá va solo el IO: leer suscripciones, enviar y
 * marcar el aviso como enviado.
 */

const DIA_MS = 86_400_000

interface SubRow {
  medico_id: string
  trial_ends_at: string | null
  created_at: string
  last_active_at: string | null
  push_reenganche_at: string | null
  push_urgencia_at: string | null
}

export interface ResultadoPushTrial {
  reenganche: number
  urgencia: number
  saltados: number
}

export async function enviarPushTrial(
  service: SupabaseClient,
  nowMs: number = Date.now(),
): Promise<ResultadoPushTrial> {
  const res: ResultadoPushTrial = { reenganche: 0, urgencia: 0, saltados: 0 }

  const { data, error } = await service
    .from('suscripciones')
    .select('medico_id, trial_ends_at, created_at, last_active_at, push_reenganche_at, push_urgencia_at')
    .eq('estado', 'prueba')

  if (error) {
    console.error('[trial-push] error consultando suscripciones:', error.message)
    return res
  }

  for (const row of (data ?? []) as SubRow[]) {
    const decision = decidirPushTrial(
      {
        trialEndsAt: row.trial_ends_at,
        createdAt: row.created_at,
        lastActiveAt: row.last_active_at,
        pushReenganche: row.push_reenganche_at,
        pushUrgencia: row.push_urgencia_at,
      },
      nowMs,
    )
    if (!decision) continue

    const diasRestantes = Math.ceil((new Date(row.trial_ends_at as string).getTime() - nowMs) / DIA_MS)

    try {
      const { sent } = await sendPushToUser(row.medico_id, mensajeTrial(decision, diasRestantes))
      // Solo "consumimos" el aviso si LLEGÓ a algún dispositivo. Si el médico todavía
      // no activó las notificaciones (sent=0), no marcamos → se reintenta al día
      // siguiente (dentro de la ventana), sin spamear a nadie.
      if (sent >= 1) {
        const col = decision === 'urgencia' ? 'push_urgencia_at' : 'push_reenganche_at'
        await service
          .from('suscripciones')
          .update({ [col]: new Date(nowMs).toISOString() })
          .eq('medico_id', row.medico_id)
        res[decision]++
      } else {
        res.saltados++
      }
    } catch (e) {
      console.error('[trial-push] envío falló para', row.medico_id, e)
      res.saltados++
    }
  }

  return res
}

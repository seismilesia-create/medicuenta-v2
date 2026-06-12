'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { resolverSuperadmin } from '@/features/admin/access/superadmin'
import { createServiceClient } from '@/lib/supabase/server'
import { TRIAL_DIAS } from '@/lib/admin/planes'

const schema = z.object({
  medicoId: z.string().uuid(),
  plan: z.enum(['basico', 'full']),
  estado: z.enum(['prueba', 'activa', 'morosa', 'suspendida', 'baja']),
})

/**
 * Alta/cambio de suscripción de un médico (spec §5.2). Solo el superadmin.
 * Escribe por service-role (la tabla no tiene INSERT/UPDATE por RLS). Hasta que
 * entre MercadoPago (F4.3), el dueño maneja el plan/estado a mano.
 */
export async function setSuscripcion(input: { medicoId: string; plan: string; estado: string }) {
  const sa = await resolverSuperadmin()
  if (!sa) return { error: 'No autorizado' }

  const parsed = schema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { medicoId, plan, estado } = parsed.data

  // Al pasar a "prueba", arrancamos los 15 días (DD4). En otros estados no tocamos
  // la fecha (queda como registro histórico de la prueba).
  const fila: Record<string, unknown> = { medico_id: medicoId, plan, estado, updated_at: new Date().toISOString() }
  if (estado === 'prueba') {
    fila.trial_ends_at = new Date(Date.now() + TRIAL_DIAS * 86_400_000).toISOString()
  }

  const service = createServiceClient()
  const { error } = await service
    .from('suscripciones')
    .upsert(fila, { onConflict: 'medico_id' })
  if (error) return { error: error.message }

  revalidatePath('/admin')
  return { ok: true as const }
}

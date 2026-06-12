'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { resolverSuperadmin } from '@/features/admin/access/superadmin'
import { createServiceClient } from '@/lib/supabase/server'

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

  const service = createServiceClient()
  const { error } = await service
    .from('suscripciones')
    .upsert(
      { medico_id: medicoId, plan, estado, updated_at: new Date().toISOString() },
      { onConflict: 'medico_id' },
    )
  if (error) return { error: error.message }

  revalidatePath('/admin')
  return { ok: true as const }
}

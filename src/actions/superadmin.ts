'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { resolverSuperadmin } from '@/features/admin/access/superadmin'
import { createServiceClient } from '@/lib/supabase/server'
import { TRIAL_DIAS } from '@/lib/admin/planes'
import { MONTO_MINIMO_ARS } from '@/lib/mercadopago/preapproval'

const schema = z.object({
  medicoId: z.string().uuid(),
  plan: z.enum(['basico', 'full']),
  estado: z.enum(['prueba', 'activa', 'morosa', 'suspendida', 'baja']),
})

const precioSchema = z.object({
  plan: z.enum(['basico', 'full']),
  // El mínimo real de MP para cobrar con tarjeta. Por debajo, MP no cobra y la
  // suscripción quedaría viva sin cobrar nunca (mismo CHECK que la tabla).
  montoArs: z
    .number()
    .min(MONTO_MINIMO_ARS, `El mínimo que cobra MercadoPago es $${MONTO_MINIMO_ARS}`)
    .max(10_000_000, 'Ese monto no parece real'),
})

/**
 * El precio mensual de un plan (F4.3 R6). Solo el superadmin, por service-role.
 *
 * Se edita en caliente porque en Argentina el precio se lo come la inflación y no puede
 * depender de un deploy.
 *
 * ⚠ Solo aplica a los que contraten DESDE ACÁ. Las suscripciones ya vivas siguen con el
 * precio viejo: cambiarlas requiere un PUT al preapproval de cada una, y NO está
 * confirmado si MP le exige al médico re-autorizar cuando el monto sube (D6).
 */
export async function setPrecioPlan(input: { plan: string; montoArs: number }) {
  const sa = await resolverSuperadmin()
  if (!sa) return { error: 'No autorizado' }

  const parsed = precioSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { plan, montoArs } = parsed.data

  const service = createServiceClient()
  const { error } = await service
    .from('precios_planes')
    .update({ monto_ars: montoArs, updated_at: new Date().toISOString() })
    .eq('plan', plan)
  if (error) return { error: error.message }

  revalidatePath('/admin')
  revalidatePath('/plan')
  return { ok: true as const }
}

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

'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { resolverConsultorio, esDueño } from '@/features/consultorio/access/contexto'
import { createServiceClient } from '@/lib/supabase/server'
import { siteUrl } from '@/lib/site-url'
import {
  buildPreapprovalBody,
  crearPreapproval,
  cancelarPreapproval,
  MONTO_MINIMO_ARS,
} from '@/lib/mercadopago/preapproval'
import { tokenPlataforma } from '@/lib/mercadopago/tokenPlataforma'

/**
 * La suscripción es del MÉDICO DUEÑO y de nadie más: ni la secretaria, ni un médico
 * operando otro consultorio (que no es quien paga). El id sale de `auth.uid()`, nunca
 * de un parámetro: si viniera del cliente, cualquiera podría contratar a nombre ajeno.
 */
async function ctxDueño(): Promise<{ error: string } | { medicoId: string }> {
  const r = await resolverConsultorio()
  if (!r) return { error: 'No autenticado' }
  if (!esDueño(r.ctx)) return { error: 'Solo el médico puede cambiar su plan' }
  return { medicoId: r.ctx.userId }
}

const contratarSchema = z.object({
  plan: z.enum(['basico', 'full']),
  // D11: MP valida este email contra el del pagador real y RECHAZA el pago si no
  // coinciden, con un error que no explica nada. Por eso se lo pedimos en vez de
  // asumir el de MediCuenta.
  payerEmail: z.string().trim().email('Escribí un email válido'),
})

export type ContratarInput = z.infer<typeof contratarSchema>

/**
 * Arranca la suscripción: crea el `preapproval` en MP y devuelve a dónde mandar al
 * médico a poner la tarjeta. NO lo damos por activo acá: eso lo confirma el webhook
 * cuando MP autoriza (fase 5).
 */
export async function contratarPlan(
  input: ContratarInput,
): Promise<{ error: string } | { ok: true; initPoint: string }> {
  const c = await ctxDueño()
  if ('error' in c) return c

  const parsed = contratarSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { plan, payerEmail } = parsed.data

  const token = await tokenPlataforma()
  if (!token) {
    return { error: 'El pago online todavía no está habilitado. Escribinos y lo activamos.' }
  }

  const service = createServiceClient()

  // El precio manda el servidor, jamás el cliente. NULL = todavía sin publicar.
  const { data: precio } = await service
    .from('precios_planes')
    .select('monto_ars')
    .eq('plan', plan)
    .maybeSingle<{ monto_ars: number | string | null }>()

  const monto = precio?.monto_ars == null ? null : Number(precio.monto_ars)
  if (monto == null || !Number.isFinite(monto)) {
    return { error: 'Todavía no publicamos el precio de este plan. Escribinos.' }
  }
  if (monto < MONTO_MINIMO_ARS) {
    // Guarda dura: por debajo del mínimo MP no cobra, y la suscripción quedaría viva
    // sin cobrar nunca. Mejor no crearla.
    console.error(`[suscripcion] precio ${monto} < mínimo de MP (${MONTO_MINIMO_ARS})`)
    return { error: 'El precio configurado no es válido. Escribinos.' }
  }

  const creado = await crearPreapproval(
    token,
    buildPreapprovalBody({
      medicoId: c.medicoId,
      plan,
      montoArs: monto,
      payerEmail,
      backUrl: `${siteUrl()}/plan?sub=ok`,
    }),
  )
  if (!creado) return { error: 'No pudimos crear la suscripción en MercadoPago. Probá de nuevo.' }

  // Guardamos ANTES de mandarlo a pagar: si se pierde el id, el webhook no sabría de
  // quién es el cobro y el médico pagaría sin que se le active nada.
  const { error } = await service
    .from('suscripciones')
    .update({
      plan,
      mp_subscription_id: creado.id,
      mp_payer_email: payerEmail,
      mp_preapproval_status: 'pending',
      updated_at: new Date().toISOString(),
    })
    .eq('medico_id', c.medicoId)
  if (error) {
    console.error('[suscripcion] no se pudo guardar el preapproval:', error.message)
    return { error: 'No pudimos guardar tu suscripción. Escribinos antes de reintentar.' }
  }

  revalidatePath('/plan')
  return { ok: true, initPoint: creado.initPoint }
}

/**
 * Da de baja. ⚠ En MP es IRREVERSIBLE: para volver hay que crear un preapproval nuevo.
 * La UI lo advierte antes de confirmar.
 */
export async function darDeBaja(): Promise<{ error: string } | { ok: true }> {
  const c = await ctxDueño()
  if ('error' in c) return c

  const service = createServiceClient()
  const { data: sub } = await service
    .from('suscripciones')
    .select('mp_subscription_id')
    .eq('medico_id', c.medicoId)
    .maybeSingle<{ mp_subscription_id: string | null }>()

  // Cancelamos en MP PRIMERO: si marcáramos la baja de nuestro lado y el cancel fallara,
  // le seguiríamos cobrando todos los meses a alguien que ya se fue.
  if (sub?.mp_subscription_id) {
    const token = await tokenPlataforma()
    if (!token) return { error: 'No pudimos dar de baja. Escribinos.' }
    const ok = await cancelarPreapproval(token, sub.mp_subscription_id)
    if (!ok) return { error: 'MercadoPago no pudo cancelar el débito. Probá de nuevo.' }
  }

  const { error } = await service
    .from('suscripciones')
    .update({
      estado: 'baja',
      mp_preapproval_status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('medico_id', c.medicoId)
  if (error) return { error: error.message }

  revalidatePath('/plan')
  return { ok: true }
}

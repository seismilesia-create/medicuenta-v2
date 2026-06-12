'use server'

import { z } from 'zod'
import { resolverConsultorio, esDueño } from '@/features/consultorio/access/contexto'
import { createServiceClient } from '@/lib/supabase/server'

const emailSchema = z.string().trim().toLowerCase().pipe(z.string().email('Email inválido'))

/**
 * Invitar a una secretaria (spec §7). Médico-only. Dos ramas:
 *  - cuenta YA existente (uid_por_email vía service-role) → vínculo 'activa' inmediato;
 *  - sin cuenta → 'pendiente', se activa sola en el signup (trigger handle_new_user por email).
 * Reinvitar a una revocada la reactiva (upsert por (medico_id, email)).
 */
export async function invitarSecretaria(emailRaw: string) {
  const r = await resolverConsultorio()
  if (!r) return { error: 'No autenticado' }
  if (!esDueño(r.ctx)) return { error: 'Solo el médico puede invitar' }
  const { supabase, ctx } = r

  const parsed = emailSchema.safeParse(emailRaw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const email = parsed.data

  // ¿Existe cuenta con ese email? (función service-role: el médico no puede enumerar emails)
  const service = createServiceClient()
  const { data: uid } = await service.rpc('uid_por_email', { p_email: email })
  if (uid && uid === ctx.userId) return { error: 'Ese es tu propio email' }

  const { error } = await supabase.from('equipo_consultorio').upsert(
    {
      medico_id: ctx.userId,
      secretaria_email: email,
      secretaria_id: (uid as string | null) ?? null,
      estado: uid ? 'activa' : 'pendiente',
      accepted_at: uid ? new Date().toISOString() : null,
    },
    { onConflict: 'medico_id,secretaria_email' },
  )
  if (error) return { error: error.message }
  return { ok: true as const, estado: uid ? ('activa' as const) : ('pendiente' as const) }
}

/** Revocar = corte inmediato (la función RLS deja de matchear al instante). Médico-only. */
export async function revocarSecretaria(id: string) {
  const r = await resolverConsultorio()
  if (!r) return { error: 'No autenticado' }
  if (!esDueño(r.ctx)) return { error: 'Solo el médico puede revocar' }
  const { supabase, ctx } = r
  const { error } = await supabase
    .from('equipo_consultorio')
    .update({ estado: 'revocada' })
    .eq('medico_id', ctx.userId)
    .eq('id', id)
  if (error) return { error: error.message }
  return { ok: true as const }
}

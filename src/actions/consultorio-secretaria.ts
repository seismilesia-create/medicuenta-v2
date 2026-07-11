'use server'

import { z } from 'zod'
import { resolverConsultorio, esDueño } from '@/features/consultorio/access/contexto'
import { createServiceClient } from '@/lib/supabase/server'
import { generarTokenInvitacion } from '@/features/onboarding/token'
import { siteUrl } from '@/lib/site-url'

const emailSchema = z.string().trim().toLowerCase().pipe(z.string().email('Email inválido'))

type InvitarSecretariaResult =
  | { error: string }
  | { ok: true; estado: 'activa' }
  | { ok: true; estado: 'pendiente'; url: string }

/**
 * Invitar a una secretaria (spec §7). Médico-only. Dos ramas:
 *  - cuenta YA existente (uid_por_email vía service-role) → vínculo 'activa' inmediato;
 *  - sin cuenta → 'pendiente' + token de invitación; la UI muestra el enlace
 *    (`/alta-secretaria/[token]`) para mandar por WhatsApp. Si igual se registra sola con
 *    ese email, el trigger handle_new_user también la reconoce por el match pendiente.
 * Reinvitar a una revocada la reactiva (upsert por (medico_id, email)); reinvitar a una
 * pendiente reinicia la ventana de 72h (nuevo token + invited_at).
 */
export async function invitarSecretaria(emailRaw: string): Promise<InvitarSecretariaResult> {
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

  // Cuenta YA existente → la promovemos a secretaria (rol + claim del JWT) para que el resolver,
  // el menú y el guard del middleware la traten igual que a una que se registra por invitación.
  // Single-rol (spec): si la cuenta ya tiene consultorio propio, NO la convertimos (sería un
  // lockout de su propia facturación) — la rechazamos explícitamente.
  if (uid) {
    const { count } = await service
      .from('wa_servicios')
      .select('id', { count: 'exact', head: true })
      .eq('medico_id', uid)
    if ((count ?? 0) > 0) {
      return { error: 'Esa cuenta ya tiene un consultorio propio; por ahora no puede ser secretaria.' }
    }
    await service.from('perfiles').update({ rol: 'secretaria' }).eq('id', uid)
    // app_metadata se mergea (no pisa provider/providers); el claim entra en el JWT al próximo refresh.
    await service.auth.admin.updateUserById(uid as string, { app_metadata: { rol: 'secretaria' } })

    const { error } = await supabase.from('equipo_consultorio').upsert(
      {
        medico_id: ctx.userId,
        secretaria_email: email,
        secretaria_id: uid as string,
        estado: 'activa',
        accepted_at: new Date().toISOString(),
      },
      { onConflict: 'medico_id,secretaria_email' },
    )
    if (error) return { error: error.message }
    return { ok: true as const, estado: 'activa' as const }
  }

  // Sin cuenta → 'pendiente' + token de invitación. El upsert ya usa onConflict
  // (medico_id, secretaria_email): al reinvitar, token/invited_at se pisan con los nuevos
  // (reinicia la ventana de 72h) aunque la fila ya exista (pendiente o revocada).
  const token = generarTokenInvitacion()
  const { error } = await supabase.from('equipo_consultorio').upsert(
    {
      medico_id: ctx.userId,
      secretaria_email: email,
      secretaria_id: null,
      estado: 'pendiente',
      accepted_at: null,
      token,
      invited_at: new Date().toISOString(),
    },
    { onConflict: 'medico_id,secretaria_email' },
  )
  if (error) return { error: error.message }
  return { ok: true as const, estado: 'pendiente' as const, url: `${siteUrl()}/alta-secretaria/${token}` }
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

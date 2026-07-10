// src/actions/onboarding-secretaria.ts
'use server'

import { redirect } from 'next/navigation'
import { createServiceClient, createClient } from '@/lib/supabase/server'
import { invitacionVigente } from '@/features/onboarding/token'
import { altaSecretariaSchema, type AltaSecretariaInput } from '@/features/onboarding/secretaria-types'

/**
 * La secretaria completa su invitación: valida el token contra `equipo_consultorio`
 * (pendiente, vigente 72h desde invited_at), crea la cuenta con el EMAIL INVITADO (fijo,
 * no editable por ella) y la contraseña elegida. El trigger `handle_new_user` la reconoce
 * como secretaria por el match de email pendiente (rol + claim app_metadata + activación
 * del vínculo) — esta acción NO setea rol y no toca `equipo_consultorio` salvo la lectura.
 */
export async function completarInvitacionSecretaria(
  token: string,
  input: AltaSecretariaInput
): Promise<{ error: string } | never> {
  const service = createServiceClient()

  // 1) Token válido y vigente (autoridad = servidor). Vigencia = invited_at + 72h.
  const { data: inv } = await service
    .from('equipo_consultorio')
    .select('id, estado, secretaria_email, invited_at')
    .eq('token', token)
    .maybeSingle()
  if (!inv) return { error: 'Este enlace no es válido. Pedile uno nuevo a tu médico.' }

  const expiraEn = new Date(new Date(inv.invited_at as string).getTime() + 72 * 60 * 60 * 1000).toISOString()
  if (!invitacionVigente(inv.estado as string, expiraEn, new Date())) {
    return { error: 'Este enlace ya no es válido o expiró. Pedile uno nuevo a tu médico.' }
  }

  // 2) Datos válidos.
  const parsed = altaSecretariaSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data
  const email = inv.secretaria_email as string

  // 3) Crear la cuenta con el email INVITADO (no el que elija la secretaria). SEGURIDAD:
  // NO seteamos `rol` en metadata — handle_new_user (SECURITY DEFINER) la marca 'secretaria'
  // por el match de email pendiente; forzarlo acá sería una vía de escalada (ver onboarding-medico.ts).
  const created = await service.auth.admin.createUser({
    email,
    password: d.password,
    email_confirm: true,
    user_metadata: { nombre: d.nombre, apellido: d.apellido },
  })

  if (created.error) {
    const msg = created.error.message.toLowerCase()
    const emailDuplicado = msg.includes('already') || msg.includes('registered') || msg.includes('exists')
    if (emailDuplicado) {
      return { error: 'Ese email ya tiene una cuenta. Pedile a tu médico que te reinvite, o iniciá sesión.' }
    }
    return { error: `No se pudo crear la cuenta: ${created.error.message}` }
  }

  // 4) No hace falta marcar nada más: el trigger ya activó el vínculo (secretaria_id +
  // estado='activa') y seteó el rol. Iniciar sesión automáticamente y listo.
  const supabase = await createClient()
  const { error: eLogin } = await supabase.auth.signInWithPassword({ email, password: d.password })
  if (eLogin) redirect('/login?ok=cuenta_creada')
  redirect('/agenda')
}

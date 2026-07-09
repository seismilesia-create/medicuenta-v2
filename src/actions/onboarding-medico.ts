// src/actions/onboarding-medico.ts
'use server'

import { redirect } from 'next/navigation'
import { createServiceClient, createClient } from '@/lib/supabase/server'
import { normalizeRecipient } from '@/lib/whatsapp/client'
import { generarSlugBase, siguienteSlugLibre } from '@/features/admin/medicos/slug'
import { invitacionVigente } from '@/features/onboarding/token'
import { altaMedicoSchema, type AltaMedicoInput } from '@/features/onboarding/types'

/** Deriva un slug libre a partir de nombre/apellido, evitando colisiones. */
async function slugLibrePara(
  service: ReturnType<typeof createServiceClient>,
  nombre: string,
  apellido: string
): Promise<string> {
  const base = generarSlugBase(nombre, apellido)
  const { data } = await service
    .from('wa_asignaciones')
    .select('slug_publico')
    .ilike('slug_publico', `${base}%`)
  const tomados = (data ?? []).map((r) => r.slug_publico as string)
  return siguienteSlugLibre(base, tomados)
}

/**
 * El médico completa su invitación: valida el token, crea la cuenta con la
 * contraseña ya puesta (email_confirm=true, sin email frágil), cablea nodo/slug/
 * servicio, deja el arancel básico, marca la invitación completada e inicia sesión.
 */
export async function completarInvitacionMedico(
  token: string,
  input: AltaMedicoInput
): Promise<{ error: string } | never> {
  const service = createServiceClient()

  // 1) Token válido y vigente (autoridad = servidor).
  const { data: inv } = await service
    .from('invitaciones_medico')
    .select('id, estado, expira_en, email')
    .eq('token', token)
    .maybeSingle()
  if (!inv) return { error: 'Este enlace no es válido. Pedile uno nuevo a tu administrador.' }
  if (!invitacionVigente(inv.estado as string, inv.expira_en as string, new Date())) {
    return { error: 'Este enlace ya no es válido o expiró. Pedile uno nuevo a tu administrador.' }
  }

  // 2) Datos válidos.
  const parsed = altaMedicoSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data
  const numeroPersonal = normalizeRecipient(d.numeroWhatsapp)

  // 3) Crear la cuenta (o retomar un intento previo con el mismo email).
  // SEGURIDAD: `rol` va HARDCODEADO a 'medico'. Nunca propagar input del médico
  // a user_metadata.rol: handle_new_user (SECURITY DEFINER) lee ese campo y está
  // exento del trigger proteger_columnas_admin_perfil → sería una vía de escalada.
  const metadata = {
    nombre: d.nombre, apellido: d.apellido, rol: 'medico',
    especialidad: d.especialidad, matricula: d.matricula, cuit: d.cuit, telefono: d.telefono,
    numero_personal: numeroPersonal,
  }
  let medicoId: string
  const created = await service.auth.admin.createUser({
    email: d.email,
    password: d.password,
    email_confirm: true,
    user_metadata: metadata,
  })

  if (created.error) {
    const msg = created.error.message.toLowerCase()
    const emailDuplicado = msg.includes('already') || msg.includes('registered') || msg.includes('exists')
    if (!emailDuplicado) return { error: `No se pudo crear la cuenta: ${created.error.message}` }

    // Reintento idempotente: solo si ESTA invitación ya había reclamado este email
    // y la cuenta todavía no está cableada. Si no, es un email ajeno → rechazar.
    if ((inv.email as string | null) !== d.email) {
      return { error: 'Ese email ya tiene una cuenta. Iniciá sesión o recuperá tu contraseña.' }
    }
    const { data: uid } = await service.rpc('uid_por_email', { p_email: d.email })
    if (!uid) return { error: 'Ese email ya tiene una cuenta. Iniciá sesión o recuperá tu contraseña.' }
    const yaCableado = await service.from('wa_asignaciones').select('id').eq('medico_id', uid as string).maybeSingle()
    if (yaCableado.data) {
      return { error: 'Ese email ya tiene una cuenta activa. Iniciá sesión o recuperá tu contraseña.' }
    }
    medicoId = uid as string
  } else {
    medicoId = created.data.user.id
    // Reclamar el email en la invitación (guard del reintento idempotente).
    const { error: eReclamo } = await service.from('invitaciones_medico').update({ email: d.email }).eq('id', inv.id as string)
    if (eReclamo) console.error('[completarInvitacionMedico] no se pudo reclamar el email en la invitación:', eReclamo.message)
  }

  // 4) Cablear nodo/slug/servicio (reutiliza la RPC existente).
  const slug = await slugLibrePara(service, d.nombre, d.apellido)
  const rpc = await service.rpc('onboard_medico_cablear', {
    p_medico_id: medicoId,
    p_nombre: d.nombre, p_apellido: d.apellido, p_especialidad: d.especialidad,
    p_matricula: d.matricula, p_cuit: d.cuit, p_telefono: d.telefono,
    p_slug: slug, p_numero_personal: numeroPersonal,
  })
  if (rpc.error) {
    // La invitación queda 'pendiente' → el médico puede reintentar el mismo enlace.
    if (rpc.error.message.includes('sin_cupo_nodos')) {
      return { error: 'No hay cupo disponible en este momento. Avisá a tu administrador.' }
    }
    return { error: `No se pudo completar el alta: ${rpc.error.message}` }
  }

  // 5) Arancel básico por defecto (service-role está exento del trigger de protección).
  const { error: eCategoria } = await service.from('perfiles')
    .update({ categoria_arancel: 'medica', atiende_interior: false })
    .eq('id', medicoId)
  if (eCategoria) console.error('[completarInvitacionMedico] no se pudo guardar la categoría arancelaria:', eCategoria.message)

  // 6) Marcar la invitación como completada.
  const { error: eCompletada } = await service.from('invitaciones_medico')
    .update({ estado: 'completada', completada_en: new Date().toISOString(), medico_id: medicoId })
    .eq('id', inv.id as string)
  if (eCompletada) console.error('[completarInvitacionMedico] no se pudo marcar la invitación como completada:', eCompletada.message)

  // 7) Iniciar sesión automáticamente (setea cookies vía SSR client) y al dashboard.
  const supabase = await createClient()
  const { error: eLogin } = await supabase.auth.signInWithPassword({ email: d.email, password: d.password })
  if (eLogin) redirect('/login?ok=cuenta_creada')
  redirect('/dashboard')
}

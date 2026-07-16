// src/actions/admin-medicos.ts
'use server'

import { resolverSuperadmin } from '@/features/admin/access/superadmin'
import { createServiceClient } from '@/lib/supabase/server'
import { normalizarWhatsappAr } from '@/lib/whatsapp/numeroAr'
import { type MedicoFila, type OnboardMedicoResult, editarMedicoSchema, type EditarMedicoInput, type MedicoDetalle } from '@/features/admin/medicos/types'
import { siteUrl } from '@/lib/site-url'
import { generarTokenInvitacion, invitacionVigente } from '@/features/onboarding/token'
import type { InvitacionFila } from '@/features/onboarding/invitaciones-types'

/** Verifica superadmin y devuelve error si no lo es. */
async function requireSuperadmin(): Promise<{ userId: string } | { error: string }> {
  const sa = await resolverSuperadmin()
  if (!sa) return { error: 'No autorizado' }
  return { userId: sa.userId }
}

/** Lista de médicos con su estado de cableado (para /admin/medicos). */
export async function listarMedicos(): Promise<{ data: MedicoFila[] } | { error: string }> {
  const guard = await requireSuperadmin()
  if ('error' in guard) return guard

  const service = createServiceClient()
  const { data, error } = await service.rpc('superadmin_listar_medicos')
  if (error) return { error: error.message }

  const filas: MedicoFila[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    nombre: (r.nombre as string | null) ?? null,
    apellido: (r.apellido as string | null) ?? null,
    especialidad: (r.especialidad as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    slug: (r.slug_publico as string | null) ?? null,
    link: r.slug_publico ? `${siteUrl()}/c/${r.slug_publico as string}` : null,
    cableadoActivo: (r.cableado_activo as boolean | null) ?? false,
  }))
  return { data: filas }
}

/** Traduce los errores de la RPC a mensajes para el admin. */
function traducirErrorCableado(message: string): string {
  if (message.includes('sin_cupo_nodos')) return 'No hay nodos con cupo. Hay que registrar un nodo nuevo.'
  if (message.includes('23505') || message.toLowerCase().includes('duplicate')) return 'Ese slug se usó recién, probá otro.'
  if (message.includes('perfil_inexistente')) return 'La cuenta se creó pero el perfil no está listo todavía. Reintentá el cableado.'
  return message
}

/** Trae los datos editables de un médico (para precargar el form de edición). */
export async function getMedicoDetalle(medicoId: string): Promise<{ data: MedicoDetalle } | { error: string }> {
  const guard = await requireSuperadmin()
  if ('error' in guard) return guard

  const service = createServiceClient()
  const { data: perfil, error } = await service
    .from('perfiles')
    .select('nombre, apellido, especialidad, matricula, cuit, telefono, categoria_arancel, atiende_interior')
    .eq('id', medicoId)
    .maybeSingle()
  if (error) return { error: error.message }
  if (!perfil) return { error: 'Médico no encontrado' }

  const { data: asig } = await service
    .from('wa_asignaciones')
    .select('numero_personal, slug_publico')
    .eq('medico_id', medicoId)
    .maybeSingle()

  return {
    data: {
      nombre: (perfil.nombre as string | null) ?? '',
      apellido: (perfil.apellido as string | null) ?? '',
      especialidad: (perfil.especialidad as string | null) ?? '',
      matricula: (perfil.matricula as string | null) ?? '',
      cuit: (perfil.cuit as string | null) ?? '',
      telefono: (perfil.telefono as string | null) ?? '',
      numeroWhatsapp: (asig?.numero_personal as string | null) ?? '',
      slug: (asig?.slug_publico as string | null) ?? null,
      categoria_arancel: (perfil.categoria_arancel as 'medica' | 'especialista' | 'oftalmologica' | 'oftalmologica_recertificado' | null) ?? '',
      atiende_interior: (perfil.atiende_interior as boolean | null) ?? false,
    },
  }
}

/** Actualiza identidad (perfiles) + número de WhatsApp (wa_asignaciones) de un médico. */
export async function actualizarMedico(medicoId: string, input: EditarMedicoInput): Promise<{ ok: true } | { error: string }> {
  const guard = await requireSuperadmin()
  if ('error' in guard) return guard

  const parsed = editarMedicoSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data

  const service = createServiceClient()
  const { error: e1 } = await service
    .from('perfiles')
    .update({
      nombre: d.nombre,
      apellido: d.apellido,
      especialidad: d.especialidad || null,
      matricula: d.matricula || null,
      cuit: d.cuit || null,
      telefono: d.telefono || null,
      categoria_arancel: d.categoria_arancel ?? null,
      atiende_interior: d.atiende_interior,
    })
    .eq('id', medicoId)
  if (e1) return { error: e1.message }

  const numeroPersonal = normalizarWhatsappAr(d.numeroWhatsapp)
  if (!numeroPersonal) return { error: 'Número de WhatsApp inválido (ej: 383 4222049)' }
  const { error: e2 } = await service
    .from('wa_asignaciones')
    .update({ numero_personal: numeroPersonal })
    .eq('medico_id', medicoId)
  if (e2) return { error: e2.message }

  return { ok: true }
}

/** Reintento idempotente del cableado: relee la "memoria del intento" de raw_user_meta_data. */
export async function reintentarCableado(medicoId: string): Promise<OnboardMedicoResult | { error: string }> {
  const guard = await requireSuperadmin()
  if ('error' in guard) return guard

  const service = createServiceClient()
  const u = await service.auth.admin.getUserById(medicoId)
  if (u.error || !u.data.user) return { error: 'No se encontró la cuenta del médico.' }

  const m = (u.data.user.user_metadata ?? {}) as Record<string, string>
  if (!m.slug || !m.numero_personal) return { error: 'Faltan datos del intento original; cargá el médico de nuevo.' }

  const rpc = await service.rpc('onboard_medico_cablear', {
    p_medico_id: medicoId,
    p_nombre: m.nombre ?? '',
    p_apellido: m.apellido ?? '',
    p_especialidad: m.especialidad ?? '',
    p_matricula: m.matricula ?? '',
    p_cuit: m.cuit ?? '',
    p_telefono: m.telefono ?? '',
    p_slug: m.slug,
    p_numero_personal: m.numero_personal,
  })
  if (rpc.error) return { error: traducirErrorCableado(rpc.error.message) }

  return { slug: m.slug, link: `${siteUrl()}/c/${m.slug}`, medicoId }
}

/** Genera una invitación de alta para un médico. Devuelve el enlace copiable. */
export async function generarInvitacionMedico(
  nombreReferencia?: string
): Promise<{ token: string; url: string } | { error: string }> {
  const guard = await requireSuperadmin()
  if ('error' in guard) return guard

  const service = createServiceClient()
  const token = generarTokenInvitacion()
  const { error } = await service.from('invitaciones_medico').insert({
    token,
    estado: 'pendiente',
    nombre_referencia: nombreReferencia?.trim() || null,
    creada_por: guard.userId,
  })
  if (error) return { error: error.message }

  return { token, url: `${siteUrl()}/alta/${token}` }
}

/** Lista de invitaciones (para el panel admin). */
export async function listarInvitaciones(): Promise<{ data: InvitacionFila[] } | { error: string }> {
  const guard = await requireSuperadmin()
  if ('error' in guard) return guard

  const service = createServiceClient()
  const { data, error } = await service
    .from('invitaciones_medico')
    .select('id, token, estado, nombre_referencia, expira_en, created_at, medico_id')
    .order('created_at', { ascending: false })
  if (error) return { error: error.message }

  const ahora = new Date()
  const filas: InvitacionFila[] = (data ?? []).map((r) => ({
    id: r.id as string,
    nombreReferencia: (r.nombre_referencia as string | null) ?? null,
    estado: r.estado as string,
    vigente: invitacionVigente(r.estado as string, r.expira_en as string, ahora),
    url: `${siteUrl()}/alta/${r.token as string}`,
    creadaEn: r.created_at as string,
    medicoId: (r.medico_id as string | null) ?? null,
  }))
  return { data: filas }
}

/** Revoca una invitación pendiente. */
export async function revocarInvitacion(id: string): Promise<{ ok: true } | { error: string }> {
  const guard = await requireSuperadmin()
  if ('error' in guard) return guard

  const service = createServiceClient()
  const { error } = await service
    .from('invitaciones_medico')
    .update({ estado: 'revocada' })
    .eq('id', id)
    .eq('estado', 'pendiente')
  if (error) return { error: error.message }
  return { ok: true }
}

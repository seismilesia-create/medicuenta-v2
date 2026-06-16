// src/actions/admin-medicos.ts
'use server'

import { resolverSuperadmin } from '@/features/admin/access/superadmin'
import { createServiceClient } from '@/lib/supabase/server'
import { normalizeRecipient } from '@/lib/whatsapp/client'
import { onboardMedicoSchema, type OnboardMedicoInput, type MedicoFila, type OnboardMedicoResult } from '@/features/admin/medicos/types'

function siteUrl(): string {
  // El proyecto usa PUBLIC_BASE_URL (no NEXT_PUBLIC_SITE_URL) para la URL pública server-side.
  return process.env.PUBLIC_BASE_URL || 'http://localhost:3000'
}

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

/** ¿El slug está libre? (para el check en vivo del formulario) */
export async function chequearSlugDisponible(slug: string): Promise<{ disponible: boolean } | { error: string }> {
  const guard = await requireSuperadmin()
  if ('error' in guard) return guard

  const service = createServiceClient()
  const { count, error } = await service
    .from('wa_asignaciones')
    .select('id', { head: true, count: 'exact' })
    .eq('slug_publico', slug)
  if (error) return { error: error.message }
  return { disponible: (count ?? 0) === 0 }
}

/** Traduce los errores de la RPC a mensajes para el admin. */
function traducirErrorCableado(message: string): string {
  if (message.includes('sin_cupo_nodos')) return 'No hay nodos con cupo. Hay que registrar un nodo nuevo.'
  if (message.includes('23505') || message.toLowerCase().includes('duplicate')) return 'Ese slug se usó recién, probá otro.'
  if (message.includes('perfil_inexistente')) return 'La cuenta se creó pero el perfil no está listo todavía. Reintentá el cableado.'
  return message
}

/** Onboarding completo: cuenta + identidad + servicio + cableado WhatsApp. */
export async function onboardMedico(input: OnboardMedicoInput): Promise<OnboardMedicoResult | { error: string }> {
  const guard = await requireSuperadmin()
  if ('error' in guard) return guard

  const parsed = onboardMedicoSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data

  const service = createServiceClient()

  // Pre-check de slug (UX; la autoridad es el UNIQUE de la DB).
  const yaUsado = await service.from('wa_asignaciones').select('id').eq('slug_publico', d.slug).maybeSingle()
  if (yaUsado.data) return { error: 'Ese slug ya está en uso, elegí otro.' }

  const numeroPersonal = normalizeRecipient(d.numeroWhatsapp)

  // Crear la cuenta + invitar. Pasamos TODA la identidad en data: el trigger lee
  // nombre/apellido/rol; el resto queda como "memoria del intento" para reintentar.
  const redirectTo = `${siteUrl()}/api/auth/callback?next=/update-password`
  const invited = await service.auth.admin.inviteUserByEmail(d.email, {
    data: {
      nombre: d.nombre,
      apellido: d.apellido,
      rol: 'medico',
      especialidad: d.especialidad,
      matricula: d.matricula,
      cuit: d.cuit,
      telefono: d.telefono,
      numero_personal: numeroPersonal,
      slug: d.slug,
    },
    redirectTo,
  })
  if (invited.error) return { error: `No se pudo invitar: ${invited.error.message}` }
  const medicoId = invited.data.user.id

  // Cableado atómico.
  const rpc = await service.rpc('onboard_medico_cablear', {
    p_medico_id: medicoId,
    p_nombre: d.nombre,
    p_apellido: d.apellido,
    p_especialidad: d.especialidad,
    p_matricula: d.matricula,
    p_cuit: d.cuit,
    p_telefono: d.telefono,
    p_slug: d.slug,
    p_numero_personal: numeroPersonal,
  })
  if (rpc.error) return { error: traducirErrorCableado(rpc.error.message) }

  return { slug: d.slug, link: `${siteUrl()}/c/${d.slug}`, medicoId }
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

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { normalizarPlan, type Plan } from '@/lib/admin/planes'

export type RolConsultorio = 'medico' | 'secretaria'

export interface MedicoOpcion {
  id: string
  nombre: string | null
}

export interface ConsultorioContexto {
  /** auth.uid() real — quién hace la acción (auditoría: creado_por, firma de la secretaria). */
  userId: string
  rol: RolConsultorio
  nombre: string | null
  /** El médico cuyos datos se ven/operan. null = secretaria sin vínculo activo (revocada). */
  medicoActivoId: string | null
  /** Todos los consultorios que puede operar (para el selector multi-consultorio). */
  medicos: MedicoOpcion[]
  /** Plan del consultorio activo: canda el acceso al asistente/WhatsApp (Full). */
  plan: Plan
}

export const COOKIE_CONSULTORIO = 'consultorio_activo'

/**
 * Resuelve, del lado servidor, en qué consultorio opera el usuario. NUNCA confía en el
 * cliente para el `medicoActivoId`: lo deriva del perfil + los vínculos `mis_consultorios()`,
 * y la cookie de selección solo elige ENTRE los permitidos (no puede apuntar a otro médico).
 */
export async function resolverConsultorio(): Promise<{
  supabase: SupabaseClient
  ctx: ConsultorioContexto
} | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('nombre, apellido, rol')
    .eq('id', user.id)
    .maybeSingle()

  const rol: RolConsultorio = perfil?.rol === 'secretaria' ? 'secretaria' : 'medico'
  const nombre = [perfil?.nombre, perfil?.apellido].filter(Boolean).join(' ') || null

  const { data: rows } = await supabase.rpc('mis_consultorios')
  const medicos: MedicoOpcion[] = (
    (rows as { medico_id: string; nombre: string | null; apellido: string | null }[] | null) ?? []
  ).map((r) => ({ id: r.medico_id, nombre: [r.nombre, r.apellido].filter(Boolean).join(' ') || null }))

  const permitidos = new Set(medicos.map((m) => m.id))
  const cookieVal = (await cookies()).get(COOKIE_CONSULTORIO)?.value
  let medicoActivoId: string | null = null
  if (cookieVal && permitidos.has(cookieVal)) medicoActivoId = cookieVal
  else if (rol === 'medico' && permitidos.has(user.id)) medicoActivoId = user.id
  else medicoActivoId = medicos[0]?.id ?? null

  // Plan del consultorio activo (candado §3). RLS delegada deja leerlo también a
  // la secretaria del médico. Sin fila = básico.
  let plan: Plan = 'basico'
  if (medicoActivoId) {
    const { data: sub } = await supabase
      .from('suscripciones')
      .select('plan')
      .eq('medico_id', medicoActivoId)
      .maybeSingle()
    plan = normalizarPlan(sub?.plan as string | null)
  }

  return { supabase, ctx: { userId: user.id, rol, nombre, medicoActivoId, medicos, plan } }
}

/** Solo el dueño del consultorio (ni la secretaria ni un médico operando otro consultorio).
 *  La vara para todo lo que es config médico-only (spec §8). */
export function esDueño(ctx: ConsultorioContexto): boolean {
  return ctx.rol === 'medico' && ctx.medicoActivoId === ctx.userId
}

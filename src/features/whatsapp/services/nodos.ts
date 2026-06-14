import type { SupabaseClient } from '@supabase/supabase-js'
import { descifrar } from '@/lib/crypto/encryption'
import type { CanalResuelto } from './canales'

// Servicios de lectura de la arquitectura de nodos (PRP-006, Fase 1).
// El cliente llega sin tipar (igual que canales.ts): se castea cada fila a mano.
// Estas tablas son infraestructura: se acceden por service-role (bypassa RLS).

/** Nodo activo resuelto por el slug público de un médico (para el redirect GET /c/[slug]). */
export interface NodoPublico {
  medicoId: string
  slug: string
  numeroWhatsapp: string // E.164, para wa.me/<este>
}

/** Asignación resuelta por slug: médico + phone_number_id de su nodo (para validar el ingreso). */
export interface AsignacionResuelta {
  medicoId: string
  numeroPersonal: string
  nodoPhoneNumberId: string
}

/** Credenciales del nodo para responder/enviar (access token ya descifrado). */
export interface NodoCreds {
  phoneNumberId: string
  accessToken: string
  numeroWhatsapp: string
}

/** Resuelve el slug público → nodo ACTIVO. Para GET /c/[slug] (Fase 2). null si no hay nodo activo. */
export async function getNodoActivoBySlug(db: SupabaseClient, slug: string): Promise<NodoPublico | null> {
  const { data: asig } = await db
    .from('wa_asignaciones')
    .select('medico_id, slug_publico, nodo_id')
    .eq('slug_publico', slug)
    .eq('activo', true)
    .maybeSingle()
  if (!asig) return null
  const a = asig as { medico_id: string; slug_publico: string; nodo_id: string }
  const { data: nodo } = await db
    .from('wa_nodos')
    .select('numero_whatsapp, estado')
    .eq('id', a.nodo_id)
    .eq('estado', 'activo')
    .maybeSingle()
  if (!nodo) return null
  const n = nodo as { numero_whatsapp: string; estado: string }
  return { medicoId: a.medico_id, slug: a.slug_publico, numeroWhatsapp: n.numero_whatsapp }
}

/** Resuelve un slug → médico + phone_number_id del nodo asignado (valida el [ID:slug] del 1.er mensaje, Fase 3). */
export async function getAsignacionBySlug(db: SupabaseClient, slug: string): Promise<AsignacionResuelta | null> {
  const { data: asig } = await db
    .from('wa_asignaciones')
    .select('medico_id, numero_personal, nodo_id')
    .eq('slug_publico', slug)
    .eq('activo', true)
    .maybeSingle()
  if (!asig) return null
  const a = asig as { medico_id: string; numero_personal: string; nodo_id: string }
  const { data: nodo } = await db
    .from('wa_nodos')
    .select('phone_number_id')
    .eq('id', a.nodo_id)
    .maybeSingle()
  if (!nodo) return null
  const n = nodo as { phone_number_id: string }
  return { medicoId: a.medico_id, numeroPersonal: a.numero_personal, nodoPhoneNumberId: n.phone_number_id }
}

/** Credenciales del nodo por el phone_number_id que recibió el webhook (para el fallback sin médico, Fase 3). */
export async function getNodoByPhoneNumberId(db: SupabaseClient, phoneNumberId: string): Promise<NodoCreds | null> {
  const { data } = await db
    .from('wa_nodos')
    .select('phone_number_id, access_token_cifrado, numero_whatsapp')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle()
  if (!data) return null
  const n = data as { phone_number_id: string; access_token_cifrado: string; numero_whatsapp: string }
  return {
    phoneNumberId: n.phone_number_id,
    accessToken: descifrar(n.access_token_cifrado),
    numeroWhatsapp: n.numero_whatsapp,
  }
}

/** Nodo del médico para salientes (entrega receta, webhook MP, toma humana). Drop-in de getCanalByMedicoId (Fase 4). */
export async function getNodoByMedicoId(db: SupabaseClient, medicoId: string): Promise<CanalResuelto | null> {
  const { data: asig } = await db
    .from('wa_asignaciones')
    .select('nodo_id, numero_personal')
    .eq('medico_id', medicoId)
    .eq('activo', true)
    .maybeSingle()
  if (!asig) return null
  const a = asig as { nodo_id: string; numero_personal: string }
  const { data: nodo } = await db
    .from('wa_nodos')
    .select('phone_number_id, access_token_cifrado')
    .eq('id', a.nodo_id)
    .maybeSingle()
  if (!nodo) return null
  const n = nodo as { phone_number_id: string; access_token_cifrado: string }
  return {
    medicoId,
    phoneNumberId: n.phone_number_id,
    accessToken: descifrar(n.access_token_cifrado),
    numeroPersonal: a.numero_personal,
  }
}

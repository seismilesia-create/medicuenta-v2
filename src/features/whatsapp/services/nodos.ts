import type { SupabaseClient } from '@supabase/supabase-js'
import { descifrar } from '@/lib/crypto/encryption'
import { getCanalByPhoneNumberId, getCanalByMedicoId, type CanalResuelto } from './canales'
import { getRuteoMedico, upsertRuteoMedico } from './ruteoConversacion'
import { extraerIdSlug, limpiarMarcadorId } from '@/lib/whatsapp/linkNodo'
import { normalizeRecipient } from '@/lib/whatsapp/client'

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

/**
 * Reverse-lookup del médico por su número: medico_id si `telefonoNorm` es el numero_personal
 * de un médico ACTIVO de ESE nodo, o null. Normaliza ambos lados (el "9" argentino) para no
 * fallar por formato. Es lo que reconoce al médico cuando le escribe al bot sin marcador.
 */
export async function getMedicoIdPorNumeroEnNodo(
  db: SupabaseClient,
  phoneNumberId: string,
  telefonoNorm: string,
): Promise<string | null> {
  const { data: nodo } = await db
    .from('wa_nodos')
    .select('id')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle()
  if (!nodo) return null
  const { data: asigs } = await db
    .from('wa_asignaciones')
    .select('medico_id, numero_personal')
    .eq('nodo_id', (nodo as { id: string }).id)
    .eq('activo', true)
  for (const a of (asigs as { medico_id: string; numero_personal: string | null }[] | null) ?? []) {
    if (a.numero_personal && normalizeRecipient(a.numero_personal) === telefonoNorm) return a.medico_id
  }
  return null
}

/** ¿El teléfono entrante es el de un médico de ese nodo? (guard para no mandarle msje de paciente). */
export async function esMedicoDelNodo(
  db: SupabaseClient,
  phoneNumberId: string,
  telefono: string,
): Promise<boolean> {
  return (await getMedicoIdPorNumeroEnNodo(db, phoneNumberId, telefono)) !== null
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

/** Resultado de resolver el médico de un mensaje entrante: el canal (contrato existente) + el texto sin marcador. */
export interface IngresoResuelto {
  canal: CanalResuelto
  /** Texto del mensaje con el marcador [ID:...] removido (solo si venía). undefined si no había marcador. */
  textoLimpio?: string
}

/**
 * Resuelve el médico de un mensaje entrante en el modelo de nodos, con fallback al canal legacy.
 * Orden: (a) [ID:slug] del 1.er mensaje → re-ancla ruteo · (a.5) el número entrante = numero_personal
 * de un médico del nodo → es el médico escribiéndole al bot · (b) ruteo persistido (paciente
 * recurrente) · (c) fallback legacy (wa_canales 1:1; en el piloto el nodo reusa el canal) ·
 * (d) null (no romper). Mantiene el contrato CanalResuelto → el pipeline aguas abajo (runner) no cambia.
 */
export async function resolverIngreso(
  db: SupabaseClient,
  incoming: { phoneNumberId: string; from: string; text?: string },
): Promise<IngresoResuelto | null> {
  const phoneNumberId = incoming.phoneNumberId
  const text = incoming.text ?? ''
  const telefono = normalizeRecipient(incoming.from)

  // ¿El número que recibió es un nodo? Si no, es flujo legacy puro (wa_canales 1:1).
  const nodo = await getNodoByPhoneNumberId(db, phoneNumberId)
  if (!nodo) {
    const legacy = await getCanalByPhoneNumberId(db, phoneNumberId)
    return legacy ? { canal: legacy } : null
  }

  // (a) Marcador [ID:slug] del 1.er mensaje (paciente que entró por el link).
  const slug = extraerIdSlug(text)
  if (slug) {
    const asig = await getAsignacionBySlug(db, slug)
    if (asig && asig.nodoPhoneNumberId === phoneNumberId) {
      await upsertRuteoMedico(db, phoneNumberId, telefono, asig.medicoId)
      const canal = await getNodoByMedicoId(db, asig.medicoId)
      if (canal) return { canal, textoLimpio: limpiarMarcadorId(text) }
    }
    // slug inválido o de otro nodo → seguir resolviendo por otros medios
  }

  // (a.5) El número entrante es el numero_personal de un médico de este nodo (el médico
  // escribiéndole al bot, sin marcador). Lo resolvemos a SU canal → el runner lo reconoce
  // como médico (esRemitenteMedico) y le da los comandos de médico (recetas, precio, turnos).
  const medicoPropio = await getMedicoIdPorNumeroEnNodo(db, phoneNumberId, telefono)
  if (medicoPropio) {
    const canal = await getNodoByMedicoId(db, medicoPropio)
    if (canal) return { canal }
  }

  // (b) Ruteo persistido (paciente recurrente, ya sin marcador).
  const ruteadoId = await getRuteoMedico(db, phoneNumberId, telefono)
  if (ruteadoId) {
    const canal = await getNodoByMedicoId(db, ruteadoId)
    if (canal) return { canal }
  }

  // (c) Fallback legacy (wa_canales 1:1; en el piloto el nodo reusa el canal). El médico original
  // del bot (sin fila en wa_asignaciones) se resuelve acá; los onboardeados, en (a.5).
  const legacy = await getCanalByPhoneNumberId(db, phoneNumberId)
  if (legacy) return { canal: legacy }

  // (d) Nada resolvió (paciente nuevo sin marcador en un nodo multi-médico): no rompemos.
  return null
}

/** Canal de SALIDA del médico: nodo asignado (modelo nuevo) con fallback al canal legacy (wa_canales). */
export async function resolverSaliente(db: SupabaseClient, medicoId: string): Promise<CanalResuelto | null> {
  return (await getNodoByMedicoId(db, medicoId)) ?? (await getCanalByMedicoId(db, medicoId))
}

import type { SupabaseClient } from '@supabase/supabase-js'
import { descifrar } from '@/lib/crypto/encryption'
import { getCanalByPhoneNumberId, getCanalByMedicoId, type CanalResuelto } from './canales'
import { getSesionRuteo, setSesionActiva, setSesionEsperando, bumpActividad, type SesionRuteo } from './ruteoConversacion'
import {
  matchApellido, etiquetaMedico, interpretarConfirmacion, interpretarSeleccion,
  sesionVencida, RUTEO_TTL_MS, type MedicoNodo,
} from '@/lib/whatsapp/desambiguacionRuteo'
import { esRemitenteMedico } from '@/lib/whatsapp/clasificar'
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

/** Médicos ACTIVOS del nodo (para desambiguar por nombre): id + datos de identidad de `perfiles`. */
export async function getMedicosDelNodo(db: SupabaseClient, phoneNumberId: string): Promise<MedicoNodo[]> {
  const { data: nodo } = await db
    .from('wa_nodos')
    .select('id')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle()
  if (!nodo) return []
  const { data: asigs } = await db
    .from('wa_asignaciones')
    .select('medico_id')
    .eq('nodo_id', (nodo as { id: string }).id)
    .eq('activo', true)
  const ids = ((asigs as { medico_id: string }[] | null) ?? []).map((a) => a.medico_id)
  if (ids.length === 0) return []
  const { data: perfiles } = await db
    .from('perfiles')
    .select('id, nombre, apellido, especialidad, matricula')
    .in('id', ids)
  return ((perfiles as {
    id: string
    nombre: string | null
    apellido: string | null
    especialidad: string | null
    matricula: string | null
  }[] | null) ?? []).map((p) => ({
    medicoId: p.id,
    nombre: p.nombre ?? '',
    apellido: p.apellido ?? '',
    especialidad: p.especialidad,
    matricula: p.matricula,
  }))
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

/** Resultado de resolver un mensaje entrante en el modelo de nodos. */
export type ResultadoIngreso =
  | { tipo: 'medico'; canal: CanalResuelto }
  | { tipo: 'paciente'; canal: CanalResuelto; textoLimpio?: string }
  | { tipo: 'mensaje'; nodo: NodoCreds; texto: string }
  | null

/** Interpreta la respuesta del paciente a una pregunta de desambiguación pendiente. */
async function manejarRespuestaDesambiguacion(
  db: SupabaseClient,
  nodo: NodoCreds,
  telefono: string,
  sesion: SesionRuteo,
  texto: string,
  medicos: MedicoNodo[],
): Promise<ResultadoIngreso> {
  const phoneNumberId = nodo.phoneNumberId

  if (sesion.estado === 'esperando_confirmacion') {
    const r = interpretarConfirmacion(texto)
    const cand = sesion.candidatos?.[0]
    if (r === 'si' && cand) {
      await setSesionActiva(db, phoneNumberId, telefono, cand.medicoId)
      return { tipo: 'mensaje', nodo, texto: `Listo, estás con ${etiquetaMedico(cand)} 🙌 Contame en qué te puedo ayudar.` }
    }
    if (r === 'no') {
      await setSesionEsperando(db, phoneNumberId, telefono, 'esperando_nombre', { medicoId: null })
      return { tipo: 'mensaje', nodo, texto: 'Dale. Escribí el *apellido* del médico al que le querés escribir.' }
    }
    return { tipo: 'mensaje', nodo, texto: 'Respondé *sí* o *no*, por favor 🙏' }
  }

  if (sesion.estado === 'esperando_nombre') {
    const cands = matchApellido(texto, medicos)
    if (cands.length === 0) {
      return { tipo: 'mensaje', nodo, texto: 'No encontré un médico con ese apellido en este número. Revisá el apellido o escaneá el *QR* del consultorio.' }
    }
    if (cands.length === 1) {
      await setSesionEsperando(db, phoneNumberId, telefono, 'esperando_confirmacion', { medicoId: null, candidatos: cands })
      return { tipo: 'mensaje', nodo, texto: `¿Es ${etiquetaMedico(cands[0])}? Respondé *sí* o *no*.` }
    }
    await setSesionEsperando(db, phoneNumberId, telefono, 'esperando_seleccion', { medicoId: null, candidatos: cands })
    const lista = cands.map((c, i) => `${i + 1}) ${etiquetaMedico(c)}`).join('\n')
    return { tipo: 'mensaje', nodo, texto: `Encontré varios médicos con ese apellido. ¿A cuál le escribís?\n${lista}\n\nRespondé con el *número*.` }
  }

  // esperando_seleccion
  const sel = interpretarSeleccion(texto, sesion.candidatos ?? [])
  if (!sel) {
    return { tipo: 'mensaje', nodo, texto: 'No entendí. Respondé con el *número* de la lista.' }
  }
  await setSesionActiva(db, phoneNumberId, telefono, sel.medicoId)
  return { tipo: 'mensaje', nodo, texto: `Listo, estás con ${etiquetaMedico(sel)} 🙌 Contame en qué te puedo ayudar.` }
}

export async function resolverIngreso(
  db: SupabaseClient,
  incoming: { phoneNumberId: string; from: string; text?: string },
): Promise<ResultadoIngreso> {
  const phoneNumberId = incoming.phoneNumberId
  const text = incoming.text ?? ''
  const telefono = normalizeRecipient(incoming.from)

  // ¿El número que recibió es un nodo? Si no, flujo legacy puro (wa_canales 1:1).
  const nodo = await getNodoByPhoneNumberId(db, phoneNumberId)
  if (!nodo) {
    const legacy = await getCanalByPhoneNumberId(db, phoneNumberId)
    if (!legacy) return null
    return esRemitenteMedico(incoming.from, legacy.numeroPersonal)
      ? { tipo: 'medico', canal: legacy }
      : { tipo: 'paciente', canal: legacy }
  }

  // (a) Marcador [ID:slug] del 1.er mensaje: gana siempre.
  const slug = extraerIdSlug(text)
  if (slug) {
    const asig = await getAsignacionBySlug(db, slug)
    if (asig && asig.nodoPhoneNumberId === phoneNumberId) {
      await setSesionActiva(db, phoneNumberId, telefono, asig.medicoId)
      const canal = await getNodoByMedicoId(db, asig.medicoId)
      if (canal) return { tipo: 'paciente', canal, textoLimpio: limpiarMarcadorId(text) }
    }
  }

  // (a.5) El número entrante es un médico del nodo (le escribe al bot).
  const medicoPropio = await getMedicoIdPorNumeroEnNodo(db, phoneNumberId, telefono)
  if (medicoPropio) {
    const canal = await getNodoByMedicoId(db, medicoPropio)
    if (canal) return { tipo: 'medico', canal }
  }

  const medicos = await getMedicosDelNodo(db, phoneNumberId)

  // Guarda defensiva: nodo con 1 solo médico → directo, sin preguntar.
  if (medicos.length === 1) {
    await setSesionActiva(db, phoneNumberId, telefono, medicos[0].medicoId)
    const canal = await getNodoByMedicoId(db, medicos[0].medicoId)
    if (canal) return { tipo: 'paciente', canal }
  }

  const sesion = await getSesionRuteo(db, phoneNumberId, telefono)

  // (3) Hay una pregunta de desambiguación pendiente → el mensaje es la respuesta.
  if (sesion && sesion.estado !== 'activa') {
    return manejarRespuestaDesambiguacion(db, nodo, telefono, sesion, text, medicos)
  }

  // (4) Sesión activa y reciente → continuar con el médico.
  if (sesion && sesion.estado === 'activa' && sesion.medicoId && !sesionVencida(sesion.lastActivityAt, Date.now(), RUTEO_TTL_MS)) {
    const canal = await getNodoByMedicoId(db, sesion.medicoId)
    if (canal) {
      await bumpActividad(db, phoneNumberId, telefono)
      return { tipo: 'paciente', canal }
    }
  }

  // (5) Sesión activa pero vieja → preguntar "¿mismo o otro?".
  if (sesion && sesion.medicoId && sesionVencida(sesion.lastActivityAt, Date.now(), RUTEO_TTL_MS)) {
    const actual = medicos.find((m) => m.medicoId === sesion.medicoId) ?? null
    await setSesionEsperando(db, phoneNumberId, telefono, 'esperando_confirmacion', {
      medicoId: sesion.medicoId,
      candidatos: actual ? [actual] : null,
    })
    const nombre = actual ? etiquetaMedico(actual) : 'el mismo médico de antes'
    return { tipo: 'mensaje', nodo, texto: `¿Seguís con ${nombre} o es con *otro* médico? Respondé *mismo* u *otro*.` }
  }

  // (6) Sin sesión (paciente nuevo) y sin marcador → preguntar el nombre.
  await setSesionEsperando(db, phoneNumberId, telefono, 'esperando_nombre', { medicoId: null })
  return { tipo: 'mensaje', nodo, texto: '¡Hola! 👋 ¿A qué médico le escribís? Escribí su *apellido* y te conecto.' }
}

/** Canal de SALIDA del médico: nodo asignado (modelo nuevo) con fallback al canal legacy (wa_canales). */
export async function resolverSaliente(db: SupabaseClient, medicoId: string): Promise<CanalResuelto | null> {
  return (await getNodoByMedicoId(db, medicoId)) ?? (await getCanalByMedicoId(db, medicoId))
}

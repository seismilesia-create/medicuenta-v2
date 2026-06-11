import type { SupabaseClient } from '@supabase/supabase-js'

export interface HistorialMsg {
  role: 'user' | 'assistant'
  content: string
}

export async function ensureContacto(
  db: SupabaseClient,
  medicoId: string,
  telefono: string,
  nombre?: string,
): Promise<string> {
  const { data: existing } = await db
    .from('wa_contactos')
    .select('id')
    .eq('medico_id', medicoId)
    .eq('telefono', telefono)
    .maybeSingle()
  if (existing) return (existing as { id: string }).id
  const { data, error } = await db
    .from('wa_contactos')
    .insert({ medico_id: medicoId, telefono, nombre: nombre ?? null })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function ensureConversacion(
  db: SupabaseClient,
  medicoId: string,
  contactoId: string,
): Promise<string> {
  const { data: abierta } = await db
    .from('wa_conversaciones')
    .select('id')
    .eq('medico_id', medicoId)
    .eq('contacto_id', contactoId)
    .eq('estado', 'abierta')
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (abierta) return (abierta as { id: string }).id
  const { data, error } = await db
    .from('wa_conversaciones')
    .insert({ medico_id: medicoId, contacto_id: contactoId, estado: 'abierta' })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function isBotPausado(
  db: SupabaseClient,
  medicoId: string,
  conversacionId: string,
): Promise<boolean> {
  const { data } = await db
    .from('wa_conversaciones')
    .select('bot_pausado')
    .eq('medico_id', medicoId)
    .eq('id', conversacionId)
    .single()
  return (data as { bot_pausado: boolean } | null)?.bot_pausado ?? false
}

export async function addMensaje(
  db: SupabaseClient,
  args: {
    medicoId: string
    conversacionId: string
    direccion: 'entrante' | 'saliente'
    origen: 'ia' | 'humano' | 'paciente' | 'medico'
    contenido: string
    wamid?: string
  },
): Promise<void> {
  await db.from('wa_mensajes').insert({
    medico_id: args.medicoId,
    conversacion_id: args.conversacionId,
    direccion: args.direccion,
    origen: args.origen,
    contenido: args.contenido,
    wamid: args.wamid ?? null,
  })
  const ahora = new Date().toISOString()
  const update: Record<string, string> = { last_message_at: ahora }
  if (args.direccion === 'entrante') update.last_paciente_at = ahora // ventana 24h (semáforo)
  await db
    .from('wa_conversaciones')
    .update(update)
    .eq('medico_id', args.medicoId)
    .eq('id', args.conversacionId)
}

export async function contarNecesitanAtencion(db: SupabaseClient, medicoId: string): Promise<number> {
  const { count } = await db
    .from('wa_conversaciones')
    .select('id', { count: 'exact', head: true })
    .eq('medico_id', medicoId)
    .eq('necesita_humano', true)
  return count ?? 0
}

/** Suma al texto de un comando del médico el aviso de conversaciones esperando humano (spec §6). */
export async function conAvisoAtencion(db: SupabaseClient, medicoId: string, texto: string): Promise<string> {
  const n = await contarNecesitanAtencion(db, medicoId)
  if (n === 0) return texto
  return `${texto}\n\n⚠️ Además: ${n === 1 ? '1 conversación necesita' : `${n} conversaciones necesitan`} atención humana.`
}

export async function loadHistorial(
  db: SupabaseClient,
  medicoId: string,
  conversacionId: string,
  limite = 12,
): Promise<HistorialMsg[]> {
  const { data } = await db
    .from('wa_mensajes')
    .select('origen, contenido')
    .eq('medico_id', medicoId)
    .eq('conversacion_id', conversacionId)
    .order('created_at', { ascending: false })
    .limit(limite)
  const rows = ((data as { origen: string; contenido: string }[]) ?? []).reverse()
  return rows.map((m) => ({
    role: m.origen === 'paciente' ? 'user' : 'assistant',
    content: m.contenido,
  }))
}

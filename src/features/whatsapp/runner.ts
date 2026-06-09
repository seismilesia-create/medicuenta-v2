import { createServiceClient } from '@/lib/supabase/server'
import { parseIncomingMessage } from '@/lib/whatsapp/parse'
import { sendWhatsAppText, markAsRead } from '@/lib/whatsapp/client'
import { esRemitenteMedico } from '@/lib/whatsapp/clasificar'
import { getCanalByPhoneNumberId } from '@/features/whatsapp/services/canales'
import {
  ensureContacto,
  ensureConversacion,
  isBotPausado,
  addMensaje,
  loadHistorial,
} from '@/features/whatsapp/services/conversaciones'
import { buildSystemPromptPaciente, type ConfigAgente } from '@/features/whatsapp/agent/systemPrompt'
import { runAgentTurn } from '@/features/whatsapp/agent/runAgentTurn'

const MSG_MEDICO_FASE0 =
  'Hola Doctor 👋 Soy su asistente de WhatsApp. La carga de recetas para cobro estará disponible muy pronto. Por ahora ya estoy conectado y atendiendo a los pacientes.'

/**
 * Procesa un webhook entrante de WhatsApp re-keyeado a medico_id.
 * Best-effort: no lanza (el webhook siempre responde 200).
 */
export async function handleIncomingWhatsApp(payload: unknown): Promise<void> {
  const incoming = parseIncomingMessage(payload)
  if (!incoming) return
  // Fase 0: solo texto (image/document/audio se ignoran; llegan en Fase 1+).
  if (incoming.type !== 'text') return

  const db = createServiceClient()

  // Resolver el médico dueño del número que recibió el mensaje.
  const canal = await getCanalByPhoneNumberId(db, incoming.phoneNumberId)
  if (!canal) {
    console.warn('[wa] sin canal para phone_number_id', incoming.phoneNumberId)
    return
  }

  markAsRead({
    phoneNumberId: canal.phoneNumberId,
    accessToken: canal.accessToken,
    to: incoming.from,
    messageId: incoming.messageId,
  })

  // ── Bifurcación médico vs paciente ──
  if (esRemitenteMedico(incoming.from, canal.numeroPersonal)) {
    // Fase 0: el intake del médico (cargar recetas) llega en Fase 1.
    await sendWhatsAppText({
      phoneNumberId: canal.phoneNumberId,
      accessToken: canal.accessToken,
      to: incoming.from,
      text: MSG_MEDICO_FASE0,
    })
    return
  }

  // ── Rama paciente ──
  const contactoId = await ensureContacto(db, canal.medicoId, incoming.from, incoming.contactName)
  const conversacionId = await ensureConversacion(db, canal.medicoId, contactoId)

  await addMensaje(db, {
    medicoId: canal.medicoId,
    conversacionId,
    direccion: 'entrante',
    origen: 'paciente',
    contenido: incoming.text ?? '',
    wamid: incoming.messageId,
  })

  // Si un humano tomó el control, la IA no responde.
  if (await isBotPausado(db, canal.medicoId, conversacionId)) return

  // Config del agente del médico (puede no existir aún → defaults).
  const { data: cfgRow } = await db
    .from('wa_config_agente')
    .select('saludo, tono, faqs')
    .eq('medico_id', canal.medicoId)
    .maybeSingle()

  const systemPrompt = buildSystemPromptPaciente({
    config: cfgRow as ConfigAgente | null,
    contactName: incoming.contactName,
  })
  const historial = await loadHistorial(db, canal.medicoId, conversacionId, 12)

  let reply: string
  try {
    reply = await runAgentTurn({ systemPrompt, historial, deps: { medicoId: canal.medicoId } })
  } catch (e) {
    console.error('[wa] agent error:', e)
    return
  }
  if (!reply) return

  await sendWhatsAppText({
    phoneNumberId: canal.phoneNumberId,
    accessToken: canal.accessToken,
    to: incoming.from,
    text: reply,
  })
  await addMensaje(db, {
    medicoId: canal.medicoId,
    conversacionId,
    direccion: 'saliente',
    origen: 'ia',
    contenido: reply,
  })
}

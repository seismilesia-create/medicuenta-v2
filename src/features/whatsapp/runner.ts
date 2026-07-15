import { createServiceClient } from '@/lib/supabase/server'
import { parseIncomingMessage, type IncomingMessage } from '@/lib/whatsapp/parse'
import { sendWhatsAppText, markAsRead, fetchWhatsAppMedia, normalizeRecipient } from '@/lib/whatsapp/client'
import { type CanalResuelto } from '@/features/whatsapp/services/canales'
import { resolverIngreso } from '@/features/whatsapp/services/nodos'
import {
  ensureContacto,
  ensureConversacion,
  isBotPausado,
  addMensaje,
  loadHistorial,
} from '@/features/whatsapp/services/conversaciones'
import { getPrecioReceta } from '@/features/whatsapp/services/configAgente'
import { crearRecetaDesdeOcr } from '@/features/whatsapp/services/recetasService'
import { buildTurnosTools } from '@/features/whatsapp/agent/toolsTurnos'
import { entregarPendientes } from '@/features/whatsapp/services/entrega'
import { subirPdfReceta } from '@/features/whatsapp/services/storageRecetas'
import { extraerRecetaDePdf, validarIdentidadExtraida } from '@/lib/ai/ocr-receta'
import { normalizarDni } from '@/lib/recetas/normalizar'
import { buildSystemPromptPaciente, type ConfigAgente } from '@/features/whatsapp/agent/systemPrompt'
import { runAgentTurn } from '@/features/whatsapp/agent/runAgentTurn'
import { sanitizarReplyCobro, scrubLinksMP } from '@/features/whatsapp/agent/sanitizarReply'
import { buildPacienteTools } from '@/features/whatsapp/agent/tools'
import { buildConsultorioTools } from '@/features/whatsapp/agent/toolsConsultorio'
import { buildMedicoTools } from '@/features/whatsapp/agent/toolsMedico'
import { buildSystemPromptMedico } from '@/features/whatsapp/agent/systemPromptMedico'
import { registrarEvento } from '@/features/whatsapp/services/bitacora'
import { registrarUsoIa } from '@/lib/ai/usoIa'
import { secretariaDisponibleAhora } from '@/features/whatsapp/services/horarioSecretaria'

type Db = ReturnType<typeof createServiceClient>

/**
 * Procesa un webhook entrante de WhatsApp re-keyeado a medico_id.
 * Best-effort: no lanza (el webhook siempre responde 200).
 */
export async function handleIncomingWhatsApp(payload: unknown): Promise<void> {
  const incoming = parseIncomingMessage(payload)
  if (!incoming) return
  if (incoming.type !== 'text' && incoming.type !== 'document') return

  const db = createServiceClient()
  const r = await resolverIngreso(db, incoming)
  if (!r) {
    console.warn('[wa] sin nodo/canal para phone_number_id', incoming.phoneNumberId)
    return
  }

  // Pregunta de desambiguación: respondemos por el nodo y NO ruteamos contenido.
  if (r.tipo === 'mensaje') {
    markAsRead({ phoneNumberId: r.nodo.phoneNumberId, accessToken: r.nodo.accessToken, to: incoming.from, messageId: incoming.messageId })
    await sendWhatsAppText({ phoneNumberId: r.nodo.phoneNumberId, accessToken: r.nodo.accessToken, to: incoming.from, text: r.texto })
    return
  }

  const canal = r.canal
  // El marcador [ID:slug] ya cumplió su función: lo quitamos del texto.
  if (r.tipo === 'paciente' && r.textoLimpio !== undefined) incoming.text = r.textoLimpio

  markAsRead({ phoneNumberId: canal.phoneNumberId, accessToken: canal.accessToken, to: incoming.from, messageId: incoming.messageId })

  if (r.tipo === 'medico') {
    await handleMedico(db, canal, incoming)
    return
  }
  await handlePaciente(db, canal, incoming)
}

async function responder(canal: CanalResuelto, to: string, text: string): Promise<void> {
  await sendWhatsAppText({ phoneNumberId: canal.phoneNumberId, accessToken: canal.accessToken, to, text })
}

// ── Rama MÉDICO: carga de recetas (PDF) + agente de IA administrativo ────────
async function handleMedico(db: Db, canal: CanalResuelto, incoming: IncomingMessage): Promise<void> {
  if (incoming.type === 'document') {
    await cargarRecetaDesdePdf(db, canal, incoming)
    return
  }

  // Rama texto = agente de IA administrativo (espejo del paciente, sin toma-humana ni entrega).
  const contactoId = await ensureContacto(db, canal.medicoId, incoming.from, incoming.contactName)
  const conversacionId = await ensureConversacion(db, canal.medicoId, contactoId)
  await addMensaje(db, {
    medicoId: canal.medicoId,
    conversacionId,
    direccion: 'entrante',
    origen: 'medico',
    contenido: incoming.text ?? '',
    wamid: incoming.messageId,
  })

  const { data: cfgRow } = await db
    .from('wa_config_agente')
    .select('nombre_medico')
    .eq('medico_id', canal.medicoId)
    .maybeSingle()
  const nombreMedico = (cfgRow as { nombre_medico: string | null } | null)?.nombre_medico ?? null

  const historial = await loadHistorial(db, canal.medicoId, conversacionId, 12, 'medico')
  const tools = buildMedicoTools({ db, medicoId: canal.medicoId })
  const systemPrompt = buildSystemPromptMedico({ nombreMedico })

  let reply: string
  try {
    const turno = await runAgentTurn({ systemPrompt, historial, tools })
    reply = turno.text
    // Telemetría best-effort: un fallo acá NO debe descartar la respuesta ya generada.
    try {
      await registrarUsoIa(db, {
        medicoId: canal.medicoId,
        origen: 'whatsapp',
        modelo: turno.modelo,
        usage: turno.usage,
        conversacionId,
      })
      if (turno.resumen.tools.length > 0) {
        await registrarEvento(db, {
          medicoId: canal.medicoId,
          origen: 'agente',
          nivel: 'info',
          evento: 'agente_medico_turno',
          detalle: { ...turno.resumen },
          conversacionId,
        })
      }
    } catch (telemetriaErr) {
      console.error('[wa] telemetría médico (best-effort):', telemetriaErr)
    }
  } catch (e) {
    console.error('[wa] agente médico error:', e)
    await registrarEvento(db, {
      medicoId: canal.medicoId,
      origen: 'agente',
      nivel: 'error',
      evento: 'agente_medico_error',
      detalle: { error: String(e) },
      conversacionId,
    })
    await responder(canal, incoming.from, 'Perdoná, tuve un problema para procesar tu mensaje 🙏 Probá de nuevo en un ratito.')
    return
  }

  if (!reply) return
  await responder(canal, incoming.from, reply)
  await addMensaje(db, {
    medicoId: canal.medicoId,
    conversacionId,
    direccion: 'saliente',
    origen: 'ia',
    contenido: reply,
  })
}

async function cargarRecetaDesdePdf(db: Db, canal: CanalResuelto, incoming: IncomingMessage): Promise<void> {
  const precio = await getPrecioReceta(db, canal.medicoId)
  if (!precio) {
    await responder(canal, incoming.from, "⚠️ Antes de cargar recetas configurá el precio. Mandá por ejemplo: precio 5000")
    return
  }
  if (!incoming.mediaId) return

  const media = await fetchWhatsAppMedia(incoming.mediaId, canal.accessToken)
  if (!media || !media.mimeType.includes('pdf')) {
    await responder(canal, incoming.from, '⚠️ Solo puedo leer recetas en PDF (el archivo que baja de la app de OSEP).')
    return
  }

  const pdfPath = await subirPdfReceta(db, canal.medicoId, media.buffer)
  if (!pdfPath) {
    await responder(canal, incoming.from, '✖ No pude guardar el PDF. Probá reenviarlo.')
    return
  }

  let ocr
  try {
    ocr = await extraerRecetaDePdf(media.buffer)
  } catch (e) {
    console.error('[wa] OCR receta error:', e)
    await registrarEvento(db, {
      medicoId: canal.medicoId,
      origen: 'agente',
      nivel: 'error',
      evento: 'ocr_receta_error',
      detalle: { error: String(e) },
    })
    await responder(canal, incoming.from, '✖ No pude leer ese PDF. Reenviá el original que baja de la app de OSEP.')
    return
  }

  const identidadOk = validarIdentidadExtraida(ocr)
  const resultado = await crearRecetaDesdeOcr(db, {
    medicoId: canal.medicoId,
    ocr,
    pdfPath,
    monto: precio,
    estado: identidadOk ? 'pendiente_pago' : 'pendiente_datos',
  })

  if (resultado === 'duplicada') {
    await responder(canal, incoming.from, `⚠️ Esa receta ya estaba cargada (N° ${ocr.nro_receta}).`)
    return
  }
  if (!resultado) {
    await responder(canal, incoming.from, '✖ No pude registrar la receta. Probá de nuevo.')
    return
  }

  const droga = ocr.medicamentos[0]?.droga
  if (identidadOk) {
    await responder(
      canal,
      incoming.from,
      `✅ Receta cargada: ${ocr.paciente_nombre} (DNI ${normalizarDni(ocr.paciente_dni)})${droga ? ` — ${droga}` : ''}. La cobro $${precio.toLocaleString('es-AR')} cuando el paciente me escriba.`,
    )
  } else {
    await responder(
      canal,
      incoming.from,
      '⚠️ Guardé el PDF pero no pude leer bien el nombre o el DNI del paciente, así que NO la voy a cobrar. Reenviá el PDF original (no captura de pantalla).',
    )
  }
}

// ── Rama PACIENTE: entrega pendiente + agente con tools de cobro ─────────────
async function handlePaciente(db: Db, canal: CanalResuelto, incoming: IncomingMessage): Promise<void> {
  if (incoming.type === 'document') {
    await responder(canal, incoming.from, 'Las recetas las carga tu médico 😊 Si ya pagaste la tuya, escribime "ya pagué".')
    return
  }

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

  // 1) Entregas pendientes (pagada sin entregar + reconciliación contra MP).
  const entregadas = await entregarPendientes(db, canal, canal.medicoId, normalizeRecipient(incoming.from))
  if (entregadas > 0) {
    const msg = '📄 ¡Listo! Te envié tu receta. ¡Que te mejores! 🙌'
    await responder(canal, incoming.from, msg)
    await addMensaje(db, {
      medicoId: canal.medicoId,
      conversacionId,
      direccion: 'saliente',
      origen: 'ia',
      contenido: `[Receta entregada] ${msg}`,
    })
    return
  }

  // 2) Toma humana.
  if (await isBotPausado(db, canal.medicoId, conversacionId)) return

  // 3) Agente con tools de cobro.
  const { data: cfgRow } = await db
    .from('wa_config_agente')
    .select('saludo, tono, faqs, nombre_medico, especialidad')
    .eq('medico_id', canal.medicoId)
    .maybeSingle()

  const secretariaDisponible = await secretariaDisponibleAhora(db, canal.medicoId)
  const systemPrompt = buildSystemPromptPaciente({
    config: cfgRow as ConfigAgente | null,
    contactName: incoming.contactName,
    secretariaDisponible,
  })
  // Links viejos fuera del contexto del modelo: vencidos, y son fuente de imitación.
  const historial = (await loadHistorial(db, canal.medicoId, conversacionId, 12)).map((m) => ({
    ...m,
    content: scrubLinksMP(m.content),
  }))
  const toolsCtx = {
    db,
    medicoId: canal.medicoId,
    telefonoPaciente: incoming.from,
    contactoId,
    conversacionId,
    secretariaDisponible,
  }
  const tools = {
    ...buildPacienteTools(toolsCtx),
    ...buildTurnosTools(toolsCtx),
    ...buildConsultorioTools(toolsCtx),
  }

  let reply: string
  try {
    const turno = await runAgentTurn({ systemPrompt, historial, tools })
    // Barrera de plata: solo pueden salir links que devolvió cobrar_receta.
    reply = sanitizarReplyCobro(turno.text, turno.cobros)
    // Telemetría best-effort: un fallo acá NO debe descartar la respuesta ya generada.
    try {
      // Costo de IA (spec §5.1): registramos los tokens del turno. Best-effort.
      await registrarUsoIa(db, {
        medicoId: canal.medicoId,
        origen: 'whatsapp',
        modelo: turno.modelo,
        usage: turno.usage,
        conversacionId,
      })
      // Bitácora (spec §10): registramos el turno cuando el agente HIZO algo
      // (usó tools). Los turnos de pura charla no ensucian la traza. Best-effort.
      if (turno.resumen.tools.length > 0) {
        await registrarEvento(db, {
          medicoId: canal.medicoId,
          origen: 'agente',
          nivel: 'info',
          evento: 'agente_turno',
          detalle: { ...turno.resumen },
          conversacionId,
        })
      }
    } catch (telemetriaErr) {
      console.error('[wa] telemetría paciente (best-effort):', telemetriaErr)
    }
  } catch (e) {
    console.error('[wa] agent error:', e)
    await registrarEvento(db, {
      medicoId: canal.medicoId,
      origen: 'agente',
      nivel: 'error',
      evento: 'agente_error',
      detalle: { error: String(e) },
      conversacionId,
    })
    // No dejar al paciente en silencio: un fallo del modelo/tool antes se tragaba sin respuesta.
    await responder(canal, incoming.from, 'Perdoná, tuve un problema para procesar tu mensaje 🙏 Probá de nuevo en un ratito.')
    return
  }
  if (!reply) return

  await responder(canal, incoming.from, reply)
  await addMensaje(db, {
    medicoId: canal.medicoId,
    conversacionId,
    direccion: 'saliente',
    origen: 'ia',
    contenido: reply,
  })
}

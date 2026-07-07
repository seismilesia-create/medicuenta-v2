import { createServiceClient } from '@/lib/supabase/server'
import { parseIncomingMessage, type IncomingMessage } from '@/lib/whatsapp/parse'
import { sendWhatsAppText, markAsRead, fetchWhatsAppMedia, normalizeRecipient } from '@/lib/whatsapp/client'
import { esRemitenteMedico } from '@/lib/whatsapp/clasificar'
import { type CanalResuelto } from '@/features/whatsapp/services/canales'
import { resolverIngreso, getNodoByPhoneNumberId, esMedicoDelNodo } from '@/features/whatsapp/services/nodos'
import {
  ensureContacto,
  ensureConversacion,
  isBotPausado,
  addMensaje,
  loadHistorial,
  conAvisoAtencion,
} from '@/features/whatsapp/services/conversaciones'
import { getPrecioReceta, setPrecioReceta } from '@/features/whatsapp/services/configAgente'
import { crearRecetaDesdeOcr, resumenRecetas } from '@/features/whatsapp/services/recetasService'
import { resumenTurnos } from '@/features/whatsapp/services/turnosService'
import { buildTurnosTools } from '@/features/whatsapp/agent/toolsTurnos'
import { entregarPendientes } from '@/features/whatsapp/services/entrega'
import { subirPdfReceta } from '@/features/whatsapp/services/storageRecetas'
import { extraerRecetaDePdf, validarIdentidadExtraida } from '@/lib/ai/ocr-receta'
import { normalizarDni, parseMontoArs } from '@/lib/recetas/normalizar'
import { buildSystemPromptPaciente, type ConfigAgente } from '@/features/whatsapp/agent/systemPrompt'
import { runAgentTurn } from '@/features/whatsapp/agent/runAgentTurn'
import { sanitizarReplyCobro, scrubLinksMP } from '@/features/whatsapp/agent/sanitizarReply'
import { buildPacienteTools } from '@/features/whatsapp/agent/tools'
import { buildConsultorioTools } from '@/features/whatsapp/agent/toolsConsultorio'
import { registrarEvento } from '@/features/whatsapp/services/bitacora'
import { registrarUsoIa } from '@/lib/ai/usoIa'
import { secretariaDisponibleAhora } from '@/features/whatsapp/services/horarioSecretaria'

type Db = ReturnType<typeof createServiceClient>

const AYUDA_MEDICO = [
  '🩺 Soy su asistente. Comandos:',
  '• Reenvíeme el PDF de una receta para cargarla al cobro',
  "• 'precio 5000' — fija cuánto cobra cada receta",
  "• 'recetas' — estado de sus recetas",
  "• 'turnos' (o 'agenda') — su agenda de los próximos 7 días",
].join('\n')

// Paciente que escribió sin que podamos saber a qué médico (borró el marcador [ID:slug]
// del 1.er mensaje). Le explicamos por qué importa ese mensaje y cómo recuperarlo.
const MSG_RUTEO_FALLIDO = [
  '¡Hola! 👋 Todavía no sé con qué profesional querés comunicarte.',
  '',
  'Cuando entrás por el *link* o el *QR* de tu médico se carga un mensaje ya escrito con un código. Ese código es el que me dice con quién comunicarte (para sacar un turno, hacer una consulta o consultar tu receta). Por eso, *no borres ese mensaje* antes de enviármelo 🙏',
  '',
  'Si ya lo borraste y no recordás qué decía, volvé a *escanear el QR* o a *tocar el link* que te pasaron: el mensaje con el código aparece de nuevo solo. Así te derivo con el profesional correcto, sin errores. 🙌',
].join('\n')

/**
 * Procesa un webhook entrante de WhatsApp re-keyeado a medico_id.
 * Best-effort: no lanza (el webhook siempre responde 200).
 */
export async function handleIncomingWhatsApp(payload: unknown): Promise<void> {
  const incoming = parseIncomingMessage(payload)
  if (!incoming) return
  if (incoming.type !== 'text' && incoming.type !== 'document') return

  const db = createServiceClient()
  const resuelto = await resolverIngreso(db, incoming)
  if (!resuelto) {
    // No pudimos resolver el médico (típico: el paciente borró el marcador [ID:slug] del
    // 1.er mensaje y es su primer contacto). En vez de quedarnos mudos, le explicamos cómo
    // volver a entrar por el link/QR. (avisarRuteoFallido no le escribe a un médico del nodo.)
    await avisarRuteoFallido(db, incoming)
    console.warn('[wa] sin médico para phone_number_id', incoming.phoneNumberId)
    return
  }
  const canal = resuelto.canal
  // El marcador [ID:slug] del 1.er mensaje ya cumplió su función: lo quitamos para que no
  // ensucie el historial ni se filtre en las respuestas del agente.
  if (resuelto.textoLimpio !== undefined) incoming.text = resuelto.textoLimpio

  markAsRead({
    phoneNumberId: canal.phoneNumberId,
    accessToken: canal.accessToken,
    to: incoming.from,
    messageId: incoming.messageId,
  })

  if (esRemitenteMedico(incoming.from, canal.numeroPersonal)) {
    await handleMedico(db, canal, incoming)
    return
  }
  await handlePaciente(db, canal, incoming)
}

async function responder(canal: CanalResuelto, to: string, text: string): Promise<void> {
  await sendWhatsAppText({ phoneNumberId: canal.phoneNumberId, accessToken: canal.accessToken, to, text })
}

/**
 * El mensaje entrante no se pudo rutear a ningún médico. Si llegó a un NODO y NO es un
 * médico del nodo (un paciente que borró el [ID:slug]), le explicamos cómo recuperar el
 * link/QR. Si el número no es un nodo, o es un médico, no respondemos (igual que antes).
 */
async function avisarRuteoFallido(db: Db, incoming: IncomingMessage): Promise<void> {
  const nodo = await getNodoByPhoneNumberId(db, incoming.phoneNumberId)
  if (!nodo) return // no es un nodo: número desconocido, no hay credenciales con qué responder
  if (await esMedicoDelNodo(db, incoming.phoneNumberId, normalizeRecipient(incoming.from))) return
  await sendWhatsAppText({
    phoneNumberId: nodo.phoneNumberId,
    accessToken: nodo.accessToken,
    to: incoming.from,
    text: MSG_RUTEO_FALLIDO,
  })
}

// ── Rama MÉDICO: carga de recetas (PDF) + comandos de texto ──────────────────
async function handleMedico(db: Db, canal: CanalResuelto, incoming: IncomingMessage): Promise<void> {
  if (incoming.type === 'document') {
    await cargarRecetaDesdePdf(db, canal, incoming)
    return
  }

  const texto = (incoming.text ?? '').trim()
  const matchPrecio = /^precio\s+\$?\s*([\d.,]+)\s*$/i.exec(texto)
  if (matchPrecio) {
    const monto = parseMontoArs(matchPrecio[1])
    if (!monto) {
      await responder(canal, incoming.from, "No entendí el monto. Probá: precio 5000")
      return
    }
    await setPrecioReceta(db, canal.medicoId, monto)
    await responder(
      canal,
      incoming.from,
      `✅ Listo: cada receta se cobra $${monto.toLocaleString('es-AR')}. Ya puede reenviarme los PDFs.`,
    )
    return
  }
  if (/^(recetas|estado)$/i.test(texto)) {
    await responder(canal, incoming.from, await conAvisoAtencion(db, canal.medicoId, await resumenRecetas(db, canal.medicoId)))
    return
  }
  if (/^(turnos|agenda)$/i.test(texto)) {
    await responder(canal, incoming.from, await conAvisoAtencion(db, canal.medicoId, await resumenTurnos(db, canal.medicoId)))
    return
  }
  await responder(canal, incoming.from, AYUDA_MEDICO)
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

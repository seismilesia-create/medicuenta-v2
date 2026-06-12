'use server'

import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { getCanalByMedicoId } from '@/features/whatsapp/services/canales'
import { sendWhatsAppText } from '@/lib/whatsapp/client'
import { addMensaje } from '@/features/whatsapp/services/conversaciones'
import { registrarEvento } from '@/features/whatsapp/services/bitacora'
import { ventanaAbierta } from '@/lib/consultorio/semaforo'
import { resolverConsultorio } from '@/features/consultorio/access/contexto'

/** Contexto para conversaciones: `medicoId` = consultorio operado; `userId` = quién responde
 *  (la secretaria firma con su id en la bitácora). */
async function ctxConversaciones() {
  const r = await resolverConsultorio()
  if (!r || !r.ctx.medicoActivoId) return null
  return { supabase: r.supabase, medicoId: r.ctx.medicoActivoId, userId: r.ctx.userId }
}

const responderSchema = z.object({
  conversacionId: z.string().uuid(),
  texto: z.string().min(1, 'Escribí el mensaje').max(3500),
})

/**
 * Respuesta humana desde el panel (spec §6): sale por el MISMO número del consultorio.
 * Server action porque descifra el token de Meta (ENCRYPTION_KEY). Responder = atender → apaga la alarma.
 * La secretaria puede responder: el canal (médico-only en RLS) se lee con service-client TRAS
 * autorizar con el resolver (medicoId es uno que el usuario puede operar); el resto va por el
 * cliente del usuario con RLS delegada.
 */
export async function responderComoHumano(input: z.infer<typeof responderSchema>) {
  const c = await ctxConversaciones()
  if (!c) return { error: 'No autenticado' }
  const { supabase, medicoId, userId } = c
  const parsed = responderSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { conversacionId, texto } = parsed.data

  // Ventana de 24 h (regla de Meta): si está cerrada, no hay envío posible.
  const { data: conv } = await supabase
    .from('wa_conversaciones')
    .select('id, last_paciente_at, contacto:wa_contactos(telefono)')
    .eq('medico_id', medicoId)
    .eq('id', conversacionId)
    .maybeSingle()
  if (!conv) return { error: 'Conversación no encontrada' }
  const cv = conv as unknown as {
    last_paciente_at: string | null
    contacto: { telefono: string } | { telefono: string }[] | null
  }
  if (!ventanaAbierta(cv.last_paciente_at, Date.now())) {
    return {
      error:
        'La ventana de 24 h está cerrada: vas a poder responderle cuando el paciente vuelva a escribir.',
    }
  }
  const contacto = Array.isArray(cv.contacto) ? cv.contacto[0] : cv.contacto
  if (!contacto?.telefono) return { error: 'La conversación no tiene teléfono asociado' }

  // wa_canales NO se delega (médico-only): leer con service-client; la autorización ya la dio
  // el resolver (medicoId ∈ consultorios que este usuario puede operar).
  const canal = await getCanalByMedicoId(createServiceClient(), medicoId)
  if (!canal) return { error: 'No hay canal de WhatsApp conectado' }

  // sendWhatsAppText devuelve boolean (no lanza): false = Meta rechazó.
  // Fallo → bitácora + { error }, sin persistir el mensaje (spec §10).
  const ok = await sendWhatsAppText({
    phoneNumberId: canal.phoneNumberId,
    accessToken: canal.accessToken,
    to: contacto.telefono,
    text: texto,
  })
  if (!ok) {
    await registrarEvento(supabase, {
      medicoId,
      origen: 'panel',
      nivel: 'error',
      evento: 'respuesta_humana_error',
      detalle: { error: 'sendWhatsAppText returned false', actor: userId },
      conversacionId,
    })
    return { error: 'WhatsApp rechazó el envío (¿token vencido?). El mensaje NO salió.' }
  }

  await addMensaje(supabase, {
    medicoId,
    conversacionId,
    direccion: 'saliente',
    origen: 'humano',
    contenido: texto,
  })
  // Responder ES atender el aviso.
  await supabase
    .from('wa_conversaciones')
    .update({ necesita_humano: false, updated_at: new Date().toISOString() })
    .eq('medico_id', medicoId)
    .eq('id', conversacionId)
  await registrarEvento(supabase, {
    medicoId,
    origen: 'panel',
    nivel: 'info',
    evento: 'respuesta_humana',
    detalle: { largo: texto.length, actor: userId },
    conversacionId,
  })
  return { ok: true as const }
}

export async function setBotPausado(conversacionId: string, pausado: boolean) {
  const c = await ctxConversaciones()
  if (!c) return { error: 'No autenticado' }
  const { supabase, medicoId, userId } = c
  const { error } = await supabase
    .from('wa_conversaciones')
    .update({ bot_pausado: pausado, updated_at: new Date().toISOString() })
    .eq('medico_id', medicoId)
    .eq('id', conversacionId)
  if (error) return { error: error.message }
  await registrarEvento(supabase, {
    medicoId,
    origen: 'panel',
    nivel: 'info',
    evento: pausado ? 'bot_pausado' : 'bot_reanudado',
    detalle: { actor: userId },
    conversacionId,
  })
  return { ok: true as const }
}

/** Apaga la alarma sin responder (la atendiste por otro canal). */
export async function resolverAlarma(conversacionId: string) {
  const c = await ctxConversaciones()
  if (!c) return { error: 'No autenticado' }
  const { supabase, medicoId } = c
  const { error } = await supabase
    .from('wa_conversaciones')
    .update({ necesita_humano: false, updated_at: new Date().toISOString() })
    .eq('medico_id', medicoId)
    .eq('id', conversacionId)
  if (error) return { error: error.message }
  return { ok: true as const }
}

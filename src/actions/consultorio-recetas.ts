'use server'

import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { resolverConsultorio } from '@/features/consultorio/access/contexto'
import { resolverSaliente } from '@/features/whatsapp/services/nodos'
import {
  estamparDestinoEntrega,
  getPendientesPorDni,
  liberarPorOrdenConsulta,
} from '@/features/whatsapp/services/recetasService'
import { entregarReceta } from '@/features/whatsapp/services/entrega'
import { registrarEvento } from '@/features/whatsapp/services/bitacora'
import { normalizarDni } from '@/lib/recetas/normalizar'
import { normalizeRecipient } from '@/lib/whatsapp/client'

/** Autoriza: médico operado (dueño o secretaria) + user que firma. null si no autorizado. */
async function ctxConsultorio() {
  const r = await resolverConsultorio()
  if (!r || !r.ctx.medicoActivoId) return null
  return { supabase: r.supabase, medicoId: r.ctx.medicoActivoId as string, userId: r.ctx.userId as string }
}

/**
 * Lista las recetas `pendiente_pago` de un DNI (el que la secretaria lee en el chat), para
 * liberarla por orden de consulta. Se busca por DNI y NO por el teléfono de la conversación:
 * en la vía de orden de consulta la receta no tiene pago, así que `paciente_telefono` es NULL
 * (solo se llena al generar el link de pago) — buscar por teléfono devolvía siempre 0.
 * Autorización: la conversación debe pertenecer al médico operado (RLS delegada del user
 * client) y `getPendientesPorDni` filtra por ese mismo medico_id → nunca cruza consultorios.
 * `recetas` está bloqueada para la secretaria por RLS: se toca con service-role RECIÉN
 * después de ese check.
 */
export async function getRecetasPendientesConversacion(conversacionId: string, dni: string) {
  const c = await ctxConsultorio()
  if (!c) return { error: 'No autenticado' }
  // Autorización: la conversación debe pertenecer al médico operado (RLS delegada del user client).
  const { data: conv } = await c.supabase
    .from('wa_conversaciones')
    .select('id')
    .eq('medico_id', c.medicoId)
    .eq('id', conversacionId)
    .maybeSingle()
  if (!conv) return { error: 'Conversación no encontrada' }

  if (normalizarDni(dni).length < 7) return { error: 'Ingresá el DNI del paciente (mínimo 7 dígitos).' }

  const db = createServiceClient()
  const recetas = await getPendientesPorDni(db, c.medicoId, dni)
  return {
    recetas: recetas.map((r) => ({
      id: r.id, paciente_nombre: r.paciente_nombre, nro_receta: r.nro_receta, monto: r.monto, created_at: r.created_at,
    })),
  }
}

const liberarSchema = z.object({
  conversacionId: z.string().uuid(),
  recetaId: z.string().uuid(),
  nroOrden: z.string().trim().min(1, 'Ingresá el número de orden de consulta'),
})

/**
 * Libera una receta por orden de consulta (la secretaria, desde el panel): ata la receta al
 * WhatsApp de la conversación, registra la constancia, transiciona pendiente_pago → pagada y
 * entrega el PDF.
 *
 * Doble refuerzo de autorización: (1) ctxConsultorio limitó medicoId al consultorio operado;
 * (2) liberarPorOrdenConsulta filtra por ese medico_id en el WHERE → una secretaria no puede
 * liberar la receta de otro médico (0 filas → null).
 *
 * El estampado va ANTES de liberar: si falla, la receta queda `pendiente_pago` y se reintenta,
 * en vez de quedar liberada y sin destino (inentregable). Devuelve `entregada` para que el
 * panel diga la verdad: con la ventana de 24 h cerrada el PDF no sale ahora, sale solo cuando
 * el paciente vuelva a escribir (`entregarPendientes` en el runner).
 */
export async function liberarReceta(input: { conversacionId: string; recetaId: string; nroOrden: string }) {
  const c = await ctxConsultorio()
  if (!c) return { error: 'No autenticado' }
  const parsed = liberarSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // Autorización + destino: la conversación debe pertenecer al médico operado (RLS delegada
  // del user client), y su contacto es el WhatsApp al que va a salir el PDF.
  const { data: conv } = await c.supabase
    .from('wa_conversaciones')
    .select('id, contacto_id, contacto:wa_contactos(telefono)')
    .eq('medico_id', c.medicoId)
    .eq('id', parsed.data.conversacionId)
    .maybeSingle<{ id: string; contacto_id: string | null; contacto: { telefono: string } | null }>()
  if (!conv) return { error: 'Conversación no encontrada' }
  // Canónico `54…`: el mismo formato con el que el runner busca las entregas pendientes.
  const telefonoDestino = conv.contacto?.telefono ? normalizeRecipient(conv.contacto.telefono) : null
  if (!telefonoDestino) return { error: 'Esta conversación no tiene un WhatsApp válido para enviar la receta' }

  const db = createServiceClient()
  const estampado = await estamparDestinoEntrega(db, c.medicoId, parsed.data.recetaId, {
    pacienteTelefono: telefonoDestino,
    contactoId: conv.contacto_id,
  })
  if (!estampado.ok) return { error: 'No pude preparar el envío. Probá de nuevo en un momento.' }

  const fila = await liberarPorOrdenConsulta(db, {
    medicoId: c.medicoId,
    recetaId: parsed.data.recetaId,
    nroOrden: parsed.data.nroOrden,
    liberadaPor: c.userId,
  })
  if (!fila) return { error: 'La receta ya no está pendiente o no corresponde a este consultorio' }

  const canal = await resolverSaliente(db, fila.medico_id)
  // Best-effort: si el envío falla (p. ej. ventana de 24 h cerrada), la compensación deja la
  // receta 'pagada' y el próximo mensaje del paciente dispara la entrega.
  const entregada = canal ? await entregarReceta(db, canal, fila) : false

  await registrarEvento(db, {
    medicoId: c.medicoId,
    origen: 'panel',
    nivel: 'info',
    evento: 'receta_liberada_orden_consulta',
    detalle: { recetaId: fila.id, entregada, telefonoDestino: fila.paciente_telefono },
    conversacionId: parsed.data.conversacionId,
  })

  // `fila.paciente_telefono` puede ser OTRO número si la receta ya estaba reclamada: el
  // estampado no pisa esa gestión previa, y el panel avisa a dónde fue realmente.
  return { ok: true as const, entregada, telefonoDestino: fila.paciente_telefono }
}

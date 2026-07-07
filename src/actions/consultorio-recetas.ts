'use server'

import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { resolverConsultorio } from '@/features/consultorio/access/contexto'
import { resolverSaliente } from '@/features/whatsapp/services/nodos'
import { getRecetasPendientesPorTelefono, liberarPorOrdenConsulta } from '@/features/whatsapp/services/recetasService'
import { entregarReceta } from '@/features/whatsapp/services/entrega'

/** Autoriza: médico operado (dueño o secretaria) + user que firma. null si no autorizado. */
async function ctxConsultorio() {
  const r = await resolverConsultorio()
  if (!r || !r.ctx.medicoActivoId) return null
  return { supabase: r.supabase, medicoId: r.ctx.medicoActivoId as string, userId: r.ctx.userId as string }
}

/**
 * Lista las recetas `pendiente_pago` del paciente de esta conversación, para que la
 * secretaria elija cuál liberar por orden de consulta. La conversación se lee con el
 * client del usuario (RLS delegada) filtrando por medico_id = médico operado: esa es la
 * autorización — una secretaria no puede pedir recetas de una conversación ajena.
 * `recetas` está bloqueada para la secretaria por RLS: se toca con service-role RECIÉN
 * después de ese check.
 */
export async function getRecetasPendientesConversacion(conversacionId: string) {
  const c = await ctxConsultorio()
  if (!c) return { error: 'No autenticado' }
  // Autorización: la conversación debe pertenecer al médico operado (RLS delegada del user client).
  const { data: conv } = await c.supabase
    .from('wa_conversaciones')
    .select('id, contacto:wa_contactos(telefono)')
    .eq('medico_id', c.medicoId)
    .eq('id', conversacionId)
    .maybeSingle()
  if (!conv) return { error: 'Conversación no encontrada' }
  const cv = conv as unknown as { contacto: { telefono: string } | { telefono: string }[] | null }
  const contacto = Array.isArray(cv.contacto) ? cv.contacto[0] : cv.contacto
  if (!contacto?.telefono) return { error: 'La conversación no tiene teléfono asociado' }

  const db = createServiceClient()
  const recetas = await getRecetasPendientesPorTelefono(db, c.medicoId, contacto.telefono)
  return {
    recetas: recetas.map((r) => ({
      id: r.id, paciente_nombre: r.paciente_nombre, nro_receta: r.nro_receta, monto: r.monto, created_at: r.created_at,
    })),
  }
}

const liberarSchema = z.object({
  recetaId: z.string().uuid(),
  nroOrden: z.string().trim().min(1, 'Ingresá el número de orden de consulta'),
})

/**
 * Libera una receta por orden de consulta (toma de la secretaria en el panel): registra
 * la constancia y transiciona pendiente_pago → pagada, y entrega el PDF por WhatsApp.
 * Doble refuerzo de autorización: (1) ctxConsultorio ya limitó medicoId al consultorio
 * operado por este usuario; (2) liberarPorOrdenConsulta filtra por ese medico_id en el
 * WHERE → una secretaria no puede liberar la receta de otro médico (0 filas → null).
 */
export async function liberarReceta(input: { recetaId: string; nroOrden: string }) {
  const c = await ctxConsultorio()
  if (!c) return { error: 'No autenticado' }
  const parsed = liberarSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const db = createServiceClient()
  // liberarPorOrdenConsulta filtra por medico_id = médico operado → una secretaria no puede
  // liberar la receta de otro médico (0 filas → null). Doble refuerzo: authz + WHERE.
  const fila = await liberarPorOrdenConsulta(db, {
    medicoId: c.medicoId,
    recetaId: parsed.data.recetaId,
    nroOrden: parsed.data.nroOrden,
    liberadaPor: c.userId,
  })
  if (!fila) return { error: 'La receta ya no está pendiente o no corresponde a este consultorio' }

  const canal = await resolverSaliente(db, fila.medico_id)
  if (canal) await entregarReceta(db, canal, fila) // best-effort: si el envío falla, la compensación deja la receta 'pagada' para reintentar
  return { ok: true as const }
}

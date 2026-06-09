import type { SupabaseClient } from '@supabase/supabase-js'
import { uploadWhatsAppMedia, sendWhatsAppDocument } from '@/lib/whatsapp/client'
import { buildExternalReference, buscarPagoAprobadoPorReferencia } from '@/lib/mercadopago/client'
import { decidirAccionPago } from '@/lib/mercadopago/validarPago'
import type { CanalResuelto } from './canales'
import { descargarPdfReceta } from './storageRecetas'
import { getConexionActiva } from './mpConexiones'
import {
  listarPagadasSinEntregar,
  listarPendientesConPreferencia,
  marcarPagada,
  marcarEntregada,
  type RecetaRow,
} from './recetasService'

/** Entrega el PDF de una receta pagada por WhatsApp (document). true si se entregó. */
export async function entregarReceta(db: SupabaseClient, canal: CanalResuelto, receta: RecetaRow): Promise<boolean> {
  if (!receta.paciente_telefono) return false
  const pdf = await descargarPdfReceta(db, receta.pdf_path)
  if (!pdf) return false
  const filename = `receta-${receta.nro_receta || receta.id.slice(0, 8)}.pdf`
  const mediaId = await uploadWhatsAppMedia({
    phoneNumberId: canal.phoneNumberId,
    accessToken: canal.accessToken,
    buffer: pdf,
    mimeType: 'application/pdf',
    filename,
  })
  if (!mediaId) return false
  const ok = await sendWhatsAppDocument({
    phoneNumberId: canal.phoneNumberId,
    accessToken: canal.accessToken,
    to: receta.paciente_telefono,
    mediaId,
    filename,
    caption: '✅ Pago confirmado. Acá está tu receta.',
  })
  if (!ok) return false // p.ej. ventana de 24h cerrada → queda 'pagada', se reintenta al próximo mensaje
  await marcarEntregada(db, receta.medico_id, receta.id)
  return true
}

/**
 * Al escribir el paciente: entrega lo pagado sin entregar Y reconcilia contra MP
 * (por si el webhook se perdió o la ventana estaba cerrada). Devuelve cuántas entregó.
 */
export async function entregarPendientes(
  db: SupabaseClient,
  canal: CanalResuelto,
  medicoId: string,
  telefonoNormalizado: string,
): Promise<number> {
  let entregadas = 0

  for (const receta of await listarPagadasSinEntregar(db, medicoId, telefonoNormalizado)) {
    if (await entregarReceta(db, canal, receta)) entregadas++
  }

  const pendientes = await listarPendientesConPreferencia(db, medicoId, telefonoNormalizado)
  if (pendientes.length) {
    const conexion = await getConexionActiva(db, medicoId)
    if (conexion) {
      for (const receta of pendientes) {
        const pago = await buscarPagoAprobadoPorReferencia(conexion.accessToken, buildExternalReference(receta.id))
        if (!pago) continue
        const d = decidirAccionPago({
          pago,
          receta: { id: receta.id, monto: receta.monto, estado: receta.estado },
          mpUserId: conexion.mpUserId,
        })
        if (d.accion !== 'marcar_pagada_y_entregar') continue
        await marcarPagada(db, medicoId, receta.id, pago.id)
        if (await entregarReceta(db, canal, receta)) entregadas++
      }
    }
  }
  return entregadas
}

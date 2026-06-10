import type { SupabaseClient } from '@supabase/supabase-js'
import { uploadWhatsAppMedia, sendWhatsAppDocument, sendWhatsAppText } from '@/lib/whatsapp/client'
import { buildExternalReference, buscarPagoAprobadoPorReferencia, consultarPago } from '@/lib/mercadopago/client'
import { decidirAccionPago } from '@/lib/mercadopago/validarPago'
import type { CanalResuelto } from './canales'
import { descargarPdfReceta } from './storageRecetas'
import { getConexionActiva } from './mpConexiones'
import {
  listarPagadasSinEntregar,
  listarPendientesConPreferencia,
  marcarPagada,
  marcarDevuelta,
  reclamarEntrega,
  revertirEntrega,
  type RecetaRow,
} from './recetasService'

/**
 * Entrega el PDF de una receta pagada por WhatsApp (document). true si se entregó.
 * Reclama la entrega ANTES de enviar (atómico): si dos procesos llegan a la vez
 * (avisos duplicados de MP, o webhook + mensaje del paciente), solo uno envía.
 * Si el envío falla después del reclamo, se revierte a 'pagada' para reintentar.
 */
export async function entregarReceta(db: SupabaseClient, canal: CanalResuelto, receta: RecetaRow): Promise<boolean> {
  if (!receta.paciente_telefono) return false
  if (!(await reclamarEntrega(db, receta.medico_id, receta.id))) return false

  const pdf = await descargarPdfReceta(db, receta.pdf_path)
  if (!pdf) {
    await revertirEntrega(db, receta.medico_id, receta.id)
    return false
  }
  const filename = `receta-${receta.nro_receta || receta.id.slice(0, 8)}.pdf`
  const mediaId = await uploadWhatsAppMedia({
    phoneNumberId: canal.phoneNumberId,
    accessToken: canal.accessToken,
    buffer: pdf,
    mimeType: 'application/pdf',
    filename,
  })
  if (!mediaId) {
    await revertirEntrega(db, receta.medico_id, receta.id)
    return false
  }
  const ok = await sendWhatsAppDocument({
    phoneNumberId: canal.phoneNumberId,
    accessToken: canal.accessToken,
    to: receta.paciente_telefono,
    mediaId,
    filename,
    caption: '✅ Pago confirmado. Acá está tu receta.',
  })
  if (!ok) {
    // p.ej. ventana de 24h cerrada → vuelve a 'pagada', se reintenta al próximo mensaje
    await revertirEntrega(db, receta.medico_id, receta.id)
    return false
  }
  return true // quedó 'entregada' por el reclamo
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

  const pagadas = await listarPagadasSinEntregar(db, medicoId, telefonoNormalizado)
  const pendientes = await listarPendientesConPreferencia(db, medicoId, telefonoNormalizado)
  if (!pagadas.length && !pendientes.length) return 0

  const conexion = await getConexionActiva(db, medicoId)

  for (const receta of pagadas) {
    // Re-validar contra MP antes de entregar: el pago pudo haberse devuelto
    // mientras la entrega estaba pendiente (ventana 24h). Best-effort: si no hay
    // conexión MP utilizable, se entrega igual (el pago YA fue validado al marcarse pagada).
    if (conexion && receta.mp_payment_id) {
      const pago = await consultarPago(conexion.accessToken, receta.mp_payment_id)
      if (!pago) continue // MP no responde → reintentar al próximo mensaje
      const d = decidirAccionPago({
        pago,
        receta: { id: receta.id, monto: receta.monto, estado: receta.estado },
        mpUserId: conexion.mpUserId,
      })
      if (d.accion === 'avisar_devolucion') {
        await marcarDevuelta(db, medicoId, receta.id)
        await sendWhatsAppText({
          phoneNumberId: canal.phoneNumberId,
          accessToken: canal.accessToken,
          to: canal.numeroPersonal,
          text: '⚠️ Un pago de receta figura devuelto en MercadoPago: no se entregará el PDF (quedó como devuelta). Revisalo en tu cuenta de MP.',
        })
        continue
      }
      if (d.accion !== 'marcar_pagada_y_entregar') continue
    }
    if (await entregarReceta(db, canal, receta)) entregadas++
  }

  if (pendientes.length) {
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

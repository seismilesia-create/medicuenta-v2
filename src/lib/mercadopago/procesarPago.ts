import type { PagoMP } from './client'
import { decidirAccionPago } from './validarPago'

export interface RecetaNotificada {
  id: string
  medico_id: string
  monto: number | null
  estado: string
}

export interface ProcesarPagoDeps {
  getReceta(recetaId: string): Promise<RecetaNotificada | null>
  getConexion(medicoId: string): Promise<{ mpUserId: string; accessToken: string } | null>
  consultarPago(accessToken: string, paymentId: string): Promise<PagoMP | null>
  marcarPagada(medicoId: string, recetaId: string, paymentId: string): Promise<void>
  entregar(recetaId: string): Promise<boolean>
  avisarMedico(medicoId: string, texto: string): Promise<void>
}

/**
 * Orquestador del webhook de MP. No confía en el body: re-consulta el pago con el
 * token del médico y delega la decisión en decidirAccionPago (validación cross-tenant).
 */
export async function procesarPagoNotificado(
  deps: ProcesarPagoDeps,
  args: { recetaId: string; paymentId: string },
): Promise<string> {
  const receta = await deps.getReceta(args.recetaId)
  if (!receta) return 'receta_inexistente'
  if (receta.estado === 'entregada') return 'ya_entregada'

  const conexion = await deps.getConexion(receta.medico_id)
  if (!conexion) return 'sin_conexion_mp'

  const pago = await deps.consultarPago(conexion.accessToken, args.paymentId)
  if (!pago) return 'pago_no_encontrado'

  const decision = decidirAccionPago({
    pago,
    receta: { id: receta.id, monto: receta.monto, estado: receta.estado },
    mpUserId: conexion.mpUserId,
  })

  if (decision.accion === 'ignorar') return `ignorado: ${decision.motivo}`
  if (decision.accion === 'avisar_devolucion') {
    await deps.avisarMedico(
      receta.medico_id,
      `⚠️ MercadoPago reportó una devolución/contracargo de un pago de receta (${decision.motivo}). Revisalo en tu cuenta de MP.`,
    )
    return 'devolucion'
  }

  await deps.marcarPagada(receta.medico_id, receta.id, pago.id)
  const entregada = await deps.entregar(receta.id)
  return entregada ? 'entregada' : 'pagada_sin_entregar'
}

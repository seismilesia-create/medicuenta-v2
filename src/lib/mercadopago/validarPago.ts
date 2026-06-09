import { buildExternalReference, type PagoMP } from './client'

export type AccionPago =
  | { accion: 'marcar_pagada_y_entregar' }
  | { accion: 'ignorar'; motivo: string }
  | { accion: 'avisar_devolucion'; motivo: string }

export interface RecetaParaValidar {
  id: string
  monto: number | null
  estado: string
}

/**
 * Decide qué hacer con un pago notificado/consultado. NO confía en el body del
 * webhook: el `pago` viene de re-consultar la API de MP con el token del médico.
 * Reglas de oro: referencia exacta, cobrador = médico dueño, monto exacto.
 */
export function decidirAccionPago(args: {
  pago: PagoMP
  receta: RecetaParaValidar
  mpUserId: string
}): AccionPago {
  const { pago, receta, mpUserId } = args

  if (pago.externalReference !== buildExternalReference(receta.id)) {
    return { accion: 'ignorar', motivo: 'external_reference no corresponde a esta receta' }
  }
  if (!mpUserId || pago.collectorId !== mpUserId) {
    return { accion: 'ignorar', motivo: 'el cobrador del pago no es el médico dueño' }
  }
  if (pago.status === 'refunded' || pago.status === 'charged_back') {
    return { accion: 'avisar_devolucion', motivo: `pago ${pago.id} en estado ${pago.status}` }
  }
  if (pago.status !== 'approved') {
    return { accion: 'ignorar', motivo: `status ${pago.status} no aprueba entrega` }
  }
  if (pago.currencyId !== 'ARS') {
    return { accion: 'ignorar', motivo: `moneda ${pago.currencyId || 'desconocida'} distinta de ARS` }
  }
  if (receta.monto == null || pago.transactionAmount !== Number(receta.monto)) {
    return { accion: 'ignorar', motivo: 'el monto pagado no coincide con la receta' }
  }
  if (receta.estado === 'entregada') {
    return { accion: 'ignorar', motivo: 'la receta ya fue entregada' }
  }
  if (receta.estado !== 'pendiente_pago' && receta.estado !== 'pagada') {
    return { accion: 'ignorar', motivo: `estado de receta ${receta.estado} no admite cobro` }
  }
  return { accion: 'marcar_pagada_y_entregar' }
}

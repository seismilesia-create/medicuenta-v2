import type { PagoMP } from './client'
import { decidirAccionPagoCobro } from './validarPago'

export interface CobroNotificado {
  id: string
  medico_id: string
  concepto: string
  monto: number
  estado: string
  paciente_nombre: string | null
}

export interface ProcesarPagoCobroDeps {
  getCobro(cobroId: string): Promise<CobroNotificado | null>
  getConexion(medicoId: string): Promise<{ mpUserId: string; accessToken: string } | null>
  consultarPago(accessToken: string, paymentId: string): Promise<PagoMP | null>
  /** pendiente → cobrado; false = otro webhook ganó la carrera. */
  marcarCobrado(medicoId: string, cobroId: string, paymentId: string): Promise<boolean>
  /** false = ya estaba devuelto/anulado (retry de MP): no re-notificar. */
  marcarDevuelto(medicoId: string, cobroId: string): Promise<boolean>
  notificarMedico(medicoId: string, aviso: { titulo: string; cuerpo: string }): Promise<void>
}

/**
 * Orquestador del webhook de MP para cobros de consultorio (plus / particular).
 * Mismo contrato de confianza que procesarPagoNotificado: el body no vale nada,
 * el pago se re-consulta con el token del médico y decide decidirAccionPagoCobro.
 * OJO: acá NO se corta temprano por estado 'cobrado' — el contracargo típico
 * llega después de acreditar, y ese camino tiene que poder procesarse.
 */
export async function procesarPagoCobroNotificado(
  deps: ProcesarPagoCobroDeps,
  args: { cobroId: string; paymentId: string },
): Promise<string> {
  const cobro = await deps.getCobro(args.cobroId)
  if (!cobro) return 'cobro_inexistente'

  const conexion = await deps.getConexion(cobro.medico_id)
  if (!conexion) return 'sin_conexion_mp'

  const pago = await deps.consultarPago(conexion.accessToken, args.paymentId)
  if (!pago) return 'pago_no_encontrado'

  const decision = decidirAccionPagoCobro({
    pago,
    cobro: { id: cobro.id, monto: cobro.monto, estado: cobro.estado },
    mpUserId: conexion.mpUserId,
  })

  if (decision.accion === 'ignorar') return `ignorado: ${decision.motivo}`

  if (decision.accion === 'avisar_devolucion') {
    const transiciono = await deps.marcarDevuelto(cobro.medico_id, cobro.id)
    if (transiciono) {
      await deps.notificarMedico(cobro.medico_id, {
        titulo: 'Devolución de un cobro',
        cuerpo: `MercadoPago reportó una devolución/contracargo (${decision.motivo}). Revisalo en tu cuenta de MP.`,
      })
      return 'devolucion'
    }
    return 'devolucion_repetida'
  }

  const acreditado = await deps.marcarCobrado(cobro.medico_id, cobro.id, pago.id)
  if (!acreditado) return 'ya_cobrado_carrera'

  const etiqueta = cobro.concepto === 'consulta_particular' ? 'una consulta particular' : 'un plus'
  const paciente = cobro.paciente_nombre ? ` · ${cobro.paciente_nombre}` : ''
  await deps.notificarMedico(cobro.medico_id, {
    titulo: `Se acreditó ${etiqueta}`,
    cuerpo: `$${Number(cobro.monto).toLocaleString('es-AR')}${paciente} · MercadoPago`,
  })
  return 'cobrado'
}

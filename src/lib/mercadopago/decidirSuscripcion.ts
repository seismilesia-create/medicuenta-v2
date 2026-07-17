/**
 * Qué le hacemos a la suscripción cuando MercadoPago avisa algo (spec F4.3 §4).
 *
 * Puro y decidible: recibe lo que YA se consultó a MP y devuelve la acción. No toca la
 * DB ni la red. Acá vive todo el criterio de negocio de la cobranza, así que se testea
 * entero — es la pieza que decide si un médico entra o no según si pagó.
 */
import type { EstadoSuscripcion } from '@/lib/admin/planes'
import type { StatusPreapproval, CuotaMP } from './preapproval'

export type AccionSuscripcion =
  | { accion: 'actualizar'; estado: EstadoSuscripcion; currentPeriodEnd?: string | null }
  | { accion: 'ignorar'; motivo: string }

/**
 * Evento de `subscription_preapproval`: cambió la suscripción en sí.
 *
 * `pending` NO cambia nada: es una suscripción creada que el médico todavía no autorizó.
 * Marcarla activa ahí le regalaría el sistema a cualquiera que apriete "Contratar" y
 * abandone el checkout.
 */
export function decidirPorPreapproval(
  status: StatusPreapproval | null,
  nextPaymentDate: string | null,
): AccionSuscripcion {
  switch (status) {
    case 'authorized':
      // MP ya validó la tarjeta con un cobro real (que después devuelve). El primer
      // cobro de verdad cae ~1 h después; no lo esperamos, si no el médico paga y
      // queda bloqueado una hora (D3).
      return { accion: 'actualizar', estado: 'activa', currentPeriodEnd: nextPaymentDate }
    case 'paused':
      return { accion: 'actualizar', estado: 'morosa' }
    case 'cancelled':
      // Puede ser el médico dándose de baja, o MP cancelando sola tras 3 cuotas
      // rechazadas. En los dos casos se terminó.
      return { accion: 'actualizar', estado: 'baja' }
    case 'pending':
      return { accion: 'ignorar', motivo: 'preapproval pendiente de autorización' }
    default:
      return { accion: 'ignorar', motivo: `status de preapproval desconocido: ${status}` }
  }
}

/**
 * Evento de `subscription_authorized_payment`: se intentó cobrar una cuota.
 *
 * 🔴 LA TRAMPA MÁS CARA DE MP: `processed` significa literalmente "cobrado **o**
 * reintentos agotados". Es el estado terminal del ÉXITO y del FRACASO. Habilitar el
 * acceso con `status === 'processed'` a secas le regala el sistema a todo el que no
 * pague, y no nos enteraríamos nunca. Por eso se exige además `payment.status ===
 * 'approved'`.
 */
export function decidirPorCuota(cuota: CuotaMP, mesesDelCiclo = 1): AccionSuscripcion {
  const pagado = cuota.paymentStatus === 'approved'

  switch (cuota.status) {
    case 'processed':
      return pagado
        ? {
            accion: 'actualizar',
            estado: 'activa',
            currentPeriodEnd: sumarMeses(cuota.debitDate, mesesDelCiclo),
          }
        : // Agotó los 4 reintentos de MP (~10 días). Cortamos acá y no esperamos las 3
          // cuotas que MP necesita para cancelar sola: serían ~3 meses gratis (R5).
          { accion: 'actualizar', estado: 'suspendida' }

    case 'recycling':
      // MP sigue reintentando: entra igual, con el aviso rojo (R5).
      return { accion: 'actualizar', estado: 'morosa' }

    case 'scheduled':
      return { accion: 'ignorar', motivo: 'cuota agendada, todavía no se intentó cobrar' }

    case 'canceled':
    case 'cancelled':
      return { accion: 'ignorar', motivo: 'cuota cancelada' }

    default:
      // El enum de MP es abierto (apareció 'recurring' en payloads reales, sin estar
      // documentado). Ante lo desconocido NO tocamos el acceso de nadie.
      return { accion: 'ignorar', motivo: `status de cuota desconocido: ${cuota.status}` }
  }
}

/**
 * El fin del período cubierto. MP **no** manda ningún campo de período (no existe
 * period_start/period_end): lo único que hay es `debit_date`, así que el próximo
 * vencimiento se deriva sumándole la frecuencia del preapproval.
 */
function sumarMeses(iso: string | null, meses: number): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  const d = new Date(t)
  d.setMonth(d.getMonth() + meses)
  return d.toISOString()
}

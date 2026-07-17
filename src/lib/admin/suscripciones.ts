/**
 * Reconciliación del ciclo de vida de la prueba (spec F4.3 §5, R4).
 *
 * OJO con qué es y qué NO es esto: el candado NO depende de este cron. `resolverAcceso`
 * compara `trial_ends_at` contra el reloj en cada request, así que una prueba vencida
 * bloquea al instante aunque el cron no haya corrido (D1 — si dependiera del cron, que
 * corre 1×/día, habría hasta 24 h de acceso gratis).
 *
 * Lo que hace el cron es que la BASE refleje la realidad: sin él, un médico bloqueado
 * seguiría figurando 'prueba' para siempre en el panel, en las alertas y en el MRR.
 * Es contabilidad, no seguridad.
 */
import { createServiceClient } from '@/lib/supabase/server'

type Service = ReturnType<typeof createServiceClient>

export interface ResultadoReconciliacion {
  suspendidas: number
  error?: string
}

/**
 * Pasa a 'suspendida' toda prueba que ya venció (R4: día 15 sin pagar → afuera).
 *
 * Escribe por service-role a propósito: `suscripciones` no tiene INSERT/UPDATE por RLS
 * (ver 20260612_fase4_suscripciones.sql), justo para que solo lo mueva el sistema.
 *
 * Deja en paz las filas con `trial_ends_at` NULL: son un dato corrupto que no debería
 * existir (el trigger siempre la escribe), y `resolverAcceso` ya las bloquea fallando
 * cerrado. Suspenderlas a ciegas podría voltear una fila recién creada si el alta falló
 * a mitad de camino; prefiero que quede visible y que el dueño la vea.
 */
export async function reconciliarPruebasVencidas(
  service: Service,
  nowMs: number = Date.now(),
): Promise<ResultadoReconciliacion> {
  const ahora = new Date(nowMs).toISOString()

  const { data, error } = await service
    .from('suscripciones')
    .update({ estado: 'suspendida', updated_at: ahora })
    .eq('estado', 'prueba')
    .not('trial_ends_at', 'is', null)
    .lte('trial_ends_at', ahora)
    .select('medico_id')

  if (error) {
    console.error('[suscripciones] reconciliarPruebasVencidas:', error.message)
    return { suspendidas: 0, error: error.message }
  }

  const suspendidas = data?.length ?? 0
  if (suspendidas > 0) {
    console.log(`[suscripciones] pruebas vencidas → suspendida: ${suspendidas}`)
  }
  return { suspendidas }
}

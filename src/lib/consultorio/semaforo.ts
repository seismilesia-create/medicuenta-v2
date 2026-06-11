/** Semáforo de la bandeja (spec Fase 3 D13/§6): la regla coincide con la ventana de Meta. */

export const VENTANA_24H_MS = 24 * 60 * 60 * 1000

export type Semaforo = 'alerta' | 'viva' | 'terminada'

export function ventanaAbierta(lastPacienteAt: string | null, nowMs: number): boolean {
  if (!lastPacienteAt) return false
  const t = new Date(lastPacienteAt).getTime()
  if (!Number.isFinite(t)) return false
  return nowMs - t < VENTANA_24H_MS
}

export function msRestantesVentana(lastPacienteAt: string | null, nowMs: number): number {
  if (!ventanaAbierta(lastPacienteAt, nowMs)) return 0
  return new Date(lastPacienteAt as string).getTime() + VENTANA_24H_MS - nowMs
}

export function semaforoConversacion(
  c: { necesita_humano: boolean; last_paciente_at: string | null },
  nowMs: number,
): Semaforo {
  if (c.necesita_humano) return 'alerta'
  return ventanaAbierta(c.last_paciente_at, nowMs) ? 'viva' : 'terminada'
}

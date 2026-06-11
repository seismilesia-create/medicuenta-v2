/** Estado efectivo de un turno para agenda/correlación (spec Fase 3 §5.4). */

export type EstadoEfectivoTurno = 'proximo' | 'atendido' | 'no_vino' | 'cancelado'

/**
 * Un turno pasado se asume atendido salvo marca explícita 'ausente'.
 * Así nadie tiene que marcar cada turno y la correlación turno→orden (3C)
 * puede confiar en "atendido".
 */
export function estadoEfectivoTurno(
  t: { estado: string; starts_at: string },
  nowMs: number,
): EstadoEfectivoTurno {
  if (t.estado === 'cancelado') return 'cancelado'
  if (t.estado === 'ausente') return 'no_vino'
  const inicio = new Date(t.starts_at).getTime()
  if (!Number.isFinite(inicio) || inicio > nowMs) return 'proximo'
  return 'atendido'
}

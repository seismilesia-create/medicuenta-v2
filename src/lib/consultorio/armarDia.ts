/** Arma la vista del día de la agenda (spec Fase 3 §5/D11): turnos + huecos, cronológico. */
import { estadoEfectivoTurno, type EstadoEfectivoTurno } from './asistencia'

export interface TurnoDia {
  id: string
  starts_at: string
  ends_at: string
  estado: string
  paciente_nombre: string | null
  paciente_apellido: string | null
  paciente_dni: string | null
  paciente_obra_social: string | null
  paciente_telefono: string | null
  notas: string | null
  origen: string
  /** Check-in de recepción: cuándo llegó el paciente hoy (null = no llegó aún). */
  checkin_at: string | null
}

export interface SlotLibre {
  startsAt: string
  endsAt: string
  label: string
}

export type ItemDia =
  | { tipo: 'turno'; turno: TurnoDia; estadoEfectivo: EstadoEfectivoTurno; ts: number }
  | { tipo: 'libre'; startsAt: string; label: string; ts: number }

/** Cancelados afuera (su hueco ya vuelve a ofrecerse vía el motor de slots). */
export function armarDia(turnos: TurnoDia[], libres: SlotLibre[], nowMs: number): ItemDia[] {
  const items: ItemDia[] = []
  for (const t of turnos) {
    if (t.estado === 'cancelado') continue
    items.push({
      tipo: 'turno',
      turno: t,
      estadoEfectivo: estadoEfectivoTurno(t, nowMs),
      ts: new Date(t.starts_at).getTime(),
    })
  }
  for (const s of libres) {
    items.push({ tipo: 'libre', startsAt: s.startsAt, label: s.label, ts: new Date(s.startsAt).getTime() })
  }
  return items.sort((a, b) => a.ts - b.ts)
}

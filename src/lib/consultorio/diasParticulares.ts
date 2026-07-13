import { weekdayOf } from '@/lib/turnos/slots'

export type DiaParticular = { tipo: 'semanal' | 'fecha'; dia_semana: number | null; fecha: string | null }

/** ¿La fecha (YYYY-MM-DD, hora AR) es un día particular del médico? Por fecha puntual o por día de semana. */
export function esDiaParticular(dias: DiaParticular[], fechaISO: string): boolean {
  const wd = weekdayOf(fechaISO)
  return dias.some(
    (d) =>
      (d.tipo === 'fecha' && d.fecha === fechaISO) ||
      (d.tipo === 'semanal' && d.dia_semana === wd),
  )
}

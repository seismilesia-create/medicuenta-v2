import { formatearDias, ordenarDias } from './diasSemana'

export interface BloqueHorario {
  weekday: number
  open_time: string
  close_time: string
}

/** PostgREST devuelve TIME como 'HH:MM:SS'; al paciente le mostramos 'HH:MM'. */
export function recortarHora(hora: string): string {
  return hora.slice(0, 5)
}

/**
 * Horario semanal en texto humano, agrupando los días que tienen exactamente los mismos
 * bloques:
 *
 *   Lun, Mié y Vie de 09:00 a 13:00
 *   Mar y Jue de 17:00 a 20:00
 *
 * Sin bloques devuelve null — quien lo use debe omitir el horario, nunca inventarlo.
 */
export function formatearHorariosSemana(bloques: BloqueHorario[]): string | null {
  if (!bloques.length) return null

  const porDia = new Map<number, string[]>()
  for (const b of bloques) {
    const franja = `de ${recortarHora(b.open_time)} a ${recortarHora(b.close_time)}`
    porDia.set(b.weekday, [...(porDia.get(b.weekday) ?? []), franja])
  }

  // Días con la MISMA jornada se dicen juntos ("Lun, Mié y Vie de 9 a 13").
  const porJornada = new Map<string, number[]>()
  for (const wd of ordenarDias([...porDia.keys()])) {
    const jornada = [...(porDia.get(wd) ?? [])].sort().join(' y ')
    porJornada.set(jornada, [...(porJornada.get(jornada) ?? []), wd])
  }

  const lineas = [...porJornada.entries()].map(([jornada, dias]) => `${formatearDias(dias)} ${jornada}`)
  return lineas.join('\n')
}

/** Días de la semana como los lee una persona (no como los numera JS).
 *  Convención del proyecto: 0=domingo .. 6=sábado (igual que wa_horarios y Date.getUTCDay). */

/** Lunes primero, domingo al final: así se lee un horario de atención. */
const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0]
const ABREV = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

/** "Lun, Mié y Vie". Ordena Lun→Dom, deduplica e ignora valores fuera de 0-6. */
export function formatearDias(dias: number[]): string {
  const validos = ORDEN_SEMANA.filter((wd) => dias.includes(wd))
  if (!validos.length) return ''
  const nombres = validos.map((wd) => ABREV[wd])
  if (nombres.length === 1) return nombres[0]
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

/** Weekdays presentes en `dias`, ordenados Lun→Dom (sin repetidos). */
export function ordenarDias(dias: number[]): number[] {
  return ORDEN_SEMANA.filter((wd) => dias.includes(wd))
}

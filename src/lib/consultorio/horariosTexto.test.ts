import { describe, it, expect } from 'vitest'
import { formatearHorariosSemana, recortarHora } from './horariosTexto'

const b = (weekday: number, open_time: string, close_time: string) => ({ weekday, open_time, close_time })

describe('recortarHora', () => {
  it('saca los segundos que agrega PostgREST', () => {
    expect(recortarHora('09:00:00')).toBe('09:00')
  })

  it('deja intacta una hora ya recortada', () => {
    expect(recortarHora('09:00')).toBe('09:00')
  })
})

describe('formatearHorariosSemana', () => {
  it('agrupa los días con la misma jornada', () => {
    const texto = formatearHorariosSemana([
      b(1, '09:00:00', '13:00:00'),
      b(3, '09:00:00', '13:00:00'),
      b(5, '09:00:00', '13:00:00'),
    ])
    expect(texto).toBe('Lun, Mié y Vie de 09:00 a 13:00')
  })

  it('separa en líneas las jornadas distintas, en orden Lun→Dom', () => {
    const texto = formatearHorariosSemana([
      b(2, '17:00:00', '20:00:00'),
      b(1, '09:00:00', '13:00:00'),
      b(4, '17:00:00', '20:00:00'),
    ])
    expect(texto).toBe('Lun de 09:00 a 13:00\nMar y Jue de 17:00 a 20:00')
  })

  it('junta con "y" los dos bloques de un día partido por la siesta', () => {
    const texto = formatearHorariosSemana([b(1, '09:00:00', '13:00:00'), b(1, '17:00:00', '20:00:00')])
    expect(texto).toBe('Lun de 09:00 a 13:00 y de 17:00 a 20:00')
  })

  it('no confunde un día partido con dos días sueltos de una sola franja', () => {
    const texto = formatearHorariosSemana([
      b(1, '09:00:00', '13:00:00'),
      b(1, '17:00:00', '20:00:00'),
      b(2, '09:00:00', '13:00:00'),
    ])
    expect(texto).toBe('Lun de 09:00 a 13:00 y de 17:00 a 20:00\nMar de 09:00 a 13:00')
  })

  it('sin horarios cargados devuelve null (no se inventa nada)', () => {
    expect(formatearHorariosSemana([])).toBeNull()
  })
})

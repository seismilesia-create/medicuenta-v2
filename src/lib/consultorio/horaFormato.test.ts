import { describe, expect, it } from 'vitest'
import { componerHora, from12, pad2, parseHora, to12 } from './horaFormato'

describe('horaFormato', () => {
  it('to12 mapea los bordes del reloj', () => {
    expect(to12(0)).toEqual({ h12: 12, periodo: 'AM' }) // medianoche
    expect(to12(9)).toEqual({ h12: 9, periodo: 'AM' })
    expect(to12(12)).toEqual({ h12: 12, periodo: 'PM' }) // mediodía
    expect(to12(13)).toEqual({ h12: 1, periodo: 'PM' })
    expect(to12(23)).toEqual({ h12: 11, periodo: 'PM' })
  })

  it('from12 es la inversa de to12 en las 24 horas', () => {
    for (let h = 0; h <= 23; h++) {
      const { h12, periodo } = to12(h)
      expect(from12(h12, periodo)).toBe(h)
    }
  })

  it('from12 mapea 12 AM→0 y 12 PM→12', () => {
    expect(from12(12, 'AM')).toBe(0)
    expect(from12(12, 'PM')).toBe(12)
    expect(from12(1, 'PM')).toBe(13)
  })

  it('parseHora tolera valores fuera de rango o malformados', () => {
    expect(parseHora('09:30')).toEqual({ h: 9, m: 30 })
    expect(parseHora('25:99')).toEqual({ h: 0, m: 0 })
    expect(parseHora('')).toEqual({ h: 0, m: 0 })
  })

  it('componerHora + pad2 arman el canónico con ceros', () => {
    expect(pad2(5)).toBe('05')
    expect(componerHora(9, 0)).toBe('09:00')
    expect(componerHora(13, 5)).toBe('13:05')
  })
})

import { describe, it, expect } from 'vitest'
import { formatearDias, ordenarDias } from './diasSemana'

describe('formatearDias', () => {
  it('une con coma y "y" final, en orden Lun→Dom', () => {
    expect(formatearDias([5, 1, 3])).toBe('Lun, Mié y Vie')
  })

  it('un solo día no lleva conector', () => {
    expect(formatearDias([2])).toBe('Mar')
  })

  it('deja el domingo al final', () => {
    expect(formatearDias([0, 6])).toBe('Sáb y Dom')
  })

  it('deduplica repetidos', () => {
    expect(formatearDias([1, 1, 1])).toBe('Lun')
  })

  it('sin días devuelve vacío', () => {
    expect(formatearDias([])).toBe('')
  })
})

describe('ordenarDias', () => {
  it('ordena Lun→Dom sin repetidos', () => {
    expect(ordenarDias([0, 3, 1, 3])).toEqual([1, 3, 0])
  })
})

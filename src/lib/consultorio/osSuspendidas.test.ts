import { describe, it, expect } from 'vitest'
import { normalizarOs, esOsSuspendida } from './osSuspendidas'

describe('normalizarOs', () => {
  it('minúsculas, sin acentos, espacios colapsados', () => {
    expect(normalizarOs('  OSEP   Catamarca ')).toBe('osep catamarca')
    expect(normalizarOs('Médife')).toBe('medife')
  })
})

describe('esOsSuspendida', () => {
  const lista = ['OSEP', 'Swiss Medical']

  it('match exacto, case/acentos-insensible', () => {
    expect(esOsSuspendida(lista, 'osep')).toBe(true)
    expect(esOsSuspendida(lista, 'SWISS MEDICAL')).toBe(true)
  })

  it('match parcial en ambas direcciones ("osep" vs "OSEP Catamarca")', () => {
    expect(esOsSuspendida(lista, 'OSEP Catamarca')).toBe(true)
    expect(esOsSuspendida(['OSEP Catamarca'], 'osep')).toBe(true)
  })

  it('sin match → false', () => {
    expect(esOsSuspendida(lista, 'PAMI')).toBe(false)
  })

  it('"particular" y vacío JAMÁS están suspendidos', () => {
    expect(esOsSuspendida(['particular'], 'particular')).toBe(false)
    expect(esOsSuspendida(lista, '')).toBe(false)
  })
})

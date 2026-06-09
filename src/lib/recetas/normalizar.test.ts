import { describe, it, expect } from 'vitest'
import { normalizarDni, normalizarNombre, nombresCoinciden, parseMontoArs } from './normalizar'

describe('normalizarDni', () => {
  it('deja solo dígitos', () => {
    expect(normalizarDni('23.309.087')).toBe('23309087')
    expect(normalizarDni(' 23309087 ')).toBe('23309087')
    expect(normalizarDni('DNI 23309087')).toBe('23309087')
  })
})

describe('normalizarNombre', () => {
  it('baja a minúsculas, quita acentos y colapsa espacios', () => {
    expect(normalizarNombre('  Héctor   Fernando MARTÍNEZ ')).toBe('hector fernando martinez')
  })
})

describe('nombresCoinciden', () => {
  it('matchea nombre parcial contra completo', () => {
    expect(nombresCoinciden('Héctor Fernando Martinez', 'hector martinez')).toBe(true)
  })
  it('matchea con acentos y mayúsculas distintas', () => {
    expect(nombresCoinciden('HÉCTOR MARTÍNEZ', 'hector martinez')).toBe(true)
  })
  it('no matchea personas distintas', () => {
    expect(nombresCoinciden('Héctor Fernando Martinez', 'Maria Lopez')).toBe(false)
  })
  it('un solo apellido alcanza (el DNI ya matcheó antes)', () => {
    expect(nombresCoinciden('Héctor Fernando Martinez', 'Martinez')).toBe(true)
  })
  it('vacíos no matchean', () => {
    expect(nombresCoinciden('', 'Martinez')).toBe(false)
  })
})

describe('parseMontoArs', () => {
  it('parsea formatos argentinos', () => {
    expect(parseMontoArs('5000')).toBe(5000)
    expect(parseMontoArs('5.000')).toBe(5000)
    expect(parseMontoArs('7.500,50')).toBe(7500.5)
    expect(parseMontoArs('$ 5000')).toBe(5000)
  })
  it('rechaza basura y no-positivos', () => {
    expect(parseMontoArs('abc')).toBeNull()
    expect(parseMontoArs('0')).toBeNull()
    expect(parseMontoArs('')).toBeNull()
  })
})

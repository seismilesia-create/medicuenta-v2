import { describe, it, expect } from 'vitest'
import { generarSlugBase, siguienteSlugLibre } from './slug'

describe('generarSlugBase', () => {
  it('usa el apellido, en minúsculas y sin acentos', () => {
    expect(generarSlugBase('Juan', 'Martínez')).toBe('dr-martinez')
  })
  it('colapsa espacios y caracteres no alfanuméricos en guiones', () => {
    expect(generarSlugBase('Ana', 'Di Lorenzo')).toBe('dr-di-lorenzo')
  })
  it('cae al nombre si no hay apellido', () => {
    expect(generarSlugBase('House', '')).toBe('dr-house')
  })
})

describe('siguienteSlugLibre', () => {
  it('devuelve la base si está libre', () => {
    expect(siguienteSlugLibre('dr-martinez', [])).toBe('dr-martinez')
  })
  it('agrega sufijo numérico si está tomada', () => {
    expect(siguienteSlugLibre('dr-martinez', ['dr-martinez'])).toBe('dr-martinez-2')
  })
  it('salta sufijos tomados', () => {
    expect(siguienteSlugLibre('dr-martinez', ['dr-martinez', 'dr-martinez-2'])).toBe('dr-martinez-3')
  })
})

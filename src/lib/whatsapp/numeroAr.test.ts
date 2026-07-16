import { describe, expect, it } from 'vitest'
import { nacionalDeWhatsappAr, normalizarWhatsappAr } from './numeroAr'

const CANON = '543834222049' // Catamarca, área 383

describe('normalizarWhatsappAr', () => {
  it('nacional pelado (10 dígitos) → agrega el 54', () => {
    expect(normalizarWhatsappAr('3834222049')).toBe(CANON)
    expect(normalizarWhatsappAr('383 4222049')).toBe(CANON)
  })

  it('ya canónico (con 54) → sin cambios', () => {
    expect(normalizarWhatsappAr('543834222049')).toBe(CANON)
    expect(normalizarWhatsappAr('+54 383 4222049')).toBe(CANON)
  })

  it('formato internacional de móvil (+54 9 …) → quita el 9', () => {
    expect(normalizarWhatsappAr('+54 9 383 4222049')).toBe(CANON)
    expect(normalizarWhatsappAr('5493834222049')).toBe(CANON)
  })

  it('con 0 de trunk → lo quita', () => {
    expect(normalizarWhatsappAr('0383 4222049')).toBe(CANON)
  })

  it('con 15 local tras el área → lo quita', () => {
    expect(normalizarWhatsappAr('0383 15 4222049')).toBe(CANON)
    expect(normalizarWhatsappAr('383154222049')).toBe(CANON)
  })

  it('móvil local: solo 9 + nacional (sin 54)', () => {
    expect(normalizarWhatsappAr('9 383 4222049')).toBe(CANON)
  })

  it('área de 2 dígitos (Buenos Aires, 11) con 15', () => {
    expect(normalizarWhatsappAr('011 15 4123 4567')).toBe('541141234567')
    expect(normalizarWhatsappAr('+54 9 11 4123 4567')).toBe('541141234567')
  })

  it('rechaza (null) lo que no es un celular AR válido', () => {
    expect(normalizarWhatsappAr('12345')).toBeNull()
    expect(normalizarWhatsappAr('')).toBeNull()
    expect(normalizarWhatsappAr(null)).toBeNull()
    expect(normalizarWhatsappAr('383 422')).toBeNull() // muy corto
  })
})

describe('nacionalDeWhatsappAr', () => {
  it('quita el 54 de un valor guardado (para el input con +54 fijo)', () => {
    expect(nacionalDeWhatsappAr(CANON)).toBe('3834222049')
  })
  it('valor vacío → cadena vacía', () => {
    expect(nacionalDeWhatsappAr('')).toBe('')
  })
})

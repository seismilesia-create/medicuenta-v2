import { describe, it, expect } from 'vitest'
import {
  construirSaludoConId,
  numeroNodoEsValido,
  construirWaMeUrl,
  extraerIdSlug,
  limpiarMarcadorId,
} from './linkNodo'

describe('construirSaludoConId', () => {
  it('embebe el slug en el marcador [ID:...]', () => {
    expect(construirSaludoConId('dr-perez')).toBe('Hola, quiero hacer una consulta [ID:dr-perez]')
  })
})

describe('numeroNodoEsValido', () => {
  it('acepta un E.164 plausible (con o sin formato)', () => {
    expect(numeroNodoEsValido('5491123456789')).toBe(true)
    expect(numeroNodoEsValido('+54 9 11 2345-6789')).toBe(true)
  })
  it('rechaza el placeholder, vacío, null y undefined', () => {
    expect(numeroNodoEsValido('TODO-E164-PRODUCCION')).toBe(false)
    expect(numeroNodoEsValido('')).toBe(false)
    expect(numeroNodoEsValido(null)).toBe(false)
    expect(numeroNodoEsValido(undefined)).toBe(false)
  })
  it('rechaza números demasiado cortos o largos', () => {
    expect(numeroNodoEsValido('123')).toBe(false)
    expect(numeroNodoEsValido('1234567890123456')).toBe(false)
  })
})

describe('construirWaMeUrl', () => {
  it('arma la URL wa.me con el texto URL-encodeado y el [ID:slug]', () => {
    const url = construirWaMeUrl('+54 9 11 2345-6789', 'dr-perez')
    expect(url).toBe('https://wa.me/5491123456789?text=' + encodeURIComponent('Hola, quiero hacer una consulta [ID:dr-perez]'))
  })
  it('encodea los corchetes y dos puntos del marcador', () => {
    const url = construirWaMeUrl('5491123456789', 'dr-perez')!
    expect(url).toContain('%5BID%3Adr-perez%5D') // [ID:dr-perez] encodeado
    expect(url).not.toContain(' ')
  })
  it('devuelve null con el placeholder del piloto', () => {
    expect(construirWaMeUrl('TODO-E164-PRODUCCION', 'dr-prueba')).toBeNull()
  })
})

describe('extraerIdSlug', () => {
  it('extrae el slug del marcador', () => {
    expect(extraerIdSlug('Hola, quiero hacer una consulta [ID:dr-prueba]')).toBe('dr-prueba')
  })
  it('null si no hay marcador (2.º mensaje en adelante)', () => {
    expect(extraerIdSlug('hola necesito un turno para mañana')).toBeNull()
  })
})

describe('limpiarMarcadorId', () => {
  it('quita el marcador y normaliza espacios', () => {
    expect(limpiarMarcadorId('Hola, quiero hacer una consulta [ID:dr-prueba]')).toBe('Hola, quiero hacer una consulta')
  })
  it('round-trip con construirSaludoConId', () => {
    const s = construirSaludoConId('dr-perez')
    expect(extraerIdSlug(s)).toBe('dr-perez')
    expect(limpiarMarcadorId(s)).toBe('Hola, quiero hacer una consulta')
  })
})

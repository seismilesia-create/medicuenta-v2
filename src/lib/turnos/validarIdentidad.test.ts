import { describe, it, expect } from 'vitest'
import { nombreSospechoso, dniNormalizadoValido } from './validarIdentidad'

describe('nombreSospechoso', () => {
  it('acepta nombres bien escritos', () => {
    expect(nombreSospechoso('Juan Pérez')).toBeNull()
    expect(nombreSospechoso('María de los Ángeles Gómez')).toBeNull()
    expect(nombreSospechoso("Rocío D'Alessandro")).toBeNull()
    expect(nombreSospechoso('Ana López-Rega')).toBeNull()
  })

  it('rechaza nombre solo (falta el apellido)', () => {
    expect(nombreSospechoso('Juancito')).toContain('apellido')
  })

  it('rechaza iniciales sueltas', () => {
    expect(nombreSospechoso('J. Pérez')).toContain('iniciales')
    expect(nombreSospechoso('Juan P')).toContain('iniciales')
  })

  it('rechaza números o símbolos (tipeo de celular)', () => {
    expect(nombreSospechoso('Juan P3rez')).toContain('números o símbolos')
    expect(nombreSospechoso('Juan Pérez!!')).toContain('números o símbolos')
  })

  it('rechaza palabras sin vocales (dedazo)', () => {
    expect(nombreSospechoso('Jsdfk Prez')).toContain('sin vocales')
  })

  it('rechaza demasiado corto', () => {
    expect(nombreSospechoso('Al B')).not.toBeNull()
    expect(nombreSospechoso('')).not.toBeNull()
  })
})

describe('dniNormalizadoValido', () => {
  it('acepta 7 u 8 dígitos, con o sin puntos', () => {
    expect(dniNormalizadoValido('23.309.087')).toBe('23309087')
    expect(dniNormalizadoValido('23309087')).toBe('23309087')
    expect(dniNormalizadoValido('1234567')).toBe('1234567')
    expect(dniNormalizadoValido('DNI 23309087')).toBe('23309087')
  })

  it('rechaza largos inválidos o basura', () => {
    expect(dniNormalizadoValido('123456')).toBeNull()
    expect(dniNormalizadoValido('123456789')).toBeNull() // eso es un CUIL recortado, no un DNI
    expect(dniNormalizadoValido('no tengo')).toBeNull()
    expect(dniNormalizadoValido('')).toBeNull()
  })
})

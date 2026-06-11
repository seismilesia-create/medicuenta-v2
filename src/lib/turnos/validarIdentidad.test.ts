import { describe, it, expect } from 'vitest'
import { nombreSospechoso, dniNormalizadoValido } from './validarIdentidad'

describe('nombreSospechoso (valida UN campo: nombre O apellido)', () => {
  it('acepta nombres y apellidos bien escritos, simples y compuestos', () => {
    expect(nombreSospechoso('Juan')).toBeNull()
    expect(nombreSospechoso('María José')).toBeNull()
    expect(nombreSospechoso('Pérez')).toBeNull()
    expect(nombreSospechoso('Gómez Paz')).toBeNull()
    expect(nombreSospechoso("D'Alessandro")).toBeNull()
    expect(nombreSospechoso('López-Rega')).toBeNull()
  })

  it('rechaza iniciales sueltas', () => {
    expect(nombreSospechoso('J.')).toContain('iniciales')
    expect(nombreSospechoso('Juan P')).toContain('iniciales')
  })

  it('rechaza números o símbolos (tipeo de celular)', () => {
    expect(nombreSospechoso('P3rez')).toContain('números o símbolos')
    expect(nombreSospechoso('Juan!!')).toContain('números o símbolos')
  })

  it('rechaza palabras sin vocales (dedazo)', () => {
    expect(nombreSospechoso('Jsdfk')).toContain('sin vocales')
  })

  it('rechaza demasiado corto', () => {
    expect(nombreSospechoso('')).not.toBeNull()
    expect(nombreSospechoso('J')).not.toBeNull()
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

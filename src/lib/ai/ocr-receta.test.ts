import { describe, it, expect } from 'vitest'
import { validarIdentidadExtraida, type RecetaExtraida } from './ocr-receta'

const base: RecetaExtraida = {
  paciente_nombre: 'Héctor Fernando Martinez',
  paciente_dni: '23309087',
  nro_receta: '9600011664690',
  obra_social: 'OSEP Catamarca',
  fecha_creada: '2026-06-08',
  prescriptor_nombre: 'Miguel Alberto Moreno',
  prescriptor_matricula: '1735',
  medicamentos: [{ droga: 'TADALAFILO', presentacion: '5 mg comp.rec.x 30', cantidad: '1' }],
  diagnosticos: [{ texto: 'Disuria', codigo: 'Z76.9' }],
  confianza: 'alta',
}

describe('validarIdentidadExtraida', () => {
  it('acepta identidad completa con confianza alta', () => {
    expect(validarIdentidadExtraida(base)).toBe(true)
  })
  it('acepta confianza media', () => {
    expect(validarIdentidadExtraida({ ...base, confianza: 'media' })).toBe(true)
  })
  it('rechaza confianza baja', () => {
    expect(validarIdentidadExtraida({ ...base, confianza: 'baja' })).toBe(false)
  })
  it('rechaza DNI corto o vacío', () => {
    expect(validarIdentidadExtraida({ ...base, paciente_dni: '123' })).toBe(false)
    expect(validarIdentidadExtraida({ ...base, paciente_dni: '' })).toBe(false)
  })
  it('rechaza nombre vacío o ínfimo', () => {
    expect(validarIdentidadExtraida({ ...base, paciente_nombre: 'X' })).toBe(false)
  })
})

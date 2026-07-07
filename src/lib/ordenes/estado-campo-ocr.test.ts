import { describe, it, expect } from 'vitest'
import { estadoCampoOcr } from './estado-campo-ocr'

describe('estadoCampoOcr', () => {
  it('no encontrado tiene prioridad sobre dudoso', () => {
    expect(estadoCampoOcr('nro_documento', ['nro_documento'], ['nro_documento']))
      .toBe('no_encontrado')
  })
  it('dudoso si está en la lista de dudosos', () => {
    expect(estadoCampoOcr('paciente', [], ['paciente'])).toBe('dudoso')
  })
  it('ok si no está en ninguna lista', () => {
    expect(estadoCampoOcr('paciente', [], [])).toBe('ok')
  })
})

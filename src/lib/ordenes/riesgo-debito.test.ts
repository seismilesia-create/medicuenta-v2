import { describe, it, expect } from 'vitest'
import { evaluarRiesgoOrden } from './riesgo-debito'

const base = {
  tipo: 'obra_social' as const,
  obra_social: 'OSEP',
  nivel: 1,
  firma_paciente: true,
  diagnostico_cie10: 'J00',
  firma_sello_medico: true,
}

describe('evaluarRiesgoOrden', () => {
  it('orden completa de obra social nivel 1 → sin riesgo', () => {
    expect(evaluarRiesgoOrden(base)).toEqual({ enRiesgo: false, faltantes: [] })
  })

  it('detecta falta de firma del afiliado', () => {
    const r = evaluarRiesgoOrden({ ...base, firma_paciente: false })
    expect(r.enRiesgo).toBe(true)
    expect(r.faltantes).toEqual(['firma_afiliado'])
  })

  it('detecta falta de diagnóstico (vacío o solo espacios)', () => {
    expect(evaluarRiesgoOrden({ ...base, diagnostico_cie10: '' }).faltantes).toEqual(['diagnostico'])
    expect(evaluarRiesgoOrden({ ...base, diagnostico_cie10: '   ' }).faltantes).toEqual(['diagnostico'])
    expect(evaluarRiesgoOrden({ ...base, diagnostico_cie10: null }).faltantes).toEqual(['diagnostico'])
  })

  it('detecta falta de firma y sello del médico', () => {
    expect(evaluarRiesgoOrden({ ...base, firma_sello_medico: false }).faltantes).toEqual(['firma_sello_medico'])
  })

  it('acumula múltiples faltantes en orden estable', () => {
    const r = evaluarRiesgoOrden({ ...base, firma_paciente: false, diagnostico_cie10: '', firma_sello_medico: false })
    expect(r.faltantes).toEqual(['firma_afiliado', 'diagnostico', 'firma_sello_medico'])
  })

  it('órdenes particulares JAMÁS tienen riesgo', () => {
    expect(evaluarRiesgoOrden({ ...base, tipo: 'particular', firma_paciente: false, diagnostico_cie10: '' }))
      .toEqual({ enRiesgo: false, faltantes: [] })
  })

  it('nivel 2 (cirugía) JAMÁS tiene riesgo — lo presenta el sanatorio', () => {
    expect(evaluarRiesgoOrden({ ...base, nivel: 2, firma_paciente: false }))
      .toEqual({ enRiesgo: false, faltantes: [] })
  })

  it('nivel ausente se asume 1', () => {
    expect(evaluarRiesgoOrden({ ...base, nivel: undefined, firma_paciente: false }).enRiesgo).toBe(true)
  })
})

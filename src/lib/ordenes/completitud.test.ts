import { describe, it, expect } from 'vitest'
import { evaluarCompletitud, CAMPO_FALTANTE_LABELS } from './completitud'

const base = {
  tipo: 'obra_social' as const,
  nro_comprobante: '12345678',
  token_osep: null,
  fecha_emision: '2026-07-01',
  nro_afiliado: '033883',
  nro_documento: '30111222',
  obra_social: 'SWISS MEDICAL',
  nombre_practica: 'Consulta médica',
  honorario_calculado: 4500,
}

describe('evaluarCompletitud', () => {
  it('orden OS con todos los datos de identidad → completa', () => {
    expect(evaluarCompletitud(base)).toEqual({ completa: true, faltantes: [] })
  })

  it('particular siempre completa (no se presenta a OS)', () => {
    const r = evaluarCompletitud({ ...base, tipo: 'particular', obra_social: null })
    expect(r.completa).toBe(true)
  })

  it('N° de orden vale por comprobante O por token', () => {
    const r = evaluarCompletitud({ ...base, nro_comprobante: '', token_osep: '123456' })
    expect(r.completa).toBe(true)
  })

  it('sin comprobante ni token → falta nro_orden', () => {
    const r = evaluarCompletitud({ ...base, nro_comprobante: '', token_osep: null })
    expect(r.completa).toBe(false)
    expect(r.faltantes).toContain('nro_orden')
  })

  it('honorario en 0 → falta honorario', () => {
    const r = evaluarCompletitud({ ...base, honorario_calculado: 0 })
    expect(r.faltantes).toContain('honorario')
  })

  it('acumula varios faltantes en orden estable', () => {
    const r = evaluarCompletitud({
      ...base, nro_comprobante: '', token_osep: null,
      fecha_emision: '', nro_afiliado: '', nro_documento: '',
      obra_social: '', nombre_practica: '', honorario_calculado: 0,
    })
    expect(r.faltantes).toEqual([
      'nro_orden', 'fecha_emision', 'nro_afiliado',
      'nro_documento', 'obra_social', 'nombre_practica', 'honorario',
    ])
  })

  it('cada faltante tiene label', () => {
    for (const k of Object.keys(CAMPO_FALTANTE_LABELS)) {
      expect(CAMPO_FALTANTE_LABELS[k as keyof typeof CAMPO_FALTANTE_LABELS]).toBeTruthy()
    }
  })
})

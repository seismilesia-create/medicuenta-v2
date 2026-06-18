import { describe, it, expect } from 'vitest'
import { agruparPorObraSocial, periodoMesDe, totalHonorarios } from './planilla'

const o = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'x', obra_social: 'OSEP', fecha_atencion: '2026-06-10',
  honorario_calculado: 1000, monto_plus: 500, ...over,
})

describe('periodoMesDe', () => {
  it('devuelve el primer día del mes (YYYY-MM-01)', () => {
    expect(periodoMesDe('2026-06-10')).toBe('2026-06-01')
    expect(periodoMesDe('2026-12-31')).toBe('2026-12-01')
  })
})

describe('totalHonorarios', () => {
  it('suma honorario_calculado y EXCLUYE el plus (privado)', () => {
    expect(totalHonorarios([o(), o({ honorario_calculado: 2000 })])).toBe(3000)
  })
})

describe('agruparPorObraSocial', () => {
  it('agrupa por OS y arma un grupo por cada una', () => {
    const grupos = agruparPorObraSocial([o(), o({ obra_social: 'PAMI' }), o()])
    expect(grupos.map((g) => g.obra_social).sort()).toEqual(['OSEP', 'PAMI'])
    const osep = grupos.find((g) => g.obra_social === 'OSEP')!
    expect(osep.ordenes).toHaveLength(2)
    expect(osep.periodo_mes).toBe('2026-06-01')
    expect(osep.monto_total).toBe(2000)
  })
})

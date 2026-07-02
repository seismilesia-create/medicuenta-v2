import { describe, it, expect } from 'vitest'
import { agruparParaPlanilla, periodoMesDe, totalHonorarios } from './planilla'

const o = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'x', codigo_os: null, obra_social: 'OSEP', agente_facturador: 'circulo_medico', fecha_atencion: '2026-06-10',
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

describe('agruparParaPlanilla', () => {
  it('agrupa por obra social (mismo mes y agente)', () => {
    const grupos = agruparParaPlanilla([o(), o({ obra_social: 'PAMI' }), o()])
    expect(grupos.map((g) => g.obra_social).sort()).toEqual(['OSEP', 'PAMI'])
    const osep = grupos.find((g) => g.obra_social === 'OSEP')!
    expect(osep.ordenes).toHaveLength(2)
    expect(osep.periodo_mes).toBe('2026-06-01')
    expect(osep.agente_facturador).toBe('circulo_medico')
    expect(osep.monto_total).toBe(2000)
  })

  it('separa la misma OS en meses distintos', () => {
    const grupos = agruparParaPlanilla([o(), o({ fecha_atencion: '2026-05-03' })])
    expect(grupos).toHaveLength(2)
    expect(grupos.map((g) => g.periodo_mes).sort()).toEqual(['2026-05-01', '2026-06-01'])
  })

  it('separa la misma OS y mes por agente facturador distinto', () => {
    const grupos = agruparParaPlanilla([o(), o({ agente_facturador: 'comunidad' })])
    expect(grupos).toHaveLength(2)
    expect(grupos.map((g) => g.agente_facturador).sort()).toEqual(['circulo_medico', 'comunidad'])
  })

  it('agrupa por codigo_os aunque el texto de la OS varíe (OSEP vs O.S.E.P.)', () => {
    const grupos = agruparParaPlanilla([
      o({ codigo_os: 327, obra_social: 'OSEP' }),
      o({ codigo_os: 327, obra_social: 'O.S.E.P.' }),
    ])
    expect(grupos).toHaveLength(1)
    expect(grupos[0].codigo_os).toBe(327)
    expect(grupos[0].ordenes).toHaveLength(2)
  })

  it('sin codigo_os, agrupa por slug de texto tolerante (OSEP == O.S.E.P.)', () => {
    const grupos = agruparParaPlanilla([
      o({ codigo_os: null, obra_social: 'OSEP' }),
      o({ codigo_os: null, obra_social: 'O.S.E.P.' }),
    ])
    expect(grupos).toHaveLength(1)
    expect(grupos[0].ordenes).toHaveLength(2)
  })

  it('distinto codigo_os = distinta planilla', () => {
    const grupos = agruparParaPlanilla([o({ codigo_os: 327 }), o({ codigo_os: 186, obra_social: 'PAMI' })])
    expect(grupos).toHaveLength(2)
  })
})

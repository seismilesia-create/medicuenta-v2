import { describe, it, expect } from 'vitest'
import { analizarCostos, type MedicoMetricas } from './costos'

function med(over: Partial<MedicoMetricas>): MedicoMetricas {
  return {
    medico_id: 'm', nombre: 'A', apellido: 'B', email: 'a@b.com', alta: null,
    numero: null, canal_estado: null, plan: 'full', sub_estado: 'activa', trial_ends_at: null,
    tokens_30d: 0, mensajes_pagos_30d: 0, mensajes_salientes_30d: 0,
    errores_7d: 0, turnos_total: 0,
    ...over,
  }
}

describe('analizarCostos', () => {
  it('suma totales y calcula el promedio', () => {
    const a = analizarCostos([
      med({ medico_id: '1', tokens_30d: 100, mensajes_pagos_30d: 2, errores_7d: 1 }),
      med({ medico_id: '2', tokens_30d: 300, mensajes_pagos_30d: 0, errores_7d: 0 }),
    ])
    expect(a.resumen.totalMedicos).toBe(2)
    expect(a.resumen.totalTokens30d).toBe(400)
    expect(a.resumen.promedioTokens).toBe(200)
    expect(a.resumen.totalMensajesPagos30d).toBe(2)
    expect(a.resumen.totalErrores7d).toBe(1)
  })

  it('marca como outlier al que supera el promedio por 1.5x', () => {
    const a = analizarCostos([
      med({ medico_id: 'normal', tokens_30d: 100 }),
      med({ medico_id: 'normal2', tokens_30d: 100 }),
      med({ medico_id: 'gastador', tokens_30d: 1000 }), // promedio=400, 1000>600
    ])
    const out = a.medicos.filter((m) => m.esOutlier).map((m) => m.medico_id)
    expect(out).toEqual(['gastador'])
    expect(a.resumen.cantOutliers).toBe(1)
  })

  it('ordena por tokens descendente', () => {
    const a = analizarCostos([
      med({ medico_id: 'bajo', tokens_30d: 10 }),
      med({ medico_id: 'alto', tokens_30d: 900 }),
      med({ medico_id: 'medio', tokens_30d: 100 }),
    ])
    expect(a.medicos.map((m) => m.medico_id)).toEqual(['alto', 'medio', 'bajo'])
  })

  it('con un solo médico no hay outliers (no hay con qué comparar)', () => {
    const a = analizarCostos([med({ medico_id: 'solo', tokens_30d: 5000 })])
    expect(a.resumen.cantOutliers).toBe(0)
    expect(a.medicos[0].esOutlier).toBe(false)
  })

  it('todo en cero: promedio 0, sin outliers, sin crash', () => {
    const a = analizarCostos([med({ medico_id: '1' }), med({ medico_id: '2' })])
    expect(a.resumen.promedioTokens).toBe(0)
    expect(a.resumen.cantOutliers).toBe(0)
  })

  it('lista vacía', () => {
    const a = analizarCostos([])
    expect(a.resumen.totalMedicos).toBe(0)
    expect(a.resumen.promedioTokens).toBe(0)
    expect(a.medicos).toEqual([])
  })
})

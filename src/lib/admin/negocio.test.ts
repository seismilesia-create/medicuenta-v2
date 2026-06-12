import { describe, it, expect } from 'vitest'
import { resumenNegocio } from './negocio'
import type { MedicoMetricas } from './costos'

function med(over: Partial<MedicoMetricas>): MedicoMetricas {
  return {
    medico_id: 'm', nombre: null, apellido: null, email: null, alta: null,
    numero: null, canal_estado: null, plan: 'full', sub_estado: 'activa', trial_ends_at: null,
    tokens_30d: 0, mensajes_pagos_30d: 0, mensajes_salientes_30d: 0, errores_7d: 0, turnos_total: 0,
    ...over,
  }
}

describe('resumenNegocio', () => {
  it('cuenta por plan y por estado', () => {
    const r = resumenNegocio([
      med({ plan: 'full', sub_estado: 'activa' }),
      med({ plan: 'full', sub_estado: 'prueba' }),
      med({ plan: 'basico', sub_estado: 'activa' }),
      med({ plan: 'basico', sub_estado: 'morosa' }),
      med({ plan: 'full', sub_estado: 'suspendida' }),
    ])
    expect(r).toEqual({
      total: 5, full: 3, basico: 2,
      enPrueba: 1, activos: 2, morosos: 1, suspendidos: 1,
    })
  })

  it('plan null cuenta como básico', () => {
    const r = resumenNegocio([med({ plan: null, sub_estado: null })])
    expect(r.basico).toBe(1)
    expect(r.full).toBe(0)
  })

  it('lista vacía', () => {
    expect(resumenNegocio([])).toEqual({
      total: 0, full: 0, basico: 0, enPrueba: 0, activos: 0, morosos: 0, suspendidos: 0,
    })
  })
})

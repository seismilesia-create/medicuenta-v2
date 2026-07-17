import { describe, it, expect } from 'vitest'
import { detectarAlertas } from './alertas'
import type { MedicoMetricas } from './costos'

const NOW = new Date('2026-06-15T13:00:00.000Z').getTime()

function med(over: Partial<MedicoMetricas>): MedicoMetricas {
  return {
    medico_id: 'm', nombre: 'Juan', apellido: 'Pérez', email: 'a@b.com', alta: null,
    numero: null, canal_estado: null, plan: 'full', sub_estado: 'activa', trial_ends_at: null,
    tokens_30d: 0, mensajes_pagos_30d: 0, mensajes_salientes_30d: 0, errores_7d: 0, turnos_total: 0,
    ...over,
  }
}

describe('detectarAlertas', () => {
  it('un médico sano no genera alertas', () => {
    expect(detectarAlertas([med({})], NOW)).toEqual([])
  })

  it('errores: ≥5 warning, ≥15 error, <5 nada', () => {
    expect(detectarAlertas([med({ errores_7d: 4 })], NOW)).toHaveLength(0)
    expect(detectarAlertas([med({ errores_7d: 6 })], NOW)[0].severidad).toBe('warning')
    expect(detectarAlertas([med({ errores_7d: 20 })], NOW)[0].severidad).toBe('error')
  })

  it('moroso = error; suspendida = warning', () => {
    expect(detectarAlertas([med({ sub_estado: 'morosa' })], NOW)[0]).toMatchObject({ tipo: 'pago', severidad: 'error' })
    expect(detectarAlertas([med({ sub_estado: 'suspendida' })], NOW)[0]).toMatchObject({ tipo: 'suspendida', severidad: 'warning' })
  })

  it('prueba: vencida = warning, por vencer (≤3d) = info, lejos = nada', () => {
    const vencida = med({ sub_estado: 'prueba', trial_ends_at: '2026-06-10T00:00:00.000Z' })
    expect(detectarAlertas([vencida], NOW)[0]).toMatchObject({ tipo: 'trial', severidad: 'warning' })

    const porVencer = med({ sub_estado: 'prueba', trial_ends_at: '2026-06-17T13:00:00.000Z' }) // 2 días
    const a = detectarAlertas([porVencer], NOW)[0]
    expect(a.severidad).toBe('info')
    expect(a.mensaje).toContain('2 días')

    const lejos = med({ sub_estado: 'prueba', trial_ends_at: '2026-06-30T00:00:00.000Z' })
    expect(detectarAlertas([lejos], NOW)).toHaveLength(0)
  })

  it('una prueba vencida hace HORAS es vencida, no "vence hoy"', () => {
    // Regresión: con `ceil(dias) < 0` esto daba -0, y `-0 < 0` es false → se anunciaba
    // como si todavía estuviera viva.
    const reciénVencida = med({ sub_estado: 'prueba', trial_ends_at: '2026-06-15T11:00:00.000Z' }) // NOW - 2h
    const a = detectarAlertas([reciénVencida], NOW)[0]
    expect(a).toMatchObject({ tipo: 'trial', severidad: 'warning' })
    expect(a.mensaje).toContain('vencida')
  })

  it('WhatsApp desconectado alerta solo en Full', () => {
    expect(detectarAlertas([med({ plan: 'full', canal_estado: 'pendiente' })], NOW)[0]).toMatchObject({ tipo: 'whatsapp' })
    expect(detectarAlertas([med({ plan: 'basico', canal_estado: 'pendiente' })], NOW)).toHaveLength(0)
    expect(detectarAlertas([med({ plan: 'full', canal_estado: 'conectado' })], NOW)).toHaveLength(0)
  })

  it('ordena lo más grave primero (error → warning → info)', () => {
    const medicos = [
      med({ medico_id: '1', sub_estado: 'prueba', trial_ends_at: '2026-06-17T13:00:00.000Z' }), // info
      med({ medico_id: '2', sub_estado: 'morosa' }), // error
      med({ medico_id: '3', errores_7d: 6 }), // warning
    ]
    expect(detectarAlertas(medicos, NOW).map((a) => a.severidad)).toEqual(['error', 'warning', 'info'])
  })
})

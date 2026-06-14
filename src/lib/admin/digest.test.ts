import { describe, it, expect } from 'vitest'
import { construirDigest } from './digest'
import type { Alerta } from './alertas'

function alerta(over: Partial<Alerta>): Alerta {
  return { tipo: 'errores', severidad: 'warning', medico: 'Juan Pérez', mensaje: 'algo', ...over }
}

describe('construirDigest', () => {
  it('sin alertas: hayAlertas=false, firma vacía y asunto "Todo en orden"', () => {
    const d = construirDigest([])
    expect(d.hayAlertas).toBe(false)
    expect(d.cantidad).toBe(0)
    expect(d.firma).toBe('')
    expect(d.asunto).toBe('MediCuenta · Todo en orden')
    expect(d.texto).toContain('Todo en orden')
  })

  it('una alerta: hayAlertas=true y el médico/mensaje aparecen en html y texto', () => {
    const d = construirDigest([alerta({ medico: 'Ana', mensaje: 'Pago pendiente (moroso)' })])
    expect(d.hayAlertas).toBe(true)
    expect(d.cantidad).toBe(1)
    expect(d.asunto).toBe('MediCuenta · 1 alerta')
    expect(d.html).toContain('Ana')
    expect(d.html).toContain('Pago pendiente')
    expect(d.texto).toContain('Ana — Pago pendiente (moroso)')
  })

  it('asunto destaca las críticas cuando hay severidad error', () => {
    const d = construirDigest([
      alerta({ severidad: 'error', tipo: 'pago', mensaje: 'Pago pendiente (moroso)' }),
      alerta({ severidad: 'info', tipo: 'trial', mensaje: 'La prueba vence en 2 días' }),
    ])
    expect(d.asunto).toBe('MediCuenta · 2 alertas (1 crítica)')
  })

  it('firma es estable ante reordenamiento del input', () => {
    const a = alerta({ medico: 'Ana', mensaje: 'm1' })
    const b = alerta({ medico: 'Beto', mensaje: 'm2' })
    expect(construirDigest([a, b]).firma).toBe(construirDigest([b, a]).firma)
  })

  it('firma cambia si cambia el set de alertas', () => {
    const base = construirDigest([alerta({ medico: 'Ana', mensaje: 'm1' })]).firma
    const otra = construirDigest([alerta({ medico: 'Ana', mensaje: 'm2' })]).firma
    expect(base).not.toBe(otra)
  })

  it('agrupa por severidad con sus rótulos', () => {
    const d = construirDigest([
      alerta({ severidad: 'error', mensaje: 'grave' }),
      alerta({ severidad: 'info', mensaje: 'leve' }),
    ])
    expect(d.html).toContain('Críticas')
    expect(d.html).toContain('Para tener en cuenta')
    expect(d.texto.indexOf('Críticas')).toBeLessThan(d.texto.indexOf('Para tener en cuenta'))
  })

  it('escapa HTML en datos del médico (no inyecta markup)', () => {
    const d = construirDigest([alerta({ medico: '<b>x</b>', mensaje: 'ok' })])
    expect(d.html).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(d.html).not.toContain('<b>x</b>')
  })
})

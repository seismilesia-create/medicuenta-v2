import { describe, it, expect, vi } from 'vitest'
import { procesarPagoCobroNotificado, type ProcesarPagoCobroDeps } from './procesarPagoCobro'
import type { PagoMP } from './client'

const COBRO_ID = '123e4567-e89b-42d3-a456-426614174000'
const MEDICO_ID = '924014ac-0000-4000-8000-000000000000'

function pagoAprobado(): PagoMP {
  return {
    id: '555',
    status: 'approved',
    externalReference: `plus:${COBRO_ID}`,
    transactionAmount: 8000,
    currencyId: 'ARS',
    collectorId: '111',
  }
}

function cobroPendiente() {
  return {
    id: COBRO_ID,
    medico_id: MEDICO_ID,
    concepto: 'plus',
    monto: 8000,
    estado: 'pendiente',
    paciente_nombre: 'Juan Pérez',
  }
}

function fakes(over: Partial<ProcesarPagoCobroDeps> = {}): ProcesarPagoCobroDeps {
  return {
    getCobro: vi.fn(async () => cobroPendiente()),
    getConexion: vi.fn(async () => ({ mpUserId: '111', accessToken: 'tok' })),
    consultarPago: vi.fn(async () => pagoAprobado()),
    marcarCobrado: vi.fn(async () => true),
    marcarDevuelto: vi.fn(async () => true),
    notificarMedico: vi.fn(async () => {}),
    ...over,
  }
}

describe('procesarPagoCobroNotificado', () => {
  it('aprobado → marca cobrado y notifica al médico', async () => {
    const deps = fakes()
    const out = await procesarPagoCobroNotificado(deps, { cobroId: COBRO_ID, paymentId: '555' })
    expect(out).toBe('cobrado')
    expect(deps.marcarCobrado).toHaveBeenCalledWith(MEDICO_ID, COBRO_ID, '555')
    expect(deps.notificarMedico).toHaveBeenCalled()
  })

  it('cobro inexistente → corta', async () => {
    const out = await procesarPagoCobroNotificado(fakes({ getCobro: vi.fn(async () => null) }), {
      cobroId: COBRO_ID,
      paymentId: '555',
    })
    expect(out).toBe('cobro_inexistente')
  })

  it('retry de MP sobre cobro ya cobrado → ignorado, sin notificar de nuevo', async () => {
    const deps = fakes({ getCobro: vi.fn(async () => ({ ...cobroPendiente(), estado: 'cobrado' })) })
    const out = await procesarPagoCobroNotificado(deps, { cobroId: COBRO_ID, paymentId: '555' })
    expect(out).toContain('ignorado')
    expect(deps.marcarCobrado).not.toHaveBeenCalled()
    expect(deps.notificarMedico).not.toHaveBeenCalled()
  })

  it('dos webhooks en carrera → el que pierde no notifica', async () => {
    const deps = fakes({ marcarCobrado: vi.fn(async () => false) })
    const out = await procesarPagoCobroNotificado(deps, { cobroId: COBRO_ID, paymentId: '555' })
    expect(out).toBe('ya_cobrado_carrera')
    expect(deps.notificarMedico).not.toHaveBeenCalled()
  })

  it('sin conexión MP → corta', async () => {
    const out = await procesarPagoCobroNotificado(fakes({ getConexion: vi.fn(async () => null) }), {
      cobroId: COBRO_ID,
      paymentId: '555',
    })
    expect(out).toBe('sin_conexion_mp')
  })

  it('pago de otro cobrador → ignorado sin marcar (cross-tenant)', async () => {
    const deps = fakes({ getConexion: vi.fn(async () => ({ mpUserId: '999', accessToken: 'tok' })) })
    const out = await procesarPagoCobroNotificado(deps, { cobroId: COBRO_ID, paymentId: '555' })
    expect(out).toContain('ignorado')
    expect(deps.marcarCobrado).not.toHaveBeenCalled()
  })

  it('monto distinto → ignorado (no se acredita un pago parcial)', async () => {
    const deps = fakes({ consultarPago: vi.fn(async () => ({ ...pagoAprobado(), transactionAmount: 1 })) })
    const out = await procesarPagoCobroNotificado(deps, { cobroId: COBRO_ID, paymentId: '555' })
    expect(out).toContain('ignorado')
  })

  it('contracargo sobre cobro YA cobrado → marca devuelto y avisa (no corta temprano)', async () => {
    const deps = fakes({
      getCobro: vi.fn(async () => ({ ...cobroPendiente(), estado: 'cobrado' })),
      consultarPago: vi.fn(async () => ({ ...pagoAprobado(), status: 'charged_back' })),
    })
    const out = await procesarPagoCobroNotificado(deps, { cobroId: COBRO_ID, paymentId: '555' })
    expect(out).toBe('devolucion')
    expect(deps.marcarDevuelto).toHaveBeenCalledWith(MEDICO_ID, COBRO_ID)
    expect(deps.notificarMedico).toHaveBeenCalled()
  })

  it('retry del contracargo (ya devuelto) → no re-notifica', async () => {
    const deps = fakes({
      getCobro: vi.fn(async () => ({ ...cobroPendiente(), estado: 'devuelto' })),
      consultarPago: vi.fn(async () => ({ ...pagoAprobado(), status: 'refunded' })),
      marcarDevuelto: vi.fn(async () => false),
    })
    const out = await procesarPagoCobroNotificado(deps, { cobroId: COBRO_ID, paymentId: '555' })
    expect(out).toBe('devolucion_repetida')
    expect(deps.notificarMedico).not.toHaveBeenCalled()
  })
})

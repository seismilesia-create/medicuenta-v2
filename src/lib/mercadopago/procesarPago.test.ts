import { describe, it, expect, vi } from 'vitest'
import { procesarPagoNotificado, type ProcesarPagoDeps } from './procesarPago'
import type { PagoMP } from './client'

const RECETA_ID = '123e4567-e89b-42d3-a456-426614174000'
const MEDICO_ID = '924014ac-0000-4000-8000-000000000000'

function pagoAprobado(): PagoMP {
  return {
    id: '555',
    status: 'approved',
    externalReference: `receta:${RECETA_ID}`,
    transactionAmount: 5000,
    currencyId: 'ARS',
    collectorId: '111',
  }
}

function fakes(over: Partial<ProcesarPagoDeps> = {}): ProcesarPagoDeps {
  return {
    getReceta: vi.fn(async () => ({ id: RECETA_ID, medico_id: MEDICO_ID, monto: 5000, estado: 'pendiente_pago' })),
    getConexion: vi.fn(async () => ({ mpUserId: '111', accessToken: 'tok' })),
    consultarPago: vi.fn(async () => pagoAprobado()),
    marcarPagada: vi.fn(async () => {}),
    marcarDevuelta: vi.fn(async () => {}),
    entregar: vi.fn(async () => true),
    avisarMedico: vi.fn(async () => {}),
    ...over,
  }
}

describe('procesarPagoNotificado', () => {
  it('aprobado → marca pagada y entrega', async () => {
    const deps = fakes()
    const out = await procesarPagoNotificado(deps, { recetaId: RECETA_ID, paymentId: '555' })
    expect(out).toBe('entregada')
    expect(deps.marcarPagada).toHaveBeenCalledWith(MEDICO_ID, RECETA_ID, '555')
    expect(deps.entregar).toHaveBeenCalled()
  })
  it('entrega falla (ventana 24h) → queda pagada sin entregar', async () => {
    const out = await procesarPagoNotificado(fakes({ entregar: vi.fn(async () => false) }), { recetaId: RECETA_ID, paymentId: '555' })
    expect(out).toBe('pagada_sin_entregar')
  })
  it('receta inexistente → corta', async () => {
    const out = await procesarPagoNotificado(fakes({ getReceta: vi.fn(async () => null) }), { recetaId: RECETA_ID, paymentId: '555' })
    expect(out).toBe('receta_inexistente')
  })
  it('receta ya entregada → idempotente, no vuelve a entregar', async () => {
    const deps = fakes({ getReceta: vi.fn(async () => ({ id: RECETA_ID, medico_id: MEDICO_ID, monto: 5000, estado: 'entregada' })) })
    const out = await procesarPagoNotificado(deps, { recetaId: RECETA_ID, paymentId: '555' })
    expect(out).toBe('ya_entregada')
    expect(deps.entregar).not.toHaveBeenCalled()
  })
  it('sin conexión MP → corta', async () => {
    const out = await procesarPagoNotificado(fakes({ getConexion: vi.fn(async () => null) }), { recetaId: RECETA_ID, paymentId: '555' })
    expect(out).toBe('sin_conexion_mp')
  })
  it('pago no encontrado en MP → corta (no confía en el body)', async () => {
    const out = await procesarPagoNotificado(fakes({ consultarPago: vi.fn(async () => null) }), { recetaId: RECETA_ID, paymentId: '555' })
    expect(out).toBe('pago_no_encontrado')
  })
  it('pago de otro cobrador → ignorado, sin marcar ni entregar', async () => {
    const deps = fakes({ getConexion: vi.fn(async () => ({ mpUserId: '999', accessToken: 'tok' })) })
    const out = await procesarPagoNotificado(deps, { recetaId: RECETA_ID, paymentId: '555' })
    expect(out).toContain('ignorado')
    expect(deps.marcarPagada).not.toHaveBeenCalled()
    expect(deps.entregar).not.toHaveBeenCalled()
  })
  it('refunded → marca devuelta (bloquea re-entrega) y avisa al médico', async () => {
    const deps = fakes({ consultarPago: vi.fn(async () => ({ ...pagoAprobado(), status: 'refunded' })) })
    const out = await procesarPagoNotificado(deps, { recetaId: RECETA_ID, paymentId: '555' })
    expect(out).toBe('devolucion')
    expect(deps.marcarDevuelta).toHaveBeenCalledWith(MEDICO_ID, RECETA_ID)
    expect(deps.avisarMedico).toHaveBeenCalled()
    expect(deps.entregar).not.toHaveBeenCalled()
  })
})

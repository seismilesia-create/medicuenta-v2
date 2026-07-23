import { describe, expect, it } from 'vitest'
import { decidirSyncCobro } from './sync'

describe('decidirSyncCobro (edición de orden)', () => {
  it('sin cobro y con monto → insertar', () => {
    expect(decidirSyncCobro({ montoOrden: 8000, cobro: null })).toEqual({ tipo: 'insertar' })
  })

  it('sin cobro y sin monto → nada', () => {
    expect(decidirSyncCobro({ montoOrden: 0, cobro: null }).tipo).toBe('nada')
  })

  it('cobro en mano con monto distinto → actualizar_monto', () => {
    const cobro = { monto: 5000, medio: 'efectivo', estado: 'cobrado' } as const
    expect(decidirSyncCobro({ montoOrden: 8000, cobro }).tipo).toBe('actualizar_monto')
  })

  it('cobro en mano con mismo monto → nada', () => {
    const cobro = { monto: 8000, medio: 'transferencia', estado: 'cobrado' } as const
    expect(decidirSyncCobro({ montoOrden: 8000, cobro }).tipo).toBe('nada')
  })

  it('monto en cero con cobro en mano → anular (el médico sacó el plus)', () => {
    const cobro = { monto: 5000, medio: 'efectivo', estado: 'cobrado' } as const
    expect(decidirSyncCobro({ montoOrden: 0, cobro }).tipo).toBe('anular')
  })

  it('cobro mercadopago NUNCA se toca desde la orden (ni monto ni anulación)', () => {
    const pendiente = { monto: 5000, medio: 'mercadopago', estado: 'pendiente' } as const
    const cobrado = { monto: 5000, medio: 'mercadopago', estado: 'cobrado' } as const
    expect(decidirSyncCobro({ montoOrden: 9999, cobro: pendiente }).tipo).toBe('nada')
    expect(decidirSyncCobro({ montoOrden: 0, cobro: cobrado }).tipo).toBe('nada')
  })

  it('monto en string numérico de la DB se compara como número', () => {
    const cobro = { monto: '8000.00' as unknown as number, medio: 'efectivo', estado: 'cobrado' } as const
    expect(decidirSyncCobro({ montoOrden: 8000, cobro }).tipo).toBe('nada')
  })
})

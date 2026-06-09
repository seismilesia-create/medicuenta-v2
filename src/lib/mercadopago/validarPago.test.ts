import { describe, it, expect } from 'vitest'
import { decidirAccionPago } from './validarPago'
import type { PagoMP } from './client'

const RECETA = { id: '123e4567-e89b-42d3-a456-426614174000', monto: 5000, estado: 'pendiente_pago' }
const MP_USER = '111222333'

function pago(over: Partial<PagoMP> = {}): PagoMP {
  return {
    id: '99887766',
    status: 'approved',
    externalReference: `receta:${RECETA.id}`,
    transactionAmount: 5000,
    collectorId: MP_USER,
    ...over,
  }
}

describe('decidirAccionPago', () => {
  it('aprobado + todo coincide + pendiente_pago → entregar', () => {
    expect(decidirAccionPago({ pago: pago(), receta: RECETA, mpUserId: MP_USER }))
      .toEqual({ accion: 'marcar_pagada_y_entregar' })
  })
  it('aprobado + receta ya pagada (entrega pendiente) → reintenta entrega', () => {
    expect(decidirAccionPago({ pago: pago(), receta: { ...RECETA, estado: 'pagada' }, mpUserId: MP_USER }))
      .toEqual({ accion: 'marcar_pagada_y_entregar' })
  })
  it('receta ya entregada → ignorar (idempotencia)', () => {
    const d = decidirAccionPago({ pago: pago(), receta: { ...RECETA, estado: 'entregada' }, mpUserId: MP_USER })
    expect(d.accion).toBe('ignorar')
  })
  it('external_reference ajena → ignorar (cross-tenant)', () => {
    const d = decidirAccionPago({ pago: pago({ externalReference: 'receta:00000000-0000-4000-8000-000000000000' }), receta: RECETA, mpUserId: MP_USER })
    expect(d.accion).toBe('ignorar')
  })
  it('cobrador distinto al médico → ignorar (cross-tenant)', () => {
    const d = decidirAccionPago({ pago: pago({ collectorId: '999' }), receta: RECETA, mpUserId: MP_USER })
    expect(d.accion).toBe('ignorar')
  })
  it('monto no coincide → ignorar', () => {
    const d = decidirAccionPago({ pago: pago({ transactionAmount: 1 }), receta: RECETA, mpUserId: MP_USER })
    expect(d.accion).toBe('ignorar')
  })
  it('monto null en receta → ignorar', () => {
    const d = decidirAccionPago({ pago: pago(), receta: { ...RECETA, monto: null }, mpUserId: MP_USER })
    expect(d.accion).toBe('ignorar')
  })
  it.each(['pending', 'in_process', 'rejected', 'cancelled'])('status %s → ignorar', (status) => {
    const d = decidirAccionPago({ pago: pago({ status }), receta: RECETA, mpUserId: MP_USER })
    expect(d.accion).toBe('ignorar')
  })
  it.each(['refunded', 'charged_back'])('status %s → avisar devolución al médico', (status) => {
    const d = decidirAccionPago({ pago: pago({ status }), receta: { ...RECETA, estado: 'entregada' }, mpUserId: MP_USER })
    expect(d.accion).toBe('avisar_devolucion')
  })
})

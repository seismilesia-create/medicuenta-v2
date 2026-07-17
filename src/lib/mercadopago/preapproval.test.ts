import { describe, it, expect } from 'vitest'
import {
  buildExternalReference,
  parseExternalReference,
  buildPreapprovalBody,
  normalizarStatusPreapproval,
  parsePreapproval,
  MONTO_MINIMO_ARS,
} from './preapproval'

const MEDICO = '3fa85f64-5717-4562-b3fc-2c963f66afa6'

describe('externalReference', () => {
  it('ida y vuelta', () => {
    expect(parseExternalReference(buildExternalReference(MEDICO))).toBe(MEDICO)
  })

  it('no confunde la referencia de una RECETA con la de una suscripcion', () => {
    // Ojo: `receta:<uuid>` es de la Pieza A (el médico le cobra al paciente). Si esto
    // las mezclara, un pago de receta podría activarle la suscripción a alguien.
    expect(parseExternalReference(`receta:${MEDICO}`)).toBeNull()
  })

  it('rechaza basura', () => {
    expect(parseExternalReference('suscripcion:no-es-uuid')).toBeNull()
    expect(parseExternalReference('suscripcion:')).toBeNull()
    expect(parseExternalReference('')).toBeNull()
  })
})

describe('buildPreapprovalBody', () => {
  const base = {
    medicoId: MEDICO,
    plan: 'full' as const,
    montoArs: 15000,
    payerEmail: 'medico@ejemplo.com',
    backUrl: 'https://medicuenta-v2.vercel.app/plan?sub=ok',
  }

  it('arma la suscripcion mensual en pesos', () => {
    expect(buildPreapprovalBody(base)).toEqual({
      reason: 'MediCuenta - Plan Full',
      external_reference: `suscripcion:${MEDICO}`,
      back_url: base.backUrl,
      payer_email: 'medico@ejemplo.com',
      status: 'pending',
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: 15000,
        currency_id: 'ARS',
      },
    })
  })

  it('status pending: es la unica rama que NO le pide la tarjeta a nuestro lado', () => {
    expect(buildPreapprovalBody(base).status).toBe('pending')
  })

  it('NO manda start_date ni end_date (MP ignora start_date sin end_date, y no vence sola)', () => {
    const body = buildPreapprovalBody(base) as Record<string, unknown>
    const auto = body.auto_recurring as Record<string, unknown>
    expect(auto).not.toHaveProperty('start_date')
    expect(auto).not.toHaveProperty('end_date')
  })

  it('el plan se ve en el nombre: el medico lo lee en el resumen de la tarjeta', () => {
    expect(buildPreapprovalBody({ ...base, plan: 'basico' }).reason).toBe('MediCuenta - Plan Basico')
  })
})

describe('normalizarStatusPreapproval', () => {
  it('acepta las dos ortografias de cancelado que usa MP', () => {
    // La reference dice `canceled` (1 L) y los SDK `cancelled` (2 L). Es una
    // contradiccion real de MP, no un typo nuestro.
    expect(normalizarStatusPreapproval('canceled')).toBe('cancelled')
    expect(normalizarStatusPreapproval('cancelled')).toBe('cancelled')
  })

  it('pasa los demas tal cual', () => {
    expect(normalizarStatusPreapproval('pending')).toBe('pending')
    expect(normalizarStatusPreapproval('authorized')).toBe('authorized')
    expect(normalizarStatusPreapproval('paused')).toBe('paused')
  })

  it('un valor desconocido da null, no rompe: el enum de MP es abierto', () => {
    expect(normalizarStatusPreapproval('waiting for gateway')).toBeNull()
    expect(normalizarStatusPreapproval(null)).toBeNull()
    expect(normalizarStatusPreapproval(undefined)).toBeNull()
    expect(normalizarStatusPreapproval(42)).toBeNull()
  })
})

describe('parsePreapproval', () => {
  it('mapea una respuesta real', () => {
    expect(
      parsePreapproval({
        id: '2c938084726fca480172750000000000',
        status: 'authorized',
        external_reference: `suscripcion:${MEDICO}`,
        next_payment_date: '2026-08-16T12:00:00.000-04:00',
        auto_recurring: { transaction_amount: 15000, currency_id: 'ARS' },
      }),
    ).toEqual({
      id: '2c938084726fca480172750000000000',
      status: 'authorized',
      externalReference: `suscripcion:${MEDICO}`,
      nextPaymentDate: '2026-08-16T12:00:00.000-04:00',
      transactionAmount: 15000,
    })
  })

  it('el monto llega como string en algunas respuestas de MP', () => {
    const r = parsePreapproval({ id: 'x', auto_recurring: { transaction_amount: '24.50' } })
    expect(r?.transactionAmount).toBe(24.5)
  })

  it('sin id no sirve para nada', () => {
    expect(parsePreapproval({ status: 'authorized' })).toBeNull()
    expect(parsePreapproval(null)).toBeNull()
    expect(parsePreapproval('texto')).toBeNull()
  })

  it('aguanta una respuesta pelada sin romper', () => {
    expect(parsePreapproval({ id: 'x' })).toEqual({
      id: 'x',
      status: null,
      externalReference: '',
      nextPaymentDate: null,
      transactionAmount: null,
    })
  })
})

describe('MONTO_MINIMO_ARS', () => {
  it('es 100: el minimo real de MP para cobrar con tarjeta en AR', () => {
    expect(MONTO_MINIMO_ARS).toBe(100)
  })
})

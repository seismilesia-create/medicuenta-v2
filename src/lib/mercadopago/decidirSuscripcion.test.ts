import { describe, it, expect } from 'vitest'
import { decidirPorPreapproval, decidirPorCuota } from './decidirSuscripcion'

describe('decidirPorPreapproval', () => {
  it('authorized activa la suscripcion y fija el proximo vencimiento', () => {
    expect(decidirPorPreapproval('authorized', '2026-08-16T12:00:00.000Z')).toEqual({
      accion: 'actualizar',
      estado: 'activa',
      currentPeriodEnd: '2026-08-16T12:00:00.000Z',
    })
  })

  it('pending NO activa nada', () => {
    // Si activara, alcanzaria con apretar "Contratar" y abandonar el checkout para
    // tener el sistema gratis.
    expect(decidirPorPreapproval('pending', null)).toMatchObject({ accion: 'ignorar' })
  })

  it('paused = morosa; cancelled = baja', () => {
    expect(decidirPorPreapproval('paused', null)).toMatchObject({ accion: 'actualizar', estado: 'morosa' })
    expect(decidirPorPreapproval('cancelled', null)).toMatchObject({ accion: 'actualizar', estado: 'baja' })
  })

  it('un status desconocido no toca el acceso de nadie', () => {
    expect(decidirPorPreapproval(null, null)).toMatchObject({ accion: 'ignorar' })
  })
})

describe('decidirPorCuota', () => {
  it('cobrada: activa y corre el periodo un mes desde el debito', () => {
    const r = decidirPorCuota({ status: 'processed', paymentStatus: 'approved', debitDate: '2026-07-16T00:00:00.000Z' })
    expect(r).toMatchObject({ accion: 'actualizar', estado: 'activa' })
    expect(r).toHaveProperty('currentPeriodEnd', '2026-08-16T00:00:00.000Z')
  })

  // ── La trampa cara de MP ──────────────────────────────────────────────────
  it('🔴 processed NO alcanza para dar acceso: tambien es el estado de "reintentos agotados"', () => {
    // Este es EL test de la fase. `processed` significa "cobrado O reintentos
    // agotados": es terminal para el exito Y para el fracaso. Si algun dia alguien
    // simplifica esto a `status === 'processed'`, le regala el sistema a todo el que
    // no pague y nadie se entera.
    expect(decidirPorCuota({ status: 'processed', paymentStatus: 'rejected', debitDate: '2026-07-16T00:00:00.000Z' }))
      .toEqual({ accion: 'actualizar', estado: 'suspendida' })
  })

  it('processed sin pago informado tampoco da acceso', () => {
    expect(decidirPorCuota({ status: 'processed', paymentStatus: null, debitDate: null }))
      .toMatchObject({ estado: 'suspendida' })
  })

  it('processed con un pago que no esta aprobado tampoco', () => {
    for (const s of ['pending', 'in_process', 'cancelled', 'refunded', 'charged_back']) {
      expect(decidirPorCuota({ status: 'processed', paymentStatus: s, debitDate: null }))
        .toMatchObject({ estado: 'suspendida' })
    }
  })

  it('recycling = morosa: MP sigue reintentando, entra igual con aviso', () => {
    expect(decidirPorCuota({ status: 'recycling', paymentStatus: 'rejected', debitDate: null }))
      .toMatchObject({ accion: 'actualizar', estado: 'morosa' })
  })

  it('scheduled no hace nada: todavia no se intento cobrar', () => {
    expect(decidirPorCuota({ status: 'scheduled', paymentStatus: null, debitDate: null }))
      .toMatchObject({ accion: 'ignorar' })
  })

  it('un status desconocido no toca el acceso (el enum de MP es abierto)', () => {
    // En payloads reales aparecio 'recurring', que no esta en la doc.
    expect(decidirPorCuota({ status: 'recurring', paymentStatus: 'approved', debitDate: null }))
      .toMatchObject({ accion: 'ignorar' })
    expect(decidirPorCuota({ status: '', paymentStatus: null, debitDate: null }))
      .toMatchObject({ accion: 'ignorar' })
  })

  it('sin debit_date no inventa un periodo', () => {
    const r = decidirPorCuota({ status: 'processed', paymentStatus: 'approved', debitDate: null })
    expect(r).toMatchObject({ estado: 'activa' })
    expect(r).toHaveProperty('currentPeriodEnd', null)
  })

  it('una fecha basura no rompe ni inventa', () => {
    const r = decidirPorCuota({ status: 'processed', paymentStatus: 'approved', debitDate: 'ayer' })
    expect(r).toHaveProperty('currentPeriodEnd', null)
  })

  it('cruce de fin de mes: 31 de enero + 1 mes no explota', () => {
    const r = decidirPorCuota({ status: 'processed', paymentStatus: 'approved', debitDate: '2026-01-31T00:00:00.000Z' })
    // JS desborda al 3 de marzo. No es ideal, pero es determinista y no pierde plata:
    // el proximo cobro real lo manda MP igual. Lo dejamos documentado.
    expect(typeof (r as { currentPeriodEnd?: string }).currentPeriodEnd).toBe('string')
  })
})

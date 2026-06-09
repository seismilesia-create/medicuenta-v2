import { describe, it, expect } from 'vitest'
import { buildExternalReference, parseExternalReference, buildPreferenciaBody } from './client'

const RECETA_ID = '123e4567-e89b-42d3-a456-426614174000'

describe('external_reference', () => {
  it('round-trip', () => {
    const ref = buildExternalReference(RECETA_ID)
    expect(ref).toBe(`receta:${RECETA_ID}`)
    expect(parseExternalReference(ref)).toBe(RECETA_ID)
  })
  it('rechaza referencias ajenas o malformadas', () => {
    expect(parseExternalReference('otra:cosa')).toBeNull()
    expect(parseExternalReference('receta:no-es-uuid')).toBeNull()
    expect(parseExternalReference('')).toBeNull()
  })
})

describe('buildPreferenciaBody', () => {
  it('arma la preferencia con expiración a 7 días, ARS y referencia', () => {
    const ahora = new Date('2026-06-10T12:00:00.000Z')
    const body = buildPreferenciaBody(
      {
        recetaId: RECETA_ID,
        titulo: 'Receta médica',
        monto: 5000,
        notificationUrl: 'https://tunel.example/api/mercadopago/webhook?receta=' + RECETA_ID,
        expiraEnDias: 7,
      },
      ahora,
    )
    expect(body.items[0]).toEqual({ title: 'Receta médica', quantity: 1, unit_price: 5000, currency_id: 'ARS' })
    expect(body.external_reference).toBe(`receta:${RECETA_ID}`)
    expect(body.notification_url).toContain('/api/mercadopago/webhook?receta=')
    expect(body.expires).toBe(true)
    expect(body.expiration_date_to).toBe('2026-06-17T12:00:00.000Z')
  })
})

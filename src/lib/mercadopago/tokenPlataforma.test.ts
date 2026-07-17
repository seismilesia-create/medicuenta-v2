import { describe, it, expect } from 'vitest'
import { parseRespuestaToken } from './tokenPlataforma'

const AHORA = Date.parse('2026-07-16T12:00:00.000Z')

describe('parseRespuestaToken', () => {
  it('mapea la respuesta real de client_credentials', () => {
    // MP devuelve expires_in: 21600 (6 h). Le restamos 10 min de margen para no usar
    // uno que se vence a mitad de camino.
    const r = parseRespuestaToken({ access_token: 'APP_USR-abc', expires_in: 21600 }, AHORA)
    expect(r?.token).toBe('APP_USR-abc')
    expect(r?.venceMs).toBe(AHORA + 21600_000 - 600_000)
  })

  it('sin access_token no sirve', () => {
    expect(parseRespuestaToken({ expires_in: 21600 }, AHORA)).toBeNull()
    expect(parseRespuestaToken({ access_token: '' }, AHORA)).toBeNull()
    expect(parseRespuestaToken(null, AHORA)).toBeNull()
    expect(parseRespuestaToken('texto', AHORA)).toBeNull()
  })

  it('sin expires_in asume un vencimiento CORTO, no uno largo', () => {
    // Pedirlo de mas cuesta un roundtrip; usar uno vencido hace rebotar un cobro.
    const r = parseRespuestaToken({ access_token: 'APP_USR-abc' }, AHORA)
    expect(r?.venceMs).toBe(AHORA + 300_000 - 600_000)
    // Queda vencido de entrada → siempre lo vuelve a pedir. Es lo que queremos.
    expect(r!.venceMs).toBeLessThan(AHORA)
  })

  it('un expires_in raro no alarga el vencimiento', () => {
    for (const malo of [0, -1, 'mucho', null]) {
      const r = parseRespuestaToken({ access_token: 'x', expires_in: malo }, AHORA)
      expect(r?.venceMs).toBe(AHORA + 300_000 - 600_000)
    }
  })
})

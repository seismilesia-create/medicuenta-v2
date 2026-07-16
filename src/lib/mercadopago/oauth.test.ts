import { describe, it, expect } from 'vitest'
import { buildAuthorizationUrl, parseTokenResponse } from './oauth'

const REDIRECT = 'https://medicuenta.example/api/mercadopago/oauth/callback'

describe('buildAuthorizationUrl', () => {
  it('arma la URL de autorización con los params que MP exige', () => {
    const url = new URL(buildAuthorizationUrl({ clientId: '123', redirectUri: REDIRECT, state: 'abc' }))
    expect(url.origin + url.pathname).toBe('https://auth.mercadopago.com.ar/authorization')
    expect(url.searchParams.get('client_id')).toBe('123')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('platform_id')).toBe('mp')
    expect(url.searchParams.get('state')).toBe('abc')
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT)
  })
})

describe('parseTokenResponse', () => {
  const ahora = new Date('2026-07-13T12:00:00.000Z')

  it('mapea la respuesta completa y calcula el vencimiento', () => {
    const t = parseTokenResponse(
      { access_token: 'APP_USR-x', refresh_token: 'TG-y', user_id: 987654321, expires_in: 15552000 },
      ahora,
    )
    expect(t).toEqual({
      accessToken: 'APP_USR-x',
      refreshToken: 'TG-y',
      mpUserId: '987654321', // number → string: es la clave de la validación cross-tenant
      expiresAt: new Date(ahora.getTime() + 15552000 * 1000).toISOString(),
    })
  })

  it('acepta que no venga refresh_token ni expires_in', () => {
    const t = parseTokenResponse({ access_token: 'APP_USR-x', user_id: '1' }, ahora)
    expect(t).toMatchObject({ accessToken: 'APP_USR-x', refreshToken: null, mpUserId: '1', expiresAt: null })
  })

  it('rechaza la respuesta sin access_token (no podríamos cobrar)', () => {
    expect(parseTokenResponse({ user_id: 1, expires_in: 100 }, ahora)).toBeNull()
  })

  it('rechaza la respuesta sin user_id (no sabríamos a quién le entra la plata)', () => {
    expect(parseTokenResponse({ access_token: 'APP_USR-x' }, ahora)).toBeNull()
  })

  it('rechaza basura', () => {
    expect(parseTokenResponse(null, ahora)).toBeNull()
    expect(parseTokenResponse('no soy un objeto', ahora)).toBeNull()
    expect(parseTokenResponse({ access_token: 123, user_id: 1 }, ahora)).toBeNull()
  })
})

/** OAuth de MercadoPago: el médico conecta SU cuenta y nos deja operar en su nombre.
 *  Nunca vemos su usuario ni su contraseña; recibimos un token que él puede revocar. */

const MP_AUTH_URL = 'https://auth.mercadopago.com.ar/authorization'
const MP_TOKEN_URL = 'https://api.mercadopago.com/oauth/token'

export function buildAuthorizationUrl(input: {
  clientId: string
  redirectUri: string
  state: string
}): string {
  const url = new URL(MP_AUTH_URL)
  url.searchParams.set('client_id', input.clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('platform_id', 'mp')
  url.searchParams.set('state', input.state)
  url.searchParams.set('redirect_uri', input.redirectUri)
  return url.toString()
}

export interface TokenMP {
  accessToken: string
  refreshToken: string | null
  /** Cuenta MP que cobra (el "collector"). Es contra este id que se valida cada pago. */
  mpUserId: string
  expiresAt: string | null
}

/** Mapea la respuesta de oauth/token. Devuelve null si no trae lo mínimo indispensable:
 *  sin access_token no podemos cobrar, y sin user_id no podemos validar a quién le entra la plata. */
export function parseTokenResponse(json: unknown, ahora: Date): TokenMP | null {
  if (!json || typeof json !== 'object') return null
  const o = json as Record<string, unknown>

  const accessToken = typeof o.access_token === 'string' ? o.access_token : ''
  if (!accessToken) return null

  // MP manda user_id como número; no asumimos el tipo.
  const raw = o.user_id
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  const mpUserId = String(raw)
  if (!mpUserId) return null

  const expiresIn = typeof o.expires_in === 'number' ? o.expires_in : null

  return {
    accessToken,
    refreshToken: typeof o.refresh_token === 'string' ? o.refresh_token : null,
    mpUserId,
    expiresAt: expiresIn ? new Date(ahora.getTime() + expiresIn * 1000).toISOString() : null,
  }
}

/** Canjea el `code` del callback por el token del médico.
 *  El `redirect_uri` debe ser IDÉNTICO al usado al autorizar: MP lo compara. */
export async function intercambiarCode(
  input: { clientId: string; clientSecret: string; code: string; redirectUri: string },
  ahora: Date = new Date(),
): Promise<TokenMP | null> {
  let res: Response
  try {
    res = await fetch(MP_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: input.clientId,
        client_secret: input.clientSecret,
        grant_type: 'authorization_code',
        code: input.code,
        redirect_uri: input.redirectUri,
      }),
    })
  } catch (e) {
    console.error('[mp] oauth/token: fallo de red', e)
    return null
  }

  // Solo el status: el body puede traer el token (o el code) y no debe terminar en los logs.
  if (!res.ok) {
    console.error('[mp] oauth/token rechazado:', res.status)
    return null
  }

  try {
    return parseTokenResponse(await res.json(), ahora)
  } catch {
    console.error('[mp] oauth/token: respuesta no es JSON')
    return null
  }
}

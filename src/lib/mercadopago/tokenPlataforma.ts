/**
 * El access token de la cuenta de MercadoPago de MediCuenta — el que cobra las
 * suscripciones (Pieza B). NO confundir con el token del médico (`mp_conexiones`,
 * cifrado), que es el que cobra las recetas y va a la cuenta de él.
 *
 * No es una variable de entorno: se DERIVA de `MP_CLIENT_ID`/`MP_CLIENT_SECRET` — las
 * mismas de la app que ya está cargada en producción — pidiéndole a MP un token por
 * `client_credentials`. Verificado: MP devuelve un `APP_USR-…` de la cuenta dueña de la
 * app, con el scope `subs-recurring:pre-approval/read-write` que necesita el preapproval.
 *
 * Por qué derivarlo y no guardarlo: **vence a las 6 horas**. Como env var fija se
 * vencería sola y el cobro dejaría de andar sin que nadie se entere.
 */
const MP_TOKEN_URL = 'https://api.mercadopago.com/oauth/token'

/** Se renueva unos minutos antes de vencer, para no usar uno que expira en el camino. */
const MARGEN_MS = 10 * 60 * 1000

interface TokenCacheado {
  token: string
  venceMs: number
}

/** Cache por instancia. En serverless dura lo que dure el lambda; con eso alcanza. */
let cache: TokenCacheado | null = null

/** Solo para los tests: no hay forma de limpiar un módulo entre casos. */
export function _resetCacheToken(): void {
  cache = null
}

export interface RespuestaToken {
  token: string
  venceMs: number
}

/**
 * Mapea la respuesta de `client_credentials`. Puro y testeable.
 * Sin `access_token` no hay nada que hacer. Sin `expires_in` asumimos un vencimiento
 * corto: es preferible pedirlo de más que usar uno vencido y que rebote el cobro.
 */
export function parseRespuestaToken(json: unknown, ahoraMs: number): RespuestaToken | null {
  if (!json || typeof json !== 'object') return null
  const o = json as Record<string, unknown>
  const token = typeof o.access_token === 'string' ? o.access_token : ''
  if (!token) return null

  const expiresIn = typeof o.expires_in === 'number' && o.expires_in > 0 ? o.expires_in : 300
  return { token, venceMs: ahoraMs + expiresIn * 1000 - MARGEN_MS }
}

/**
 * Devuelve el token, del caché o pidiéndolo. Null si no se puede: los llamadores
 * cortan y avisan en vez de intentar cobrar sin credencial.
 */
export async function tokenPlataforma(): Promise<string | null> {
  // Escape hatch para probar contra OTRA cuenta vendedora sin tocar MP_CLIENT_ID/SECRET,
  // que romperían el OAuth de las recetas (Pieza A) en ese mismo entorno.
  const fijo = process.env.MP_PLATAFORMA_ACCESS_TOKEN?.trim()
  if (fijo) return fijo

  if (cache && Date.now() < cache.venceMs) return cache.token

  const clientId = process.env.MP_CLIENT_ID?.trim()
  const clientSecret = process.env.MP_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) {
    console.error('[mp/sub] faltan MP_CLIENT_ID / MP_CLIENT_SECRET: no se puede cobrar')
    return null
  }

  let res: Response
  try {
    res = await fetch(MP_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
      }),
    })
  } catch (e) {
    console.error('[mp/sub] token de plataforma: fallo de red', e)
    return null
  }

  // Solo el status: el body trae el token y no debe terminar en los logs.
  if (!res.ok) {
    console.error('[mp/sub] token de plataforma rechazado:', res.status)
    return null
  }

  let parsed: RespuestaToken | null = null
  try {
    parsed = parseRespuestaToken(await res.json(), Date.now())
  } catch {
    console.error('[mp/sub] token de plataforma: respuesta no es JSON')
    return null
  }
  if (!parsed) return null

  cache = parsed
  return parsed.token
}

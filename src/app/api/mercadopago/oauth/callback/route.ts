import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { siteUrl } from '@/lib/site-url'
import { cifrar } from '@/lib/crypto/encryption'
import { intercambiarCode } from '@/lib/mercadopago/oauth'

export const runtime = 'nodejs'

const CONFIG = '/consultorio/config'

/** Vuelta de MercadoPago. Valida sesión + state, canjea el code y guarda el token CIFRADO.
 *  Escribe con el cliente de sesión a propósito: la RLS de mp_conexiones (auth.uid() = medico_id)
 *  es la que impide que nadie ate una cuenta MP al médico equivocado. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  // siteUrl() y no el origin del request: acá llega MercadoPago a través del túnel/proxy,
  // donde el origin es el host interno y el redirect de vuelta quedaría roto.
  const origin = siteUrl()

  const volverA = (query: string) => {
    const res = NextResponse.redirect(`${origin}${CONFIG}${query}`)
    res.cookies.delete('mp_oauth_state') // el state es de un solo uso, pase lo que pase
    return res
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${origin}/login`)

  // El médico canceló en la pantalla de MercadoPago.
  if (searchParams.get('error')) return volverA('?mp=error&motivo=denegado')

  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const esperado = request.headers
    .get('cookie')
    ?.split('; ')
    .find((c) => c.startsWith('mp_oauth_state='))
    ?.slice('mp_oauth_state='.length)

  // Sin state válido no se guarda NADA: es lo que impide que alguien ate su cuenta MP a otra sesión.
  if (!code || !state || !esperado || state !== esperado) {
    console.error('[mp] callback rechazado: state inválido o code ausente')
    return volverA('?mp=error&motivo=state')
  }

  const clientId = process.env.MP_CLIENT_ID
  const clientSecret = process.env.MP_CLIENT_SECRET
  const redirectUri = process.env.MP_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    console.error('[mp] OAuth sin configurar: falta MP_CLIENT_ID / MP_CLIENT_SECRET / MP_REDIRECT_URI')
    return volverA('?mp=error&motivo=config')
  }

  const token = await intercambiarCode({ clientId, clientSecret, code, redirectUri })
  if (!token) return volverA('?mp=error&motivo=canje')

  const { error } = await supabase.from('mp_conexiones').upsert(
    {
      medico_id: user.id,
      mp_user_id: token.mpUserId,
      access_token_cifrado: cifrar(token.accessToken),
      refresh_token_cifrado: token.refreshToken ? cifrar(token.refreshToken) : null,
      expires_at: token.expiresAt,
      estado: 'conectado', // reconectar → conectado: el cobro se reanuda solo
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'medico_id' },
  )
  if (error) {
    console.error('[mp] no pude guardar la conexión:', error.message)
    return volverA('?mp=error&motivo=guardado')
  }

  return volverA('?mp=ok')
}

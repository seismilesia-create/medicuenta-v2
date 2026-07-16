import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { siteUrl } from '@/lib/site-url'
import { buildAuthorizationUrl } from '@/lib/mercadopago/oauth'

export const runtime = 'nodejs'

const CONFIG = '/consultorio/config'

/** Inicia el OAuth: manda al médico a MercadoPago a autorizar a MediCuenta.
 *  Sirve tanto para conectar por primera vez como para reconectar (el callback pisa la fila). */
export async function GET() {
  // siteUrl() y no el origin del request: detrás del túnel/proxy el origin es el host
  // interno (https://localhost:3000) y el redirect quedaría roto.
  const origin = siteUrl()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${origin}/login`)

  const clientId = process.env.MP_CLIENT_ID
  const redirectUri = process.env.MP_REDIRECT_URI
  // Falta configuración: es un problema nuestro, no del médico → no le mostramos un 500.
  if (!clientId || !redirectUri) {
    console.error('[mp] OAuth sin configurar: falta MP_CLIENT_ID o MP_REDIRECT_URI')
    return NextResponse.redirect(`${origin}${CONFIG}?mp=error&motivo=config`)
  }

  // Anti-CSRF: el callback solo acepta el state que salió de acá (cookie HttpOnly, 10 min).
  const state = randomBytes(16).toString('hex')
  const res = NextResponse.redirect(buildAuthorizationUrl({ clientId, redirectUri, state }))
  res.cookies.set('mp_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax', // 'lax' y no 'strict': la cookie tiene que viajar en la vuelta desde MP.
    path: '/',
    maxAge: 600,
  })
  return res
}

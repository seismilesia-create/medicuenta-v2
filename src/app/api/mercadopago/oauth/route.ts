import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { resolverConsultorio, esDueño } from '@/features/consultorio/access/contexto'
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

  // Solo el DUEÑO conecta su cuenta de cobro — mismo guard que desconectarMercadoPago().
  // Con sesión sola no alcanza: la secretaria también tiene una y entra a /consultorio/config;
  // si llegara acá, ataría una conexión MP a SU id (fila basura, y la UI le mentiría).
  const r = await resolverConsultorio()
  if (!r) return NextResponse.redirect(`${origin}/login`)
  if (!esDueño(r.ctx)) return NextResponse.redirect(`${origin}${CONFIG}?mp=error&motivo=no_dueno`)

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

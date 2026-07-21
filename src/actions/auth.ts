'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { type EmailOtpType } from '@supabase/supabase-js'
import { siteUrl } from '@/lib/site-url'
import { traducirErrorAuth } from '@/lib/auth/errores'

/** Loguea el error crudo de GoTrue (trazabilidad) y devuelve el mensaje en español. */
function errorAuth(contexto: string, mensaje: string): { error: string } {
  console.error(`[auth] ${contexto}:`, mensaje)
  return { error: traducirErrorAuth(mensaje) }
}

/**
 * Sanitiza el `next` del login: solo aceptamos rutas internas absolutas (`/algo`),
 * nunca URLs externas ni protocol-relative (`//host`) — si no, es un open redirect.
 * Sin `next` válido, `/` deja que HomePage decida (superadmin→/admin, médico→/dashboard).
 */
function destinoSeguro(next: unknown): string {
  if (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')) {
    return next
  }
  return '/'
}

export async function login(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return errorAuth('login', error.message)
  }

  // Volvemos a donde el usuario quería ir (ej: el PWA abre en `/asistente` y, si la
  // sesión venció, rebota acá con `?next=/asistente`). Sin `next`, va a `/`.
  redirect(destinoSeguro(formData.get('next')))
}

export async function signup(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const fullName = formData.get('fullName') as string

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  })

  if (error) {
    return errorAuth('signup', error.message)
  }

  redirect('/check-email')
}

export async function resetPassword(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string

  // Mismo patrón que el invite (admin-medicos): el link REAL del mail lo arma la
  // plantilla de Supabase apuntando a /activar (POST, inmune al prefetch de Gmail).
  // Este redirectTo solo tiene que ser una URL pública válida y consistente con el
  // invite — antes usaba NEXT_PUBLIC_SITE_URL, que NO está seteada → caía a localhost.
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/api/auth/callback?next=/update-password`,
  })

  if (error) {
    return errorAuth('resetPassword', error.message)
  }

  return { success: true }
}

export async function updatePassword(formData: FormData) {
  const supabase = await createClient()

  const password = formData.get('password') as string

  const { error } = await supabase.auth.updateUser({
    password,
  })

  if (error) {
    return errorAuth('updatePassword', error.message)
  }

  redirect('/login')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function activarCuenta(formData: FormData) {
  const tokenHash = String(formData.get('token_hash') ?? '')
  const type = String(formData.get('type') ?? '') as EmailOtpType
  const next = String(formData.get('next') ?? '/update-password')

  if (!tokenHash || !type) {
    redirect('/login?error=enlace_invalido')
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
  if (error) {
    redirect('/login?error=enlace_expirado')
  }
  redirect(next)
}

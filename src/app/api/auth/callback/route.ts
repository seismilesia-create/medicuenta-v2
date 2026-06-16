// src/app/api/auth/callback/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Aterrizaje de los links de Supabase (invitación de médico, recovery de contraseña).
// Intercambia el ?code= por sesión (deja la cookie) y redirige a ?next (default /update-password).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/update-password'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Sin code o exchange fallido → a login con flag de error.
  return NextResponse.redirect(`${origin}/login?error=enlace_invalido`)
}

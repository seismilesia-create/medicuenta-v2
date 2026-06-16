// src/app/api/auth/callback/route.ts
import { type EmailOtpType } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Aterrizaje de los links de Supabase Auth. Deja la cookie de sesión y redirige a ?next.
// - Links de email (invitación, recovery, confirmación de signup, magic link): llegan con
//   ?token_hash=&type= → se verifican con verifyOtp.
// - OAuth / PKCE: llegan con ?code= → exchangeCodeForSession (fallback).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/update-password'

  const supabase = await createClient()

  // Flujo de los links de email (invite / recovery / signup / magiclink).
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Flujo OAuth / PKCE (code).
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Sin parámetros válidos o verificación fallida → a login con flag de error.
  return NextResponse.redirect(`${origin}/login?error=enlace_invalido`)
}

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

type CookieToSet = {
  name: string
  value: string
  options: CookieOptions
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Rutas protegidas (todas las del area main)
  const protectedPaths = ['/dashboard', '/ordenes', '/liquidaciones', '/debitos', '/perfil', '/nomenclador', '/cirugias']
  const isProtectedRoute = protectedPaths.some(path => pathname.startsWith(path))
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/signup')

  if (isProtectedRoute && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Guard de rol (3B, tercera capa — la seguridad real es el RLS delegado). La secretaria no
  // existe para la facturación, el nomenclador, la config del consultorio ni el asistente IA:
  // si tipea una de esas rutas a mano, la mandamos a la agenda. El home (asistente) también.
  // El rol se lee del claim del JWT (app_metadata) — cero query a la DB por request.
  const esSecretaria = (user?.app_metadata as { rol?: string } | undefined)?.rol === 'secretaria'
  if (esSecretaria) {
    const soloMedico = [
      '/dashboard', '/ordenes', '/liquidaciones', '/debitos', '/cirugias',
      '/nomenclador', '/reportes', '/consultorio/config', '/asistente',
    ]
    const esRutaSoloMedico = pathname === '/' || soloMedico.some((p) => pathname.startsWith(p))
    if (esRutaSoloMedico) {
      return NextResponse.redirect(new URL('/agenda', request.url))
    }
  }

  return supabaseResponse
}

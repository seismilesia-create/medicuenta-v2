import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { resolverAcceso, normalizarEstado, normalizarPlan, puedeAcceder } from '@/lib/admin/planes'

// Throttle del bump de last_active_at: como máximo una escritura cada ~20 h por médico.
const LAST_ACTIVE_THROTTLE_MS = 20 * 60 * 60 * 1000

type CookieToSet = {
  name: string
  value: string
  options: CookieOptions
}

/**
 * El área privada del médico. Acá aplica el candado de suscripción (spec F4.3 §5).
 * Va en el middleware y no en las páginas porque es el ÚNICO punto que corre en cada
 * request: de las 26 páginas de (main), solo 4 pasan por `resolverConsultorio()`, y un
 * layout no se re-ejecuta en la navegación del cliente.
 */
const RUTAS_APP = [
  '/dashboard', '/ordenes', '/liquidaciones', '/debitos', '/cirugias', '/nomenclador',
  '/reportes', '/cierre', '/perfil', '/asistente', '/agenda', '/conversaciones', '/pacientes', '/consultorio',
]

function esRutaApp(pathname: string): boolean {
  // '/' es el home = asistente. `/plan` queda AFUERA a propósito: es la salida del bloqueo.
  return pathname === '/' || RUTAS_APP.some((p) => pathname === p || pathname.startsWith(p + '/'))
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
  const protectedPaths = ['/dashboard', '/ordenes', '/liquidaciones', '/debitos', '/perfil', '/nomenclador', '/cirugias', '/plan']
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
      '/nomenclador', '/reportes', '/cierre', '/consultorio/config', '/asistente',
    ]
    const esRutaSoloMedico = pathname === '/' || soloMedico.some((p) => pathname.startsWith(p))
    if (esRutaSoloMedico) {
      return NextResponse.redirect(new URL('/agenda', request.url))
    }
  }

  // Candado de SUSCRIPCIÓN (spec F4.3 §5). El plan dice qué ve; el estado dice si entra.
  // Solo aplica al médico: la secretaria no tiene suscripción propia, y sus rutas (que son
  // todas Full) ya resuelven el plan/estado del médico activo en `resolverConsultorio()`.
  //
  // A diferencia del rol, esto NO sale del claim del JWT: cuesta un query por request, pero
  // el claim quedaría viejo hasta el refresh del token y eso cae para el lado malo — el
  // médico paga y sigue bloqueado. Ver la nota de optimización en el spec (§5, D2).
  if (user && !esSecretaria && esRutaApp(pathname)) {
    const { data: sub } = await supabase
      .from('suscripciones')
      .select('plan, estado, trial_ends_at, last_active_at')
      .eq('medico_id', user.id)
      .maybeSingle<{ plan: string | null; estado: string | null; trial_ends_at: string | null; last_active_at: string | null }>()

    // Señal "última vez activo" para el push de la prueba (ver features/notifications/
    // services/trial-push). Este bloque ya corre en cada request de app del médico, así
    // que reusamos la lectura y solo escribimos si está vieja (throttle ~20 h). El UPDATE
    // va con service-role porque la tabla es SELECT-only por RLS. Best-effort: si falla, no
    // rompe el request (es telemetría para decidir a quién notificar, no gate de acceso).
    if (
      sub &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      (!sub.last_active_at || Date.now() - new Date(sub.last_active_at).getTime() > LAST_ACTIVE_THROTTLE_MS)
    ) {
      try {
        const admin = createSupabaseAdmin(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY,
          { auth: { autoRefreshToken: false, persistSession: false } },
        )
        await admin
          .from('suscripciones')
          .update({ last_active_at: new Date().toISOString() })
          .eq('medico_id', user.id)
      } catch {
        // best-effort
      }
    }

    // Sin fila = médico anterior a F4.3 → pasa. La fase 2 hace el backfill (ver resolverAcceso).
    const acceso = resolverAcceso(
      sub ? { estado: normalizarEstado(sub.estado), trialEndsAt: sub.trial_ends_at } : null,
      Date.now(),
    )
    if (acceso.acceso === 'bloqueado') {
      return NextResponse.redirect(new URL('/plan', request.url))
    }

    // Candado por plan, cuarta capa. Las páginas Full ya lo chequean una por una; acá
    // cubrimos también sus subrutas y cualquier página nueva que se olviden de guardar.
    if (sub && !puedeAcceder(normalizarPlan(sub.plan), pathname)) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return supabaseResponse
}

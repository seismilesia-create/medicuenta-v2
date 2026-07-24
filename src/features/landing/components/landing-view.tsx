import Link from 'next/link'
import { Logo } from '@/shared/components/logo'
import { Beneficios } from './beneficios'
import { ComoFunciona } from './como-funciona'
import { BotonSolicitarAcceso, IconoWhatsApp } from './cta-whatsapp'
import { Demo } from './demo'
import { Faq } from './faq'
import { Hero } from './hero'
import { WA_SOLICITAR_ACCESO } from '../constants'

/**
 * Landing pública de MediCuenta (ruta `/` para visitantes sin sesión).
 * Conversión única: "Solicitar acceso" → WhatsApp (acceso curado por invitación).
 * Los links de Términos/Privacidad se suman cuando existan esos documentos.
 */
export function LandingView() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Si no hay JS, las secciones con reveal quedan visibles */}
      <noscript>
        <style>{`[data-reveal]{opacity:1 !important;transform:none !important}`}</style>
      </noscript>

      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <nav
          aria-label="Principal"
          className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-5 sm:px-8"
        >
          <Link
            href="/"
            className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="MediCuenta — inicio"
          >
            <Logo markClassName="h-8 w-8" wordmarkClassName="text-lg" />
          </Link>

          <div className="flex items-center gap-2 sm:gap-4">
            <span className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground md:inline-flex">
              <span aria-hidden="true">🇦🇷</span> Hecho en Catamarca
            </span>
            {/* En celular no entran las tres cosas en la barra (el CTA quedaba cortado):
                se prioriza el botón de conversión. "Iniciar sesión" sigue en el pie. */}
            <Link
              href="/login"
              className="hidden whitespace-nowrap rounded-lg px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-block"
            >
              Iniciar sesión
            </Link>
            <BotonSolicitarAcceso compacto />
          </div>
        </nav>
      </header>

      <main>
        <Hero />
        <ComoFunciona />
        <Demo />
        <Beneficios />
        <Faq />
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/40">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-5 py-10 text-center sm:flex-row sm:justify-between sm:text-left sm:px-8">
          <div>
            <Logo markClassName="h-7 w-7" wordmarkClassName="text-base" />
            <p className="mt-2 max-w-xs text-xs leading-relaxed text-muted-foreground">
              Facturación a obras sociales, agenda y asistente de WhatsApp para médicos de Catamarca.
            </p>
          </div>
          <div className="flex flex-col items-center gap-2 text-sm sm:items-end">
            <a
              href={WA_SOLICITAR_ACCESO}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-medium text-primary transition-colors hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
            >
              <IconoWhatsApp className="h-4 w-4" />
              Escribinos por WhatsApp
            </a>
            <Link
              href="/login"
              className="text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
            >
              Iniciar sesión
            </Link>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-muted-foreground">
              <Link
                href="/terminos"
                className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
              >
                Términos
              </Link>
              <Link
                href="/privacidad"
                className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
              >
                Privacidad
              </Link>
            </div>
          </div>
        </div>
        <div className="border-t border-border/60">
          <p className="mx-auto max-w-6xl px-5 py-4 text-center text-xs text-muted-foreground sm:px-8">
            © {new Date().getFullYear()} MediCuenta · Hecho en Catamarca 🇦🇷
          </p>
        </div>
      </footer>
    </div>
  )
}

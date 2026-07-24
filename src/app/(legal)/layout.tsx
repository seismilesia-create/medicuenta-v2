import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Logo } from '@/shared/components/logo'

/**
 * Marco de las páginas legales públicas (/terminos, /privacidad). Mismo aire que la
 * landing pero sin CTA: acá el visitante viene a leer, no a convertir.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <nav
          aria-label="Principal"
          className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-5 sm:px-8"
        >
          <Link
            href="/"
            className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="MediCuenta — inicio"
          >
            <Logo markClassName="h-8 w-8" wordmarkClassName="text-lg" />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Volver al inicio
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">{children}</main>

      <footer className="border-t border-border bg-muted/40">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 px-5 py-8 text-center text-xs text-muted-foreground sm:px-8">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <Link href="/terminos" className="transition-colors hover:text-foreground">
              Términos y condiciones
            </Link>
            <Link href="/privacidad" className="transition-colors hover:text-foreground">
              Política de privacidad
            </Link>
          </div>
          <p>© {new Date().getFullYear()} MediCuenta · Hecho en Catamarca 🇦🇷</p>
        </div>
      </footer>
    </div>
  )
}

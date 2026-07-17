import Link from 'next/link'
import { Logo } from '@/shared/components/logo'

export default function CheckEmailPage() {
  return (
    <div className="space-y-8 text-center">
      {/* Logo móvil */}
      <div className="lg:hidden flex justify-center mb-8">
        <Logo />
      </div>

      <div className="mx-auto w-20 h-20 rounded-full bg-success-50 flex items-center justify-center">
        <svg className="w-10 h-10 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>

      <div>
        <h1 className="text-display-xs text-foreground">Revisa tu correo</h1>
        <p className="mt-3 text-foreground-secondary leading-relaxed">
          Te hemos enviado un enlace de confirmación a tu correo electrónico.
          Haz clic en el enlace para activar tu cuenta.
        </p>
      </div>

      <div className="bg-surface border border-border rounded-xl p-6">
        <p className="text-sm text-foreground-secondary">
          ¿No recibiste el correo? Revisa tu carpeta de spam o{' '}
          <button className="font-medium text-accent-500 hover:text-accent-600 hover:underline">
            solicita uno nuevo
          </button>
        </p>
      </div>

      <Link
        href="/login"
        className="inline-flex items-center gap-2 text-sm font-medium text-foreground-secondary hover:text-foreground"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Volver al inicio de sesión
      </Link>
    </div>
  )
}

import Link from 'next/link'
import { SignupForm } from '@/features/auth/components'

export default function SignupPage() {
  return (
    <div className="space-y-8">
      {/* Logo móvil */}
      <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl gradient-medical flex items-center justify-center">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12h2m14 0h2M12 3v2m0 14v2" />
          </svg>
        </div>
        <span className="text-xl font-bold text-primary-500">MediCuenta</span>
      </div>

      <div className="text-center lg:text-left">
        <h1 className="text-display-xs text-foreground">Crea tu cuenta</h1>
        <p className="mt-2 text-foreground-secondary">Comienza a controlar tu facturacion medica</p>
      </div>

      <SignupForm />

      <p className="text-center text-sm text-foreground-secondary">
        ¿Ya tienes una cuenta?{' '}
        <Link href="/login" className="font-medium text-accent-500 hover:text-accent-600 hover:underline">
          Inicia sesión
        </Link>
      </p>

      <p className="text-center text-xs text-foreground-muted">
        Al registrarte, aceptas nuestros{' '}
        <Link href="/terms" className="underline hover:text-foreground-secondary">
          Términos de Servicio
        </Link>{' '}
        y{' '}
        <Link href="/privacy" className="underline hover:text-foreground-secondary">
          Política de Privacidad
        </Link>
      </p>
    </div>
  )
}

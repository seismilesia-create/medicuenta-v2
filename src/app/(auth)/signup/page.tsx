import Link from 'next/link'
import { Logo } from '@/shared/components/logo'
import { SignupForm } from '@/features/auth/components'

export default function SignupPage() {
  return (
    <div className="space-y-8">
      {/* Logo móvil */}
      <div className="lg:hidden flex justify-center mb-8">
        <Logo />
      </div>

      <div className="text-center lg:text-left">
        <h1 className="text-display-xs text-foreground">Crea tu cuenta</h1>
        <p className="mt-2 text-foreground-secondary">Comienza a controlar tu facturación médica</p>
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

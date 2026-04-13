import Link from 'next/link'
import { ForgotPasswordForm } from '@/features/auth/components'

export default function ForgotPasswordPage() {
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
        <h1 className="text-display-xs text-foreground">Recupera tu contraseña</h1>
        <p className="mt-2 text-foreground-secondary">Ingresa tu correo y te enviaremos un enlace para restablecerla</p>
      </div>

      <ForgotPasswordForm />

      <Link
        href="/login"
        className="flex items-center justify-center gap-2 text-sm font-medium text-foreground-secondary hover:text-foreground"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Volver al inicio de sesión
      </Link>
    </div>
  )
}

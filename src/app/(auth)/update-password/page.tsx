import { UpdatePasswordForm } from '@/features/auth/components'

export default function UpdatePasswordPage() {
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
        <div className="mx-auto lg:mx-0 w-14 h-14 rounded-full bg-accent-50 flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-accent-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
        <h1 className="text-display-xs text-foreground">Establece tu nueva contraseña</h1>
        <p className="mt-2 text-foreground-secondary">Elige una contraseña segura que no hayas usado antes</p>
      </div>

      <UpdatePasswordForm />
    </div>
  )
}

import Link from 'next/link'
import { Logo } from '@/shared/components/logo'
import { LoginForm } from '@/features/auth/components'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  return (
    <div className="space-y-8">
      {/* Logo móvil */}
      <div className="lg:hidden flex justify-center mb-8">
        <Logo />
      </div>

      <div className="text-center lg:text-left">
        <h1 className="text-display-xs text-foreground">Bienvenido de vuelta</h1>
        <p className="mt-2 text-foreground-secondary">Inicia sesión en tu cuenta para continuar</p>
      </div>

      <LoginForm next={next} />

      <p className="text-center text-sm text-foreground-secondary">
        ¿No tienes una cuenta?{' '}
        <Link href="/signup" className="font-medium text-accent-500 hover:text-accent-600 hover:underline">
          Regístrate
        </Link>
      </p>
    </div>
  )
}

import { activarCuenta } from '@/actions/auth'

export const metadata = { title: 'Activar cuenta | MediCuenta' }

export default async function ActivarPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>
}) {
  const sp = await searchParams
  const tokenHash = sp.token_hash ?? ''
  const type = sp.type ?? ''
  const next = sp.next ?? '/update-password'
  const esRecovery = type === 'recovery'

  if (!tokenHash || !type) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-sm text-center space-y-3">
          <h1 className="text-xl font-semibold text-foreground">Enlace inválido</h1>
          <p className="text-sm text-muted-foreground">
            Este enlace no es válido o ya se usó. Pedí uno nuevo desde el inicio de sesión.
          </p>
          <a href="/login" className="text-primary underline text-sm">
            Ir al inicio de sesión
          </a>
        </div>
      </main>
    )
  }

  const titulo = esRecovery ? 'Restablecé tu contraseña' : 'Activá tu cuenta'
  const texto = esRecovery
    ? 'Tocá el botón para elegir una nueva contraseña.'
    : 'Tocá el botón para activar tu cuenta en MediCuenta y elegir tu contraseña.'
  const cta = esRecovery ? 'Cambiar mi contraseña' : 'Activar mi cuenta'

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-sm w-full text-center space-y-5 rounded-2xl border border-border p-8">
        <h1 className="text-2xl font-bold text-foreground">{titulo}</h1>
        <p className="text-sm text-muted-foreground">{texto}</p>
        <form action={activarCuenta}>
          <input type="hidden" name="token_hash" value={tokenHash} />
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="next" value={next} />
          <button
            type="submit"
            className="w-full rounded-xl bg-primary text-primary-foreground px-4 py-3 font-medium hover:bg-primary/90 transition-colors"
          >
            {cta}
          </button>
        </form>
      </div>
    </main>
  )
}

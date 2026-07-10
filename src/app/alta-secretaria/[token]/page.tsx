import { createServiceClient } from '@/lib/supabase/server'
import { invitacionVigente } from '@/features/onboarding/token'
import { FormAltaSecretaria } from '@/features/onboarding/components/FormAltaSecretaria'

export const metadata = { title: 'Alta de secretaria | MediCuenta' }

function LinkInvalido() {
  return (
    <div className="mx-auto max-w-md p-8 text-center space-y-3">
      <h1 className="text-lg font-semibold">Enlace no válido</h1>
      <p className="text-sm text-muted-foreground">
        Este enlace ya no sirve o expiró. Pedile uno nuevo a tu médico.
      </p>
    </div>
  )
}

export default async function AltaSecretariaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const service = createServiceClient()
  const { data: inv } = await service
    .from('equipo_consultorio')
    .select('estado, secretaria_email, invited_at')
    .eq('token', token)
    .maybeSingle()

  const expiraEn = inv
    ? new Date(new Date(inv.invited_at as string).getTime() + 72 * 60 * 60 * 1000).toISOString()
    : null

  if (!inv || !expiraEn || !invitacionVigente(inv.estado as string, expiraEn, new Date())) {
    return <LinkInvalido />
  }

  return (
    <div className="mx-auto max-w-md p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Creá tu cuenta de secretaria</h1>
        <p className="text-sm text-muted-foreground">Completá tus datos y definí tu contraseña.</p>
      </div>
      <FormAltaSecretaria token={token} email={inv.secretaria_email as string} />
    </div>
  )
}

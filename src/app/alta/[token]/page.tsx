import { createServiceClient } from '@/lib/supabase/server'
import { invitacionVigente } from '@/features/onboarding/token'
import { FormAltaMedico } from '@/features/onboarding/components/FormAltaMedico'

export const metadata = { title: 'Alta de médico | MediCuenta' }

function LinkInvalido() {
  return (
    <div className="mx-auto max-w-md p-8 text-center space-y-3">
      <h1 className="text-lg font-semibold">Enlace no válido</h1>
      <p className="text-sm text-muted-foreground">
        Este enlace ya no sirve o expiró. Pedile un enlace nuevo a tu administrador.
      </p>
    </div>
  )
}

export default async function AltaMedicoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const service = createServiceClient()
  const { data: inv } = await service
    .from('invitaciones_medico')
    .select('estado, expira_en')
    .eq('token', token)
    .maybeSingle()

  if (!inv || !invitacionVigente(inv.estado as string, inv.expira_en as string, new Date())) {
    return <LinkInvalido />
  }

  return (
    <div className="mx-auto max-w-md p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Creá tu cuenta de MediCuenta</h1>
        <p className="text-sm text-muted-foreground">Completá tus datos y definí tu contraseña.</p>
      </div>
      <FormAltaMedico token={token} />
    </div>
  )
}

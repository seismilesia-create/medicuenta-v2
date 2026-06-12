import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PacientesView } from '@/features/consultorio/components/pacientes/pacientes-view'

export const metadata = {
  title: 'Pacientes | MediCuenta',
}

export default async function PacientesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <PacientesView medicoId={user.id} />
}

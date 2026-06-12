import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AgendaView } from '@/features/consultorio/components/agenda/agenda-view'

export const metadata = {
  title: 'Agenda | MediCuenta',
}

export default async function AgendaPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <AgendaView medicoId={user.id} />
}

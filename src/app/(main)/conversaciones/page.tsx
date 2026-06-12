import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ConversacionesView } from '@/features/consultorio/components/conversaciones/conversaciones-view'

export const metadata = {
  title: 'Conversaciones | MediCuenta',
}

export default async function ConversacionesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <ConversacionesView medicoId={user.id} />
}

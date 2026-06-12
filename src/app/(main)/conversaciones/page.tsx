import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ConversacionesView } from '@/features/consultorio/components/conversaciones/conversaciones-view'

export const metadata = {
  title: 'Conversaciones | MediCuenta',
}

export default async function ConversacionesPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { id } = await searchParams
  return <ConversacionesView medicoId={user.id} initialId={id ?? null} />
}

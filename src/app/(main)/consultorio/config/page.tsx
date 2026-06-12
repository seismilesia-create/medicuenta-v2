import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ConfigView } from '@/features/consultorio/components/config/config-view'

export const metadata = {
  title: 'Config del consultorio | MediCuenta',
}

export default async function ConfigPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <ConfigView medicoId={user.id} />
}

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AssistantPanel } from '@/features/assistant/components/AssistantPanel'

export const metadata = {
  title: 'Asistente | MediCuenta',
}

export default async function AsistentePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="h-[calc(100vh-3.5rem)] md:h-screen flex flex-col">
      <div className="flex-1 overflow-hidden">
        <AssistantPanel variant="fullscreen" />
      </div>
    </div>
  )
}

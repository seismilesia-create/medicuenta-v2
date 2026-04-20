import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AssistantPanel } from '@/features/assistant/components/AssistantPanel'

export const metadata = {
  title: 'Asistente | MediCuenta',
}

export default async function AsistentePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="h-[calc(100vh-4rem)] md:h-screen flex flex-col">
      <div className="px-4 py-4 md:px-8 md:py-6 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight" style={{ color: 'var(--color-foreground)' }}>
          Asistente
        </h1>
        <p className="text-xs md:text-sm mt-0.5" style={{ color: 'var(--color-foreground-secondary, var(--color-muted))' }}>
          Registrá órdenes y cirugías, consultá el nomenclador, escaneá fotos. Todo por chat.
        </p>
      </div>
      <div className="flex-1 overflow-hidden">
        <AssistantPanel variant="fullscreen" />
      </div>
    </div>
  )
}

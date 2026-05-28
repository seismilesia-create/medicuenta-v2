import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AssistantHome } from '@/features/assistant/components'

export const metadata = {
  title: 'MediCuenta',
}

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Traemos solo el nombre para el saludo; si falla, mostramos saludo genérico.
  const { data: perfil } = await supabase
    .from('perfiles')
    .select('nombre')
    .eq('id', user.id)
    .maybeSingle()

  const nombre = (perfil?.nombre ?? null) as string | null

  return (
    <div className="h-screen w-screen overflow-hidden">
      <AssistantHome nombre={nombre} />
    </div>
  )
}

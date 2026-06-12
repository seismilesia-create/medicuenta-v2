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

  // Traemos el nombre para el saludo + si es dueño para mandarlo a su panel.
  const { data: perfil } = await supabase
    .from('perfiles')
    .select('nombre, es_superadmin')
    .eq('id', user.id)
    .maybeSingle()

  // El dueño (superadmin) entra directo a SU panel, no al asistente del médico.
  if (perfil?.es_superadmin) {
    redirect('/admin')
  }

  const nombre = (perfil?.nombre ?? null) as string | null

  return (
    <div className="h-screen w-screen overflow-hidden">
      <AssistantHome nombre={nombre} />
    </div>
  )
}

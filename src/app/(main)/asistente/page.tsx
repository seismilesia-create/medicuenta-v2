import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AssistantHome } from '@/features/assistant/components'

export const metadata = {
  title: 'Asistente IA | MediCuenta',
}

// Misma pantalla del asistente que el home `/`, pero dentro del shell (con la
// sidebar de navegación). El panel flotante derecho se oculta en esta ruta
// (lo maneja AssistantSidePanel) para no tener dos asistentes a la vez.
export default async function AsistentePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('nombre')
    .eq('id', user.id)
    .maybeSingle()

  const nombre = (perfil?.nombre ?? null) as string | null

  // Altura definida para que AssistantHome (que usa h-full) se centre y scrollee
  // bien: en mobile descontamos el header (3.5rem) y el bottom nav (5rem); en
  // desktop ocupa toda la altura del viewport.
  return (
    <div className="h-[calc(100dvh-8.5rem)] md:h-dvh">
      <AssistantHome nombre={nombre} />
    </div>
  )
}

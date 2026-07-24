import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LandingView } from '@/features/landing/components/landing-view'

// El título, la descripción y la vista previa del link viven en el layout raíz
// (una sola fuente de verdad, y así la card de WhatsApp es la misma en toda la app).

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Visitante sin sesión → landing pública.
  if (!user) {
    return <LandingView />
  }

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('es_superadmin')
    .eq('id', user.id)
    .maybeSingle()

  // El dueño (superadmin) entra a SU panel.
  if (perfil?.es_superadmin) {
    redirect('/admin')
  }

  // Médico/secretaria → el dashboard, que ya tiene el shell responsive (escritorio:
  // sidebar + dashboard + asistente lateral; celular: asistente puro) y el gating por
  // plan. A la secretaria el middleware la reenvía a /agenda.
  redirect('/dashboard')
}

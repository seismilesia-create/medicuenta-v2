import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LandingView } from '@/features/landing/components/landing-view'

export const metadata = {
  title: 'MediCuenta — Facturá a las obras sociales sin planillas ni papeles',
  description:
    'La app para médicos de Catamarca: asistente de IA que atiende tu WhatsApp, órdenes y recetas con una foto, agenda inteligente y control de débitos. Acceso por invitación.',
}

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

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

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

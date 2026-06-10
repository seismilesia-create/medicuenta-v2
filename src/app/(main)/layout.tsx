import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/shared/components/layout/sidebar'
import { BottomNav } from '@/shared/components/layout/bottom-nav'
import { AssistantSidePanel, MainShell } from '@/features/assistant/components'

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Nombre para el footer del sidebar; si no hay perfil, queda en null y se
  // muestra "Doctor" como fallback.
  let nombreCompleto: string | null = null
  if (user) {
    const { data: perfil } = await supabase
      .from('perfiles')
      .select('nombre, apellido')
      .eq('id', user.id)
      .maybeSingle()

    const partes = [perfil?.nombre, perfil?.apellido].filter(Boolean)
    nombreCompleto = partes.length > 0 ? partes.join(' ') : null
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar nombre={nombreCompleto} />
      <MainShell>{children}</MainShell>
      <BottomNav />
      <AssistantSidePanel />
    </div>
  )
}

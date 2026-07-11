import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PerfilForm } from '@/features/perfil/components/PerfilForm'
import type { Perfil } from '@/features/perfil/types/perfil'

export const metadata = {
  title: 'Perfil | MediCuenta'
}

export default async function PerfilPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  let perfil: Perfil

  const { data, error } = await supabase
    .from('perfiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error && error.code === 'PGRST116') {
    // No profile exists, create one
    const { data: newPerfil, error: insertError } = await supabase
      .from('perfiles')
      .insert({
        id: user.id,
        email: user.email,
        rol: 'medico',
        circulo_medico: true,
      })
      .select()
      .single()

    if (insertError) {
      return (
        <div className="px-4 py-6 md:px-8 md:py-10 lg:px-12 lg:py-12 max-w-7xl mx-auto">
          <p style={{ color: 'var(--color-error)' }}>Error al crear perfil: {insertError.message}</p>
        </div>
      )
    }

    perfil = newPerfil as Perfil
  } else if (error) {
    return (
      <div className="px-4 py-6 md:px-8 md:py-10 lg:px-12 lg:py-12 max-w-7xl mx-auto">
        <p style={{ color: 'var(--color-error)' }}>Error al cargar perfil: {error.message}</p>
      </div>
    )
  } else {
    perfil = data as Perfil
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-10 lg:px-12 lg:py-12 max-w-7xl mx-auto space-y-6 md:space-y-10">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight" style={{ color: 'var(--color-foreground)' }}>
          Mi perfil
        </h1>
        <p className="mt-1.5 text-base" style={{ color: 'var(--color-foreground-secondary)' }}>
          Administra tu informacion personal y configuracion
        </p>
      </div>

      <PerfilForm perfil={perfil} email={user.email ?? null} />
    </div>
  )
}

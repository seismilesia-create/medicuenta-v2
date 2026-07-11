'use server'

import { createClient } from '@/lib/supabase/server'
import { perfilUpdateSchema, type PerfilFormData } from '@/features/perfil/types/perfil'

export async function getPerfil() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado', data: null }
  }

  const { data, error } = await supabase
    .from('perfiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error && error.code === 'PGRST116') {
    // No profile exists yet, create one
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
      return { error: insertError.message, data: null }
    }

    return { error: null, data: newPerfil }
  }

  if (error) {
    return { error: error.message, data: null }
  }

  return { error: null, data }
}

export async function updatePerfil(formData: PerfilFormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const parsed = perfilUpdateSchema.safeParse(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const data = parsed.data

  const { error } = await supabase
    .from('perfiles')
    .update({
      nombre: data.nombre,
      apellido: data.apellido,
      matricula: data.matricula ?? null,
      cuit: data.cuit ?? null,
      telefono: data.telefono ?? null,
      especialidad: data.especialidad ?? null,
    })
    .eq('id', user.id)

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

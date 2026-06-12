import { createClient } from '@/lib/supabase/server'

/**
 * Guard del panel del dueño (spec dashboard §4). Devuelve el usuario solo si es
 * superadmin (perfiles.es_superadmin). Leer el propio perfil está permitido por
 * la RLS médico-only. Si no es superadmin, devuelve null y la page redirige.
 */
export async function resolverSuperadmin(): Promise<{ userId: string; nombre: string | null } | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('es_superadmin, nombre')
    .eq('id', user.id)
    .maybeSingle()

  if (!perfil?.es_superadmin) return null
  return { userId: user.id, nombre: (perfil.nombre as string | null) ?? null }
}

'use server'

import { createClient } from '@/lib/supabase/server'
import { catalogoVigente, type OsCatalogoItem, type ArancelOsRow } from '@/lib/catalogo/obras-sociales'

/** Catálogo de OS de la vigencia más reciente (lectura global). */
export async function getCatalogoOs(): Promise<OsCatalogoItem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('aranceles_os')
    .select('codigo_os, nombre_os, activa, vigencia')
  if (error || !data) return []
  return catalogoVigente(data as ArancelOsRow[])
}

/** OS suspendidas que el médico cargó a mano (wa_os_suspendidas). */
export async function getMisOsSuspendidas(): Promise<string[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('wa_os_suspendidas')
    .select('nombre_os')
    .eq('medico_id', user.id)
  if (error || !data) return []
  return data.map((r) => r.nombre_os as string)
}

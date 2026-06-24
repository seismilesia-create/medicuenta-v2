'use server'

import { createClient } from '@/lib/supabase/server'
import { catalogoVigente, type OsCatalogoItem, type ArancelOsRow } from '@/lib/catalogo/obras-sociales'
import type { ArancelVigente, MiCategoriaArancel, CategoriaArancel } from '@/lib/catalogo/honorario'

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

/** Arancel de la vigencia más reciente de una OS, por codigo_os (lectura global). */
export async function getArancelVigente(codigoOs: number): Promise<ArancelVigente | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('aranceles_os')
    .select('valor_consulta_medica, valor_especialista, valor_consulta_oftalmologica, valor_recertificado, recargo_interior_pct, vigencia')
    .eq('codigo_os', codigoOs)
    .order('vigencia', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  const num = (v: unknown): number | null => (v == null ? null : Number(v))
  return {
    valor_consulta_medica: num(data.valor_consulta_medica),
    valor_especialista: num(data.valor_especialista),
    valor_consulta_oftalmologica: num(data.valor_consulta_oftalmologica),
    valor_recertificado: num(data.valor_recertificado),
    recargo_interior_pct: num(data.recargo_interior_pct),
  }
}

/** Categoría arancelaria del médico logueado (para auto-calcular el honorario). */
export async function getMiCategoriaArancel(): Promise<MiCategoriaArancel> {
  const vacio: MiCategoriaArancel = { categoria_arancel: null, atiende_interior: false }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return vacio
  const { data } = await supabase
    .from('perfiles')
    .select('categoria_arancel, atiende_interior')
    .eq('id', user.id)
    .maybeSingle()
  if (!data) return vacio
  return {
    categoria_arancel: (data.categoria_arancel as CategoriaArancel | null) ?? null,
    atiende_interior: (data.atiende_interior as boolean | null) ?? false,
  }
}

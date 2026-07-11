'use server'

import { createClient } from '@/lib/supabase/server'
import { catalogoVigente, type OsCatalogoItem, type ArancelOsRow } from '@/lib/catalogo/obras-sociales'
import { elegirArancelVigente, type ArancelVigente, type MiCategoriaArancel, type CategoriaArancel } from '@/lib/catalogo/honorario'

/** Catálogo de OS de la vigencia más reciente (lectura global). */
export async function getCatalogoOs(): Promise<OsCatalogoItem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('aranceles_os')
    .select('codigo_os, nombre_os, activa, vigencia')
  if (error || !data) return []
  return catalogoVigente(data as ArancelOsRow[])
}

/** OS suspendidas POR EL CÍRCULO (motivo='suspendida') que el médico cargó a mano.
 *  Alimenta el aviso de riesgo de débito en Órdenes — NO incluye 'no_atiende'
 *  (el médico no la toma, pero no es un riesgo de débito del Círculo). */
export async function getMisOsSuspendidas(): Promise<string[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('wa_os_suspendidas')
    .select('nombre_os')
    .eq('medico_id', user.id)
    .eq('motivo', 'suspendida')
  if (error || !data) return []
  return data.map((r) => r.nombre_os as string)
}

type ArancelOsValoresRow = {
  valor_consulta_medica: number | null
  valor_especialista: number | null
  valor_consulta_oftalmologica: number | null
  valor_recertificado: number | null
  recargo_interior_pct: number | null
  vigencia: string
}

/**
 * Arancel de una OS vigente A LA FECHA DE ATENCIÓN de la orden (por codigo_os).
 * `fechaAtencion` en formato 'YYYY-MM-DD'. Elige la vigencia más reciente que no
 * sea posterior a esa fecha: una orden de junio no toma el arancel de julio aunque
 * ya esté cargado. Devuelve null si no hay vigencia aplicable (el form queda manual).
 */
export async function getArancelVigente(
  codigoOs: number,
  fechaAtencion: string,
): Promise<ArancelVigente | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('aranceles_os')
    .select('valor_consulta_medica, valor_especialista, valor_consulta_oftalmologica, valor_recertificado, recargo_interior_pct, vigencia')
    .eq('codigo_os', codigoOs)
  if (error || !data) return null
  const row = elegirArancelVigente(data as ArancelOsValoresRow[], fechaAtencion)
  if (!row) return null
  const num = (v: unknown): number | null => (v == null ? null : Number(v))
  return {
    valor_consulta_medica: num(row.valor_consulta_medica),
    valor_especialista: num(row.valor_especialista),
    valor_consulta_oftalmologica: num(row.valor_consulta_oftalmologica),
    valor_recertificado: num(row.valor_recertificado),
    recargo_interior_pct: num(row.recargo_interior_pct),
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

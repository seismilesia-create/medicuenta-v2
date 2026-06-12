import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Lectura de la bitácora del consultorio (spec Fase 3 §10). Médico-only por RLS
 * (delegada a la secretaria por `puede_acceder_consultorio`). Append-only: acá
 * solo se LEE. El registro lo hace `registrarEvento` (services/whatsapp/bitacora).
 */
export interface RegistroBitacoraRow {
  id: string
  origen: string
  nivel: 'info' | 'error'
  evento: string
  detalle: Record<string, unknown>
  conversacion_id: string | null
  created_at: string
}

export interface FiltroBitacora {
  limit?: number
  /** Si es true, trae solo nivel='error'. */
  soloErrores?: boolean
}

export async function getBitacora(
  db: SupabaseClient,
  medicoId: string,
  filtro: FiltroBitacora = {},
): Promise<RegistroBitacoraRow[]> {
  let query = db
    .from('wa_bitacora')
    .select('id, origen, nivel, evento, detalle, conversacion_id, created_at')
    .eq('medico_id', medicoId)
    .order('created_at', { ascending: false })
    .limit(filtro.limit ?? 50)
  if (filtro.soloErrores) query = query.eq('nivel', 'error')

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as RegistroBitacoraRow[]
}

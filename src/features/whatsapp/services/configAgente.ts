import type { SupabaseClient } from '@supabase/supabase-js'

export async function getPrecioReceta(db: SupabaseClient, medicoId: string): Promise<number | null> {
  const { data } = await db
    .from('wa_config_agente')
    .select('precio_receta_default')
    .eq('medico_id', medicoId)
    .maybeSingle()
  const precio = (data as { precio_receta_default: number | null } | null)?.precio_receta_default
  return precio != null ? Number(precio) : null
}

export async function setPrecioReceta(db: SupabaseClient, medicoId: string, monto: number): Promise<void> {
  await db
    .from('wa_config_agente')
    .upsert(
      { medico_id: medicoId, precio_receta_default: monto, updated_at: new Date().toISOString() },
      { onConflict: 'medico_id' },
    )
}

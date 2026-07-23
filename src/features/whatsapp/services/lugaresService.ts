import type { SupabaseClient } from '@supabase/supabase-js'
import type { LugarAtencion } from '@/lib/consultorio/lugaresAtencion'

/** Lugares donde atiende el médico, para que el bot diga dónde concurrir.
 *  Ante error devuelve [] (el mensaje sale sin la sección de lugares, nunca inventada). */
export async function getLugares(db: SupabaseClient, medicoId: string): Promise<LugarAtencion[]> {
  const { data, error } = await db
    .from('wa_lugares_atencion')
    .select('id, nombre, direccion, consultorio, piso, dias')
    .eq('medico_id', medicoId)
    .order('created_at')
  if (error) {
    console.error('[wa] getLugares:', error.message)
    return []
  }
  return (data as LugarAtencion[] | null) ?? []
}

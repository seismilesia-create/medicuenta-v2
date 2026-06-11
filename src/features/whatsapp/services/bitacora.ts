import type { SupabaseClient } from '@supabase/supabase-js'

export type BitacoraOrigen = 'agente' | 'panel' | 'webhook' | 'gcal' | 'mp'

export interface EventoBitacora {
  medicoId?: string | null
  origen: BitacoraOrigen
  nivel: 'info' | 'error'
  evento: string
  detalle?: unknown
  conversacionId?: string | null
}

/**
 * Traza estructurada del sistema (spec Fase 3 §10) — la comida del futuro
 * orquestador (§12). NUNCA lanza: un fallo de bitácora no puede afectar el flujo.
 */
export async function registrarEvento(db: SupabaseClient, ev: EventoBitacora): Promise<void> {
  try {
    const { error } = await db.from('wa_bitacora').insert({
      medico_id: ev.medicoId ?? null,
      origen: ev.origen,
      nivel: ev.nivel,
      evento: ev.evento,
      detalle: (ev.detalle as object) ?? {},
      conversacion_id: ev.conversacionId ?? null,
    })
    if (error) console.error('[bitacora] insert error:', error.message)
  } catch (e) {
    console.error('[bitacora] error inesperado:', e)
  }
}

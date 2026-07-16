import type { SupabaseClient } from '@supabase/supabase-js'
import { estaDentroConGracia } from '@/lib/turnos/slots'
import type { ScheduleExceptionLite } from '@/lib/turnos/slots'

/** Minutos que la secretaria sigue "disponible" pasado el cierre del horario del médico:
 *  suele quedar unos minutos más en la compu terminando de atender. */
const GRACIA_SECRETARIA_MIN = 15

/**
 * ¿La secretaria puede atender AHORA? = ¿el instante actual (hora AR) cae dentro del
 * horario de atención del médico (el mismo que usa turnos), con una gracia de
 * GRACIA_SECRETARIA_MIN minutos después del cierre? Si el médico no cargó horario,
 * devuelve false (no se inventa disponibilidad → el bot solo ofrece pago).
 */
export async function secretariaDisponibleAhora(db: SupabaseClient, medicoId: string): Promise<boolean> {
  const [{ data: horarios }, { data: excepciones }] = await Promise.all([
    db.from('wa_horarios').select('weekday, open_time, close_time').eq('medico_id', medicoId),
    db.from('wa_excepciones').select('start_date, end_date, kind, ranges').eq('medico_id', medicoId),
  ])
  const weekly = (horarios as { weekday: number; open_time: string; close_time: string }[] | null) ?? []
  if (weekly.length === 0) return false
  return estaDentroConGracia({
    ahoraMs: Date.now(),
    weekly,
    exceptions: (excepciones as ScheduleExceptionLite[] | null) ?? [],
    graciaMin: GRACIA_SECRETARIA_MIN,
  })
}

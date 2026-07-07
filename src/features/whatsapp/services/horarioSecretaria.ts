import type { SupabaseClient } from '@supabase/supabase-js'
import { estaDentroDelHorario } from '@/lib/turnos/slots'
import type { ScheduleExceptionLite } from '@/lib/turnos/slots'

/**
 * ¿La secretaria puede atender AHORA? = ¿el instante actual (hora AR) cae dentro del
 * horario de atención del médico (el mismo que usa turnos)? Si el médico no cargó
 * horario, devuelve false (no se inventa disponibilidad → el bot solo ofrece pago).
 */
export async function secretariaDisponibleAhora(db: SupabaseClient, medicoId: string): Promise<boolean> {
  const [{ data: horarios }, { data: excepciones }] = await Promise.all([
    db.from('wa_horarios').select('weekday, open_time, close_time').eq('medico_id', medicoId),
    db.from('wa_excepciones').select('start_date, end_date, kind, ranges').eq('medico_id', medicoId),
  ])
  const weekly = (horarios as { weekday: number; open_time: string; close_time: string }[] | null) ?? []
  if (weekly.length === 0) return false
  return estaDentroDelHorario({
    ahoraMs: Date.now(),
    weekly,
    exceptions: (excepciones as ScheduleExceptionLite[] | null) ?? [],
  })
}

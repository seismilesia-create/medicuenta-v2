import type { SupabaseClient } from '@supabase/supabase-js'
import { AR_OFFSET } from '@/lib/turnos/slots'
import {
  armarResumenDia,
  type CobroCierre,
  type OrdenCierre,
  type ResumenDia,
  type TurnoCierre,
} from '@/lib/cierre/resumen'

// Sirve a la página del médico (user client, su RLS alcanza) y al cron
// (service client). Todos los cortes son del día calendario ARGENTINA.

export async function getResumenDia(db: SupabaseClient, medicoId: string, fecha: string): Promise<ResumenDia> {
  const desdeIso = new Date(`${fecha}T00:00:00${AR_OFFSET}`).toISOString()
  const hastaIso = new Date(new Date(desdeIso).getTime() + 86_400_000).toISOString()

  const [ordenesRes, cobradosRes, pendientesRes, recetasMpRes, liberadasRes, nrosRes, turnosRes] = await Promise.all([
    // Órdenes CARGADAS hoy (created_at): la rendición mide lo que entró al sistema hoy;
    // la fecha_atencion puede ser otra (se marca como "fuera de fecha").
    db
      .from('ordenes')
      .select('id, tipo, nombre_paciente, obra_social, codigo_os, honorario_calculado, fecha_atencion, nro_comprobante, turno_id')
      .eq('medico_id', medicoId)
      .gte('created_at', desdeIso)
      .lt('created_at', hastaIso),
    db
      .from('cobros')
      .select('concepto, medio, monto, turno_id, sobreturno_id')
      .eq('medico_id', medicoId)
      .eq('estado', 'cobrado')
      .gte('cobrado_at', desdeIso)
      .lt('cobrado_at', hastaIso),
    db
      .from('cobros')
      .select('concepto, medio, monto, turno_id, sobreturno_id')
      .eq('medico_id', medicoId)
      .eq('estado', 'pendiente')
      .gte('created_at', desdeIso)
      .lt('created_at', hastaIso),
    db
      .from('recetas')
      .select('monto')
      .eq('medico_id', medicoId)
      .gte('pagada_at', desdeIso)
      .lt('pagada_at', hastaIso),
    db
      .from('recetas')
      .select('id')
      .eq('medico_id', medicoId)
      .gte('liberada_at', desdeIso)
      .lt('liberada_at', hastaIso),
    db.from('recetas').select('nro_orden_consulta').eq('medico_id', medicoId).not('nro_orden_consulta', 'is', null),
    db
      .from('wa_turnos')
      .select('id, estado, starts_at, checkin_at, paciente_nombre, paciente_apellido')
      .eq('medico_id', medicoId)
      .gte('starts_at', desdeIso)
      .lt('starts_at', hastaIso),
  ])

  const turnos: TurnoCierre[] = (
    (turnosRes.data as
      | { id: string; estado: string; starts_at: string; checkin_at: string | null; paciente_nombre: string | null; paciente_apellido: string | null }[]
      | null) ?? []
  ).map((t) => ({
    id: t.id,
    estado: t.estado,
    starts_at: t.starts_at,
    checkin_at: t.checkin_at,
    paciente: [t.paciente_apellido, t.paciente_nombre].filter(Boolean).join(', ') || '(sin datos)',
  }))

  return armarResumenDia({
    fecha,
    ordenes: ((ordenesRes.data as OrdenCierre[] | null) ?? []),
    cobrosCobrados: ((cobradosRes.data as CobroCierre[] | null) ?? []),
    cobrosPendientes: ((pendientesRes.data as CobroCierre[] | null) ?? []),
    recetasPagadasMontos: (((recetasMpRes.data as { monto: number | null }[] | null) ?? []).map((r) => Number(r.monto) || 0)),
    recetasLiberadas: ((liberadasRes.data as { id: string }[] | null) ?? []).length,
    nrosOrdenReceta: (((nrosRes.data as { nro_orden_consulta: string | null }[] | null) ?? [])
      .map((r) => r.nro_orden_consulta ?? '')
      .filter(Boolean)),
    turnos,
    nowMs: Date.now(),
  })
}

export interface CierreGuardado {
  fecha: string
  cerrado_por: string | null
  created_at: string
  updated_at: string
}

export async function getCierreGuardado(
  db: SupabaseClient,
  medicoId: string,
  fecha: string,
): Promise<CierreGuardado | null> {
  const { data } = await db
    .from('cierres_dia')
    .select('fecha, cerrado_por, created_at, updated_at')
    .eq('medico_id', medicoId)
    .eq('fecha', fecha)
    .maybeSingle()
  return (data as CierreGuardado | null) ?? null
}

'use server'

import { createClient } from '@/lib/supabase/server'
import { normalizarDni } from '@/lib/recetas/normalizar'
import {
  construirSugerencias,
  type SugerenciaTurno,
  type OrdenDelDia,
  type TurnoCrudo,
  type SobreturnoCrudo,
} from '@/lib/consultorio/correlacion'

/**
 * Correlación turno→orden (3C). Acciones que el formulario de orden llama:
 *  - buscarSugerenciasTurno: turnos/sobreturnos atendidos de un DNI SIN orden
 *    vinculada, para proponer fecha/horario reales.
 *  - getHorariosDelDia: horas de las otras órdenes del mismo día (control 15 min).
 * `ordenes` es médico-only (RLS de 3B intacta); por eso user.id === medico_id.
 */

// Ventana de búsqueda: 120 días hacia atrás cubre de sobra una consulta que se
// factura tarde, sin traer historia vieja irrelevante.
const DIAS_ATRAS = 120

export async function buscarSugerenciasTurno(
  dniRaw: string,
): Promise<{ sugerencias: SugerenciaTurno[] } | { error: string }> {
  const dni = normalizarDni(dniRaw)
  if (dni.length < 7) return { sugerencias: [] } // DNI incompleto: no buscamos

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const nowMs = Date.now()
  const desde = new Date(nowMs - DIAS_ATRAS * 86_400_000).toISOString()
  const ahora = new Date(nowMs).toISOString()
  const desdeFecha = desde.slice(0, 10)

  // Candidatos: del médico, del DNI, ya pasados, no cancelados/ausentes.
  const { data: turnos } = await supabase
    .from('wa_turnos')
    .select('id, starts_at, estado, paciente_nombre, paciente_apellido')
    .eq('medico_id', user.id)
    .eq('paciente_dni', dni)
    .lte('starts_at', ahora)
    .gte('starts_at', desde)
    .not('estado', 'in', '(cancelado,ausente)')
    .order('starts_at', { ascending: false })
    .limit(20)

  const { data: sobreturnos } = await supabase
    .from('wa_sobreturnos')
    .select('id, fecha, estado, paciente_nombre, paciente_apellido')
    .eq('medico_id', user.id)
    .eq('paciente_dni', dni)
    .lte('fecha', ahora.slice(0, 10))
    .gte('fecha', desdeFecha)
    .not('estado', 'in', '(cancelado,no_vino)')
    .order('fecha', { ascending: false })
    .limit(20)

  // Excluir turnos que YA tienen una orden vinculada (no re-sugerir lo facturado).
  const ids = (turnos ?? []).map((t) => t.id)
  let vinculados = new Set<string>()
  if (ids.length) {
    const { data: ordenesLinked } = await supabase
      .from('ordenes')
      .select('turno_id')
      .eq('medico_id', user.id)
      .in('turno_id', ids)
    vinculados = new Set((ordenesLinked ?? []).map((o) => o.turno_id as string))
  }

  const turnosLibres = (turnos ?? []).filter((t) => !vinculados.has(t.id)) as TurnoCrudo[]
  const sugerencias = construirSugerencias(turnosLibres, (sobreturnos ?? []) as SobreturnoCrudo[], nowMs)
  return { sugerencias }
}

export async function getHorariosDelDia(
  fecha: string,
  excludeOrdenId?: string,
): Promise<{ ordenes: OrdenDelDia[] } | { error: string }> {
  if (!fecha) return { ordenes: [] }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  let query = supabase
    .from('ordenes')
    .select('id, horario_realizacion, nombre_paciente')
    .eq('medico_id', user.id)
    .eq('fecha_atencion', fecha)
    .not('horario_realizacion', 'is', null)
  if (excludeOrdenId) query = query.neq('id', excludeOrdenId)

  const { data } = await query
  const ordenes: OrdenDelDia[] = (data ?? [])
    .filter((o) => (o.horario_realizacion ?? '').trim())
    .map((o) => ({ id: o.id, hora: o.horario_realizacion as string, paciente: o.nombre_paciente }))
  return { ordenes }
}

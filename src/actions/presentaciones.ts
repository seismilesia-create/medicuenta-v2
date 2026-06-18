'use server'

import { createClient } from '@/lib/supabase/server'
import { totalHonorarios, periodoMesDe } from '@/lib/ordenes/planilla'

export interface EmitirPlanillaInput {
  obra_social: string
  agente_facturador: string
  orden_ids: string[]
}

/** Crea UNA presentación para una OS y marca/vincula sus órdenes (borrador → presentada). */
export async function emitirPlanilla(input: EmitirPlanillaInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }
  if (input.orden_ids.length === 0) return { error: 'No hay órdenes para presentar' }

  const { data: ordenes, error: qErr } = await supabase
    .from('ordenes')
    .select('id, obra_social, fecha_atencion, honorario_calculado, monto_plus, estado')
    .in('id', input.orden_ids)
    .eq('medico_id', user.id)
    .eq('estado', 'borrador')
    .eq('obra_social', input.obra_social)
  if (qErr) return { error: qErr.message }
  const validas = ordenes ?? []
  if (validas.length === 0) return { error: 'No hay órdenes válidas (borrador, de esa obra social)' }

  const periodo_mes = periodoMesDe(
    [...validas].sort((a, b) => a.fecha_atencion.localeCompare(b.fecha_atencion))[0].fecha_atencion,
  )
  const monto_total = totalHonorarios(validas)

  const { data: pres, error: insErr } = await supabase
    .from('presentaciones')
    .insert({
      medico_id: user.id,
      periodo_mes,
      obra_social: input.obra_social,
      agente_facturador: input.agente_facturador,
      cantidad_ordenes: validas.length,
      monto_total,
    })
    .select('id')
    .single()
  if (insErr || !pres) return { error: insErr?.message ?? 'No se pudo crear la presentación' }

  const { error: updErr } = await supabase
    .from('ordenes')
    .update({ estado: 'presentada', presentacion_id: pres.id, updated_at: new Date().toISOString() })
    .in('id', validas.map((o) => o.id))
    .eq('medico_id', user.id)
    .eq('estado', 'borrador')
  if (updErr) return { error: updErr.message }

  return { success: true, presentacion_id: pres.id as string, cantidad: validas.length }
}

export async function getPresentaciones() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' as const }
  const { data, error } = await supabase
    .from('presentaciones')
    .select('*')
    .eq('medico_id', user.id)
    .order('fecha_emision', { ascending: false })
  if (error) return { error: error.message }
  return { presentaciones: data ?? [] }
}

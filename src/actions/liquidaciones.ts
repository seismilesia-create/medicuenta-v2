'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { liquidacionSchema, type LiquidacionFormData } from '@/features/liquidaciones/types/liquidaciones'

export async function createLiquidacion(formData: LiquidacionFormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Validate with Zod
  const parsed = liquidacionSchema.safeParse(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const data = parsed.data

  // Validate that periodo_fin is after periodo_inicio
  if (new Date(data.periodo_fin) < new Date(data.periodo_inicio)) {
    return { error: 'Periodo fin debe ser posterior al periodo inicio' }
  }

  const insertData = {
    medico_id: user.id,
    periodo_inicio: data.periodo_inicio,
    periodo_fin: data.periodo_fin,
    obra_social: data.obra_social || null,
    monto_presentado: data.monto_presentado,
    monto_liquidado: data.monto_liquidado ?? 0,
    monto_debitado: data.monto_debitado ?? 0,
    observaciones: data.observaciones ?? null,
    estado: 'pendiente',
  }

  const { error } = await supabase
    .from('liquidaciones')
    .insert(insertData)

  if (error) {
    return { error: error.message }
  }

  redirect('/liquidaciones')
}

export async function updateLiquidacionEstado(liquidacionId: string, estado: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('liquidaciones')
    .update({ estado, updated_at: new Date().toISOString() })
    .eq('id', liquidacionId)
    .eq('medico_id', user.id)

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

export async function updateLiquidacion(liquidacionId: string, formData: LiquidacionFormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const parsed = liquidacionSchema.safeParse(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const data = parsed.data

  if (new Date(data.periodo_fin) < new Date(data.periodo_inicio)) {
    return { error: 'Periodo fin debe ser posterior al periodo inicio' }
  }

  const { error } = await supabase
    .from('liquidaciones')
    .update({
      periodo_inicio: data.periodo_inicio,
      periodo_fin: data.periodo_fin,
      obra_social: data.obra_social || null,
      monto_presentado: data.monto_presentado,
      monto_liquidado: data.monto_liquidado ?? 0,
      monto_debitado: data.monto_debitado ?? 0,
      observaciones: data.observaciones ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', liquidacionId)
    .eq('medico_id', user.id)

  if (error) {
    return { error: error.message }
  }

  redirect(`/liquidaciones/${liquidacionId}`)
}

export async function deleteLiquidacion(liquidacionId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('liquidaciones')
    .delete()
    .eq('id', liquidacionId)
    .eq('medico_id', user.id)

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { debitoSchema, type DebitoFormData } from '@/features/debitos/types/debitos'

export async function createDebito(formData: DebitoFormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Validate with Zod
  const parsed = debitoSchema.safeParse(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const data = parsed.data

  // Auto-set refacturable for certain motivos
  const motivosRefacturables = ['falta_token', 'falta_firma', 'falta_diagnostico', 'error_codigo']
  const refacturable = motivosRefacturables.includes(data.motivo) ? true : data.refacturable

  const insertData = {
    medico_id: user.id,
    motivo: data.motivo,
    motivo_detalle: data.motivo_detalle || null,
    monto: data.monto,
    refacturable,
    refacturado: false,
    fecha: data.fecha,
    orden_id: null,
    liquidacion_id: null,
  }

  const { error } = await supabase
    .from('debitos')
    .insert(insertData)

  if (error) {
    return { error: error.message }
  }

  redirect('/debitos')
}

export async function updateDebito(debitoId: string, formData: DebitoFormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const parsed = debitoSchema.safeParse(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const data = parsed.data

  const motivosRefacturables = ['falta_token', 'falta_firma', 'falta_diagnostico', 'error_codigo']
  const refacturable = motivosRefacturables.includes(data.motivo) ? true : data.refacturable

  const { error } = await supabase
    .from('debitos')
    .update({
      motivo: data.motivo,
      motivo_detalle: data.motivo_detalle || null,
      monto: data.monto,
      refacturable,
      fecha: data.fecha,
    })
    .eq('id', debitoId)
    .eq('medico_id', user.id)

  if (error) {
    return { error: error.message }
  }

  redirect(`/debitos/${debitoId}`)
}

export async function deleteDebito(debitoId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('debitos')
    .delete()
    .eq('id', debitoId)
    .eq('medico_id', user.id)

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

export async function updateDebitoRefacturado(debitoId: string, refacturado: boolean) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('debitos')
    .update({ refacturado })
    .eq('id', debitoId)
    .eq('medico_id', user.id)

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

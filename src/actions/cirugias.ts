'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cirugiaSchema, type CirugiaFormData, type PracticaAdicional } from '@/features/cirugias/types/cirugias'

/**
 * Calcula el total con regla OSEP:
 * - Primera practica (mayor total): 100% honorarios
 * - Resto: 50% honorarios
 * - Gastos siempre 100%
 */
function calcularTotalOSEP(
  practicaPrincipal: { honorarios: number; gastos: number; total: number },
  adicionales: PracticaAdicional[],
): number {
  // Combinar todas las practicas
  const todas = [
    { honorarios: practicaPrincipal.honorarios, gastos: practicaPrincipal.gastos, total: practicaPrincipal.total },
    ...adicionales.map(p => ({ honorarios: p.honorarios, gastos: p.gastos, total: p.total })),
  ]

  if (todas.length === 0) return 0
  if (todas.length === 1) return todas[0].total

  // Ordenar por total descendente
  const sorted = [...todas].sort((a, b) => b.total - a.total)

  let totalCalc = 0
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0) {
      // Primera: 100% hon + 100% gastos
      totalCalc += sorted[i].honorarios + sorted[i].gastos
    } else {
      // Resto: 50% hon + 100% gastos
      totalCalc += sorted[i].honorarios * 0.5 + sorted[i].gastos
    }
  }

  return Math.round(totalCalc * 100) / 100
}

export async function createCirugia(formData: CirugiaFormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const parsed = cirugiaSchema.safeParse(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const data = parsed.data

  const totalCalculado = calcularTotalOSEP(
    { honorarios: data.honorarios, gastos: data.gastos, total: data.total },
    data.practicas_adicionales,
  )

  const insertData = {
    medico_id: user.id,
    nombre_paciente: data.nombre_paciente,
    fecha: data.fecha,
    obra_social: data.obra_social,
    codigo_practica: data.codigo_practica,
    nombre_practica: data.nombre_practica ?? null,
    honorarios: data.honorarios,
    gastos: data.gastos,
    total: data.total,
    estado: 'borrador',
    observaciones: data.observaciones ?? null,
    ayudante: data.ayudante ?? null,
    anestesiologo: data.anestesiologo ?? null,
    instrumentador: data.instrumentador ?? null,
    tipo_anestesia: data.tipo_anestesia ?? null,
    duracion_minutos: data.duracion_minutos ?? null,
    sanatorio: data.sanatorio ?? null,
    sala: data.sala ?? null,
    practicas_adicionales: data.practicas_adicionales,
    total_calculado: totalCalculado,
  }

  const { error } = await supabase.from('cirugias').insert(insertData)

  if (error) {
    return { error: error.message }
  }

  redirect('/cirugias')
}

export async function updateCirugia(cirugiaId: string, formData: CirugiaFormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const parsed = cirugiaSchema.safeParse(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const data = parsed.data

  const totalCalculado = calcularTotalOSEP(
    { honorarios: data.honorarios, gastos: data.gastos, total: data.total },
    data.practicas_adicionales,
  )

  const updateData = {
    nombre_paciente: data.nombre_paciente,
    fecha: data.fecha,
    obra_social: data.obra_social,
    codigo_practica: data.codigo_practica,
    nombre_practica: data.nombre_practica ?? null,
    honorarios: data.honorarios,
    gastos: data.gastos,
    total: data.total,
    observaciones: data.observaciones ?? null,
    ayudante: data.ayudante ?? null,
    anestesiologo: data.anestesiologo ?? null,
    instrumentador: data.instrumentador ?? null,
    tipo_anestesia: data.tipo_anestesia ?? null,
    duracion_minutos: data.duracion_minutos ?? null,
    sanatorio: data.sanatorio ?? null,
    sala: data.sala ?? null,
    practicas_adicionales: data.practicas_adicionales,
    total_calculado: totalCalculado,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('cirugias')
    .update(updateData)
    .eq('id', cirugiaId)
    .eq('medico_id', user.id)

  if (error) {
    return { error: error.message }
  }

  redirect(`/cirugias/${cirugiaId}`)
}

export async function updateCirugiaEstado(cirugiaId: string, estado: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('cirugias')
    .update({ estado, updated_at: new Date().toISOString() })
    .eq('id', cirugiaId)
    .eq('medico_id', user.id)

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

export async function batchUpdateCirugiasEstado(cirugiaIds: string[], estado: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  if (cirugiaIds.length === 0) {
    return { error: 'No se seleccionaron cirugias' }
  }

  const { error, count } = await supabase
    .from('cirugias')
    .update({ estado, updated_at: new Date().toISOString() })
    .in('id', cirugiaIds)
    .eq('medico_id', user.id)
    .eq('estado', 'borrador')

  if (error) {
    return { error: error.message }
  }

  return { success: true, count: count ?? cirugiaIds.length }
}

export async function deleteCirugia(cirugiaId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('cirugias')
    .delete()
    .eq('id', cirugiaId)
    .eq('medico_id', user.id)

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

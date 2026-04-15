'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ordenSchema, type OrdenFormData } from '@/features/ordenes/types/ordenes'

export async function createOrden(formData: OrdenFormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Validate with Zod
  const parsed = ordenSchema.safeParse(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const data = parsed.data

  // OSEP-specific validation
  if (data.tipo === 'obra_social' && data.obra_social === 'OSEP') {
    if (!data.token_osep || data.token_osep.length !== 6) {
      return { error: 'Token OSEP debe tener 6 digitos' }
    }
    if (!data.firma_paciente) {
      return { error: 'Firma del paciente requerida para OSEP' }
    }
  }

  const insertData = {
    medico_id: user.id,
    tipo: data.tipo,
    nombre_paciente: data.nombre_paciente,
    fecha_atencion: data.fecha_atencion,
    observaciones: data.observaciones ?? null,
    monto_plus: data.monto_plus ?? 0,
    agente_facturador: data.agente_facturador,
    // OS fields
    obra_social: data.tipo === 'obra_social' ? data.obra_social : null,
    nro_afiliado: data.tipo === 'obra_social' ? data.nro_afiliado : null,
    token_osep: data.tipo === 'obra_social' ? (data.token_osep ?? null) : null,
    firma_paciente: data.tipo === 'obra_social' ? data.firma_paciente : false,
    codigo_practica: data.tipo === 'obra_social' ? data.codigo_practica : null,
    nombre_practica: data.tipo === 'obra_social'
      ? (data.nombre_practica ?? null)
      : data.nombre_practica,
    diagnostico_cie10: data.tipo === 'obra_social' ? (data.diagnostico_cie10 ?? null) : null,
    honorario_calculado: data.tipo === 'obra_social' ? data.honorario_calculado : 0,
    monto_particular: data.tipo === 'particular' ? data.monto_particular : 0,
    estado: 'borrador',
  }

  const { error } = await supabase
    .from('ordenes')
    .insert(insertData)

  if (error) {
    return { error: error.message }
  }

  redirect('/ordenes')
}

export async function updateOrden(ordenId: string, formData: OrdenFormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const parsed = ordenSchema.safeParse(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const data = parsed.data

  if (data.tipo === 'obra_social' && data.obra_social === 'OSEP') {
    if (!data.token_osep || data.token_osep.length !== 6) {
      return { error: 'Token OSEP debe tener 6 digitos' }
    }
    if (!data.firma_paciente) {
      return { error: 'Firma del paciente requerida para OSEP' }
    }
  }

  const updateData = {
    tipo: data.tipo,
    nombre_paciente: data.nombre_paciente,
    fecha_atencion: data.fecha_atencion,
    observaciones: data.observaciones ?? null,
    monto_plus: data.monto_plus ?? 0,
    agente_facturador: data.agente_facturador,
    obra_social: data.tipo === 'obra_social' ? data.obra_social : null,
    nro_afiliado: data.tipo === 'obra_social' ? data.nro_afiliado : null,
    token_osep: data.tipo === 'obra_social' ? (data.token_osep ?? null) : null,
    firma_paciente: data.tipo === 'obra_social' ? data.firma_paciente : false,
    codigo_practica: data.tipo === 'obra_social' ? data.codigo_practica : null,
    nombre_practica: data.tipo === 'obra_social'
      ? (data.nombre_practica ?? null)
      : data.nombre_practica,
    diagnostico_cie10: data.tipo === 'obra_social' ? (data.diagnostico_cie10 ?? null) : null,
    honorario_calculado: data.tipo === 'obra_social' ? data.honorario_calculado : 0,
    monto_particular: data.tipo === 'particular' ? data.monto_particular : 0,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('ordenes')
    .update(updateData)
    .eq('id', ordenId)
    .eq('medico_id', user.id)

  if (error) {
    return { error: error.message }
  }

  redirect(`/ordenes/${ordenId}`)
}

export async function updateOrdenEstado(ordenId: string, estado: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('ordenes')
    .update({ estado, updated_at: new Date().toISOString() })
    .eq('id', ordenId)
    .eq('medico_id', user.id)

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

export async function batchUpdateOrdenesEstado(ordenIds: string[], estado: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  if (ordenIds.length === 0) {
    return { error: 'No se seleccionaron ordenes' }
  }

  const { error, count } = await supabase
    .from('ordenes')
    .update({ estado, updated_at: new Date().toISOString() })
    .in('id', ordenIds)
    .eq('medico_id', user.id)
    .eq('estado', 'borrador')

  if (error) {
    return { error: error.message }
  }

  return { success: true, count: count ?? ordenIds.length }
}

export async function deleteOrden(ordenId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('ordenes')
    .delete()
    .eq('id', ordenId)
    .eq('medico_id', user.id)

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

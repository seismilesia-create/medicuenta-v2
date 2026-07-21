'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  ordenSchema,
  esEstadoOrden,
  transicionOrdenPermitida,
  type OrdenFormData,
  type EstadoOrden,
} from '@/features/ordenes/types/ordenes'
import { evaluarCompletitud } from '@/lib/ordenes/completitud'

export async function createOrden(formData: OrdenFormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Validate with Zod
  const parsed = ordenSchema.safeParse(formData)
  if (!parsed.success) {
    // Incluimos el nombre del campo: sin esto, un null en un campo opcional daba un
    // "invalid input: expected string, received null" a ciegas, imposible de ubicar.
    const issue = parsed.error.issues[0]
    const campo = issue.path.join('.')
    return { error: campo ? `${campo}: ${issue.message}` : issue.message }
  }

  const data = parsed.data

  // OSEP-specific validation
  if (data.tipo === 'obra_social' && (data.codigo_os === 327 || data.obra_social === 'OSEP')) {
    // Token opcional: las órdenes electrónicas (Web Service) no traen token de 6 dígitos.
    // Si el médico lo carga, validamos el formato.
    if (data.token_osep && data.token_osep.length !== 6) {
      return { error: 'El token OSEP, si lo cargás, debe tener 6 dígitos' }
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
    codigo_os: data.tipo === 'obra_social' ? (data.codigo_os ?? null) : null,
    nro_afiliado: data.tipo === 'obra_social' ? data.nro_afiliado : null,
    token_osep: data.tipo === 'obra_social' ? (data.token_osep ?? null) : null,
    firma_paciente: data.tipo === 'obra_social' ? data.firma_paciente : false,
    firma_sello_medico: data.tipo === 'obra_social' ? data.firma_sello_medico : false,
    codigo_practica: data.tipo === 'obra_social' ? data.codigo_practica : null,
    nombre_practica: data.tipo === 'obra_social'
      ? (data.nombre_practica ?? null)
      : data.nombre_practica,
    diagnostico_cie10: data.tipo === 'obra_social' ? (data.diagnostico_cie10 ?? null) : null,
    honorario_calculado: data.tipo === 'obra_social' ? data.honorario_calculado : 0,
    monto_particular: data.tipo === 'particular' ? data.monto_particular : 0,
    // Campos adicionales (OCR / orden completa)
    nro_documento: data.nro_documento ?? null,
    nro_comprobante: data.nro_comprobante ?? null,
    grupo_afiliado: data.grupo_afiliado ?? null,
    fecha_vencimiento: data.fecha_vencimiento || null,
    cantidad: data.cantidad ?? 1,
    medico_solicitante: data.medico_solicitante ?? null,
    horario_realizacion: data.horario_realizacion ?? null,
    // Captura completa de la orden OSEP
    delegacion: data.delegacion ?? null,
    titulo_autorizacion: data.titulo_autorizacion ?? null,
    nro_internacion: data.nro_internacion ?? null,
    fecha_solicitud: data.fecha_solicitud || null,
    fecha_prescripcion: data.fecha_prescripcion || null,
    fecha_emision: data.fecha_emision || null,
    hora_emision: data.hora_emision ?? null,
    titular_nombre: data.titular_nombre ?? null,
    cobertura: data.cobertura ?? null,
    parentesco: data.parentesco ?? null,
    domicilio: data.domicilio ?? null,
    tipo_documento: data.tipo_documento ?? null,
    alias: data.alias ?? null,
    cara: data.cara ?? null,
    pieza: data.pieza ?? null,
    forma_pago: data.forma_pago ?? null,
    cod_pago: data.cod_pago ?? null,
    origen: data.origen ?? null,
    arancelista: data.arancelista ?? null,
    cajero: data.cajero ?? null,
    total_cargo_afiliado: data.total_cargo_afiliado ?? null,
    matricula_profesional: data.matricula_profesional ?? null,
    profesional: data.profesional ?? null,
    entidad: data.entidad ?? null,
    responsable: data.responsable ?? null,
    imagen_comprobante: data.imagen_comprobante ?? null,
    datos_ocr: data.datos_ocr ?? null,
    // Nivel + foja quirúrgica (Nivel 2)
    nivel: data.nivel ?? 1,
    cirugia_adicional: data.cirugia_adicional ?? null,
    cirugia_adicional_codigo: data.cirugia_adicional_codigo ?? null,
    cirugia_adicional_honorario: data.cirugia_adicional_honorario ?? null,
    rol_medico: data.rol_medico ?? null,
    // Correlación 3C: vínculo al turno real de la agenda (si se aplicó la sugerencia).
    turno_id: data.turno_id ?? null,
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
    // Incluimos el nombre del campo: sin esto, un null en un campo opcional daba un
    // "invalid input: expected string, received null" a ciegas, imposible de ubicar.
    const issue = parsed.error.issues[0]
    const campo = issue.path.join('.')
    return { error: campo ? `${campo}: ${issue.message}` : issue.message }
  }

  const data = parsed.data

  if (data.tipo === 'obra_social' && (data.codigo_os === 327 || data.obra_social === 'OSEP')) {
    // Token opcional: las órdenes electrónicas (Web Service) no traen token de 6 dígitos.
    // Si el médico lo carga, validamos el formato.
    if (data.token_osep && data.token_osep.length !== 6) {
      return { error: 'El token OSEP, si lo cargás, debe tener 6 dígitos' }
    }
  }

  // Solo se editan órdenes en borrador: una vez presentada, sus datos ya fueron
  // a la planilla física del Círculo y editarlos desincroniza la presentación.
  const { data: ordenActual } = await supabase
    .from('ordenes')
    .select('estado')
    .eq('id', ordenId)
    .eq('medico_id', user.id)
    .maybeSingle()
  if (!ordenActual) return { error: 'Orden no encontrada' }
  if (ordenActual.estado !== 'borrador') {
    return { error: 'Solo se pueden editar órdenes en borrador. Esta orden ya fue presentada.' }
  }

  const updateData = {
    tipo: data.tipo,
    nombre_paciente: data.nombre_paciente,
    fecha_atencion: data.fecha_atencion,
    observaciones: data.observaciones ?? null,
    monto_plus: data.monto_plus ?? 0,
    agente_facturador: data.agente_facturador,
    obra_social: data.tipo === 'obra_social' ? data.obra_social : null,
    codigo_os: data.tipo === 'obra_social' ? (data.codigo_os ?? null) : null,
    nro_afiliado: data.tipo === 'obra_social' ? data.nro_afiliado : null,
    token_osep: data.tipo === 'obra_social' ? (data.token_osep ?? null) : null,
    firma_paciente: data.tipo === 'obra_social' ? data.firma_paciente : false,
    firma_sello_medico: data.tipo === 'obra_social' ? data.firma_sello_medico : false,
    codigo_practica: data.tipo === 'obra_social' ? data.codigo_practica : null,
    nombre_practica: data.tipo === 'obra_social'
      ? (data.nombre_practica ?? null)
      : data.nombre_practica,
    diagnostico_cie10: data.tipo === 'obra_social' ? (data.diagnostico_cie10 ?? null) : null,
    honorario_calculado: data.tipo === 'obra_social' ? data.honorario_calculado : 0,
    monto_particular: data.tipo === 'particular' ? data.monto_particular : 0,
    // Campos adicionales (OCR / orden completa)
    nro_documento: data.nro_documento ?? null,
    nro_comprobante: data.nro_comprobante ?? null,
    grupo_afiliado: data.grupo_afiliado ?? null,
    fecha_vencimiento: data.fecha_vencimiento || null,
    cantidad: data.cantidad ?? 1,
    medico_solicitante: data.medico_solicitante ?? null,
    horario_realizacion: data.horario_realizacion ?? null,
    // Captura completa de la orden OSEP
    delegacion: data.delegacion ?? null,
    titulo_autorizacion: data.titulo_autorizacion ?? null,
    nro_internacion: data.nro_internacion ?? null,
    fecha_solicitud: data.fecha_solicitud || null,
    fecha_prescripcion: data.fecha_prescripcion || null,
    fecha_emision: data.fecha_emision || null,
    hora_emision: data.hora_emision ?? null,
    titular_nombre: data.titular_nombre ?? null,
    cobertura: data.cobertura ?? null,
    parentesco: data.parentesco ?? null,
    domicilio: data.domicilio ?? null,
    tipo_documento: data.tipo_documento ?? null,
    alias: data.alias ?? null,
    cara: data.cara ?? null,
    pieza: data.pieza ?? null,
    forma_pago: data.forma_pago ?? null,
    cod_pago: data.cod_pago ?? null,
    origen: data.origen ?? null,
    arancelista: data.arancelista ?? null,
    cajero: data.cajero ?? null,
    total_cargo_afiliado: data.total_cargo_afiliado ?? null,
    matricula_profesional: data.matricula_profesional ?? null,
    profesional: data.profesional ?? null,
    entidad: data.entidad ?? null,
    responsable: data.responsable ?? null,
    // Correlación 3C: solo sobrescribimos turno_id si el form lo manda; así el
    // formulario de edición (que no lo conoce) NO borra un vínculo ya existente.
    ...(data.turno_id !== undefined ? { turno_id: data.turno_id } : {}),
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

  if (!esEstadoOrden(estado)) {
    return { error: 'Estado inválido' }
  }

  const NUCLEO_SEL =
    'estado, tipo, nro_comprobante, token_osep, fecha_emision, nro_afiliado, nro_documento, obra_social, nombre_practica, honorario_calculado'
  const { data: ordenActual } = await supabase
    .from('ordenes')
    .select(NUCLEO_SEL)
    .eq('id', ordenId)
    .eq('medico_id', user.id)
    .maybeSingle()
  if (!ordenActual) return { error: 'Orden no encontrada' }
  if (!transicionOrdenPermitida(ordenActual.estado as EstadoOrden, estado)) {
    return { error: `No se puede pasar de "${ordenActual.estado}" a "${estado}".` }
  }
  if (estado === 'presentada') {
    const { completa, faltantes } = evaluarCompletitud(ordenActual)
    if (!completa) {
      return { error: `Orden incompleta: faltan ${faltantes.length} datos. Completala antes de presentarla.` }
    }
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

export async function deleteOrden(ordenId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Una orden ya presentada no se borra: quedaría un hueco en la planilla presentada.
  const { data: ordenActual } = await supabase
    .from('ordenes')
    .select('estado')
    .eq('id', ordenId)
    .eq('medico_id', user.id)
    .maybeSingle()
  if (!ordenActual) return { error: 'Orden no encontrada' }
  if (ordenActual.estado !== 'borrador') {
    return { error: 'Solo se pueden eliminar órdenes en borrador. Esta orden ya fue presentada.' }
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

export async function resolverFaltantes(
  ordenId: string,
  campos: { firma_paciente?: boolean; firma_sello_medico?: boolean; diagnostico_cie10?: string },
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const update: Record<string, unknown> = {
    faltantes_confirmados_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  if (campos.firma_paciente !== undefined) update.firma_paciente = campos.firma_paciente
  if (campos.firma_sello_medico !== undefined) update.firma_sello_medico = campos.firma_sello_medico
  if (campos.diagnostico_cie10 !== undefined) update.diagnostico_cie10 = campos.diagnostico_cie10

  const { error } = await supabase
    .from('ordenes')
    .update(update)
    .eq('id', ordenId)
    .eq('medico_id', user.id)

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

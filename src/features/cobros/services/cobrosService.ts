import type { SupabaseClient } from '@supabase/supabase-js'
import type { Cobro, ConceptoCobro, MedioCobro } from '../types/cobros'

// Service con client inyectado (patrón recetasService): lo usan tanto las server
// actions del médico (client con RLS) como el webhook/check-in/bot (service-role).

const COLS =
  'id, medico_id, concepto, monto, medio, estado, orden_id, turno_id, sobreturno_id, ' +
  'paciente_nombre, paciente_dni, mp_preference_id, mp_payment_id, registrado_por, ' +
  'cobrado_at, created_at, updated_at'

export interface CrearCobroInput {
  medicoId: string
  concepto: ConceptoCobro
  monto: number
  medio: MedioCobro
  /** 'cobrado' para medios instantáneos en mano; 'pendiente' para link MP. */
  estado: 'pendiente' | 'cobrado'
  ordenId?: string | null
  turnoId?: string | null
  sobreturnoId?: string | null
  pacienteNombre?: string | null
  pacienteDni?: string | null
  registradoPor?: string | null
}

export async function crearCobro(db: SupabaseClient, input: CrearCobroInput): Promise<Cobro | null> {
  const { data, error } = await db
    .from('cobros')
    .insert({
      medico_id: input.medicoId,
      concepto: input.concepto,
      monto: input.monto,
      medio: input.medio,
      estado: input.estado,
      orden_id: input.ordenId ?? null,
      turno_id: input.turnoId ?? null,
      sobreturno_id: input.sobreturnoId ?? null,
      paciente_nombre: input.pacienteNombre ?? null,
      paciente_dni: input.pacienteDni ?? null,
      registrado_por: input.registradoPor ?? null,
      cobrado_at: input.estado === 'cobrado' ? new Date().toISOString() : null,
    })
    .select(COLS)
    .single()
  if (error) {
    console.error('[cobros] crearCobro:', error.message)
    return null
  }
  return data as unknown as Cobro
}

export async function getCobroById(
  db: SupabaseClient,
  medicoId: string,
  cobroId: string,
): Promise<Cobro | null> {
  const { data } = await db
    .from('cobros')
    .select(COLS)
    .eq('id', cobroId)
    .eq('medico_id', medicoId)
    .maybeSingle()
  return (data as Cobro | null) ?? null
}

/** Cobro VIVO (pendiente/cobrado) anclado a una orden. */
export async function getCobroVivoDeOrden(
  db: SupabaseClient,
  medicoId: string,
  ordenId: string,
): Promise<Cobro | null> {
  const { data } = await db
    .from('cobros')
    .select(COLS)
    .eq('medico_id', medicoId)
    .eq('orden_id', ordenId)
    .in('estado', ['pendiente', 'cobrado'])
    .maybeSingle()
  return (data as Cobro | null) ?? null
}

/** Cobro VIVO anclado a un turno o sobreturno (para check-in / bot / prellenado). */
export async function getCobroVivoDeTurno(
  db: SupabaseClient,
  medicoId: string,
  ref: { turnoId?: string; sobreturnoId?: string },
): Promise<Cobro | null> {
  let query = db.from('cobros').select(COLS).eq('medico_id', medicoId).in('estado', ['pendiente', 'cobrado'])
  if (ref.turnoId) query = query.eq('turno_id', ref.turnoId)
  else if (ref.sobreturnoId) query = query.eq('sobreturno_id', ref.sobreturnoId)
  else return null
  const { data } = await query.maybeSingle()
  return (data as Cobro | null) ?? null
}

/** Vincula un cobro suelto a su orden. Solo si aún no tiene orden (no re-ancla). */
export async function vincularOrden(
  db: SupabaseClient,
  medicoId: string,
  cobroId: string,
  ordenId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from('cobros')
    .update({ orden_id: ordenId, updated_at: new Date().toISOString() })
    .eq('id', cobroId)
    .eq('medico_id', medicoId)
    .is('orden_id', null)
    .select('id')
  if (error) {
    console.error('[cobros] vincularOrden:', error.message)
    return false
  }
  return (data?.length ?? 0) > 0
}

/**
 * pendiente → cobrado (webhook MP). Transición condicional por estado: si dos
 * webhooks compiten, gana uno solo (patrón reclamarEntrega de recetas).
 */
export async function marcarCobrado(
  db: SupabaseClient,
  medicoId: string,
  cobroId: string,
  mpPaymentId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from('cobros')
    .update({
      estado: 'cobrado',
      mp_payment_id: mpPaymentId,
      cobrado_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', cobroId)
    .eq('medico_id', medicoId)
    .eq('estado', 'pendiente')
    .select('id')
  if (error) {
    console.error('[cobros] marcarCobrado:', error.message)
    return false
  }
  return (data?.length ?? 0) > 0
}

/** Devolución/contracargo reportado por MP: el cobro deja de contar como plata. */
export async function marcarDevuelto(db: SupabaseClient, medicoId: string, cobroId: string): Promise<void> {
  await db
    .from('cobros')
    .update({ estado: 'devuelto', updated_at: new Date().toISOString() })
    .eq('id', cobroId)
    .eq('medico_id', medicoId)
    .in('estado', ['pendiente', 'cobrado'])
}

/** Solo se anulan cobros pendientes (un cobrado real no se borra: se devuelve). */
export async function anularCobro(db: SupabaseClient, medicoId: string, cobroId: string): Promise<boolean> {
  const { data } = await db
    .from('cobros')
    .update({ estado: 'anulado', updated_at: new Date().toISOString() })
    .eq('id', cobroId)
    .eq('medico_id', medicoId)
    .eq('estado', 'pendiente')
    .select('id')
  return (data?.length ?? 0) > 0
}

/** Actualiza monto (y opcionalmente la preferencia MP) de un cobro aún pendiente. */
export async function actualizarPendiente(
  db: SupabaseClient,
  medicoId: string,
  cobroId: string,
  cambios: { monto?: number; mpPreferenceId?: string | null },
): Promise<boolean> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (cambios.monto !== undefined) update.monto = cambios.monto
  if (cambios.mpPreferenceId !== undefined) update.mp_preference_id = cambios.mpPreferenceId
  const { data } = await db
    .from('cobros')
    .update(update)
    .eq('id', cobroId)
    .eq('medico_id', medicoId)
    .eq('estado', 'pendiente')
    .select('id')
  return (data?.length ?? 0) > 0
}

/** Actualiza el monto de un cobro cobrado en mano (NUNCA de uno mercadopago). */
export async function actualizarMontoEnMano(
  db: SupabaseClient,
  medicoId: string,
  cobroId: string,
  monto: number,
): Promise<boolean> {
  const { data } = await db
    .from('cobros')
    .update({ monto, updated_at: new Date().toISOString() })
    .eq('id', cobroId)
    .eq('medico_id', medicoId)
    .eq('estado', 'cobrado')
    .neq('medio', 'mercadopago')
    .select('id')
  return (data?.length ?? 0) > 0
}

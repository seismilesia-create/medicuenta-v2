'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { hoyArgentina } from '@/shared/lib/fechas'
import { getCierreGuardado, getResumenDia } from '@/features/cierre/services/cierreService'
import type { ResumenDia } from '@/lib/cierre/resumen'

// Cierre del día: MÉDICO-ONLY (el middleware bloquea /cierre a la secretaria y
// acá se opera con la sesión del médico — su RLS cubre todas las tablas).

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export interface CierreDia {
  resumen: ResumenDia
  cierre: { cerradoPor: string | null; automatico: boolean; updatedAt: string } | null
}

export async function getCierreDia(fecha: string): Promise<CierreDia | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }
  if (!fechaSchema.safeParse(fecha).success) return { error: 'Fecha inválida' }
  if (fecha > hoyArgentina()) return { error: 'Ese día todavía no ocurrió' }

  const [resumen, guardado] = await Promise.all([
    getResumenDia(supabase, user.id, fecha),
    getCierreGuardado(supabase, user.id, fecha),
  ])

  let cerradoPor: string | null = null
  if (guardado?.cerrado_por) {
    const { data: perfil } = await supabase
      .from('perfiles')
      .select('nombre, apellido')
      .eq('id', guardado.cerrado_por)
      .maybeSingle()
    cerradoPor = [perfil?.nombre, perfil?.apellido].filter(Boolean).join(' ') || 'alguien del consultorio'
  }

  return {
    resumen,
    cierre: guardado
      ? { cerradoPor, automatico: !guardado.cerrado_por, updatedAt: guardado.updated_at }
      : null,
  }
}

/** Persiste el snapshot del día (re-cerrar actualiza: el manual siempre manda). */
export async function cerrarDia(fecha: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }
  if (!fechaSchema.safeParse(fecha).success) return { error: 'Fecha inválida' }
  if (fecha > hoyArgentina()) return { error: 'Ese día todavía no ocurrió' }

  const resumen = await getResumenDia(supabase, user.id, fecha)
  const { error } = await supabase.from('cierres_dia').upsert(
    {
      medico_id: user.id,
      fecha,
      snapshot: resumen,
      total_honorarios: resumen.ordenes.honorariosTotal,
      total_plus: resumen.caja.plusTotal,
      total_mp: resumen.caja.porMedio.mercadopago,
      cerrado_por: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'medico_id,fecha' },
  )
  if (error) return { error: error.message }
  return { ok: true }
}

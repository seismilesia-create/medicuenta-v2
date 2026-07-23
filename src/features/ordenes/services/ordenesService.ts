import { createClient } from '@/lib/supabase/client'
import type { Orden, OrdenFilters, Prestacion } from '../types/ordenes'

const supabase = createClient()

export async function getOrdenes(filters?: OrdenFilters): Promise<Orden[]> {
  let query = supabase
    .from('ordenes')
    .select('*')
    .order('fecha_atencion', { ascending: false })

  if (filters?.tipo) {
    query = query.eq('tipo', filters.tipo)
  }
  if (filters?.obra_social) {
    query = query.eq('obra_social', filters.obra_social)
  }
  if (filters?.estado) {
    query = query.eq('estado', filters.estado)
  }
  if (filters?.fecha_desde) {
    query = query.gte('fecha_atencion', filters.fecha_desde)
  }
  if (filters?.fecha_hasta) {
    query = query.lte('fecha_atencion', filters.fecha_hasta)
  }
  if (filters?.busqueda) {
    query = query.ilike('nombre_paciente', `%${filters.busqueda}%`)
  }

  const { data, error } = await query

  if (error) throw error
  return data ?? []
}

export async function buscarPrestaciones(
  busqueda: string,
  obraSocial: string = 'OSEP'
): Promise<Prestacion[]> {
  const { data, error } = await supabase
    .from('prestaciones')
    .select('id, codigo, detalle, honorarios, gastos, total, seccion, categoria, obra_social')
    .eq('obra_social', obraSocial)
    .or(`codigo.ilike.%${busqueda}%,detalle.ilike.%${busqueda}%`)
    .limit(20)

  if (error) throw error
  return data ?? []
}

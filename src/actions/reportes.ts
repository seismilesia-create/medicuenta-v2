import { createClient } from '@/lib/supabase/server'
import { buildReportesData } from '@/features/reportes/lib/aggregations'
import { resolveRango } from '@/features/reportes/lib/filters'
import type {
  ReportesData,
  ReportesFilters,
  OrdenRow,
  CirugiaRow,
  DebitoRow,
} from '@/features/reportes/types/reportes'

export async function fetchReportesData(filters: ReportesFilters): Promise<ReportesData> {
  const supabase = await createClient()

  const [ordenesRes, cirugiasRes, debitosRes] = await Promise.all([
    supabase
      .from('ordenes')
      .select('estado, honorario_calculado, monto_particular, monto_plus, fecha_atencion, obra_social, agente_facturador, tipo'),
    supabase
      .from('cirugias')
      .select('estado, total_calculado, honorarios, gastos, fecha, obra_social, nivel, agente_facturador, institucion'),
    supabase
      .from('debitos')
      .select('monto, fecha, motivo, aplicado_por'),
  ])

  const ordenes = (ordenesRes.data ?? []) as OrdenRow[]
  const cirugias = (cirugiasRes.data ?? []) as CirugiaRow[]
  const debitos = (debitosRes.data ?? []) as DebitoRow[]

  const rango = resolveRango(filters)

  return buildReportesData(ordenes, cirugias, debitos, filters, rango)
}

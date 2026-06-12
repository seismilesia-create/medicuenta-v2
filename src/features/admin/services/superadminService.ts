import { createServiceClient } from '@/lib/supabase/server'
import { analizarCostos, type MedicoMetricas, type AnalisisCostos } from '@/lib/admin/costos'

/**
 * Lee las métricas de TODOS los médicos (cross-tenant) vía la función
 * SECURITY DEFINER cerrada a service_role. Solo se llama desde pages ya
 * guardadas por `resolverSuperadmin`. Devuelve el análisis (resumen + outliers).
 */
export async function getMedicosConMetricas(): Promise<AnalisisCostos> {
  const service = createServiceClient()
  const { data, error } = await service.rpc('superadmin_metricas_medicos')
  if (error) throw new Error(error.message)

  // bigint puede volver como string según el driver: lo forzamos a número.
  const rows: MedicoMetricas[] = (data ?? []).map((r: Record<string, unknown>) => ({
    medico_id: String(r.medico_id),
    nombre: (r.nombre as string | null) ?? null,
    apellido: (r.apellido as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    alta: (r.alta as string | null) ?? null,
    numero: (r.numero as string | null) ?? null,
    canal_estado: (r.canal_estado as string | null) ?? null,
    plan: (r.plan as string | null) ?? null,
    sub_estado: (r.sub_estado as string | null) ?? null,
    trial_ends_at: (r.trial_ends_at as string | null) ?? null,
    tokens_30d: Number(r.tokens_30d ?? 0),
    mensajes_pagos_30d: Number(r.mensajes_pagos_30d ?? 0),
    mensajes_salientes_30d: Number(r.mensajes_salientes_30d ?? 0),
    errores_7d: Number(r.errores_7d ?? 0),
    turnos_total: Number(r.turnos_total ?? 0),
  }))

  return analizarCostos(rows)
}

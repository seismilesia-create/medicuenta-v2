export interface OrdenPlanilla {
  id: string
  obra_social: string | null
  fecha_atencion: string
  honorario_calculado: number
  monto_plus: number
}

export interface GrupoPlanilla {
  obra_social: string
  periodo_mes: string // YYYY-MM-01
  ordenes: OrdenPlanilla[]
  monto_total: number
}

/** Primer día del mes de una fecha YYYY-MM-DD. */
export function periodoMesDe(fechaAtencion: string): string {
  return `${fechaAtencion.slice(0, 7)}-01`
}

/** Total de honorarios de la planilla. EXCLUYE monto_plus (es privado, no va al Círculo). */
export function totalHonorarios(ordenes: OrdenPlanilla[]): number {
  return ordenes.reduce((acc, o) => acc + Number(o.honorario_calculado), 0)
}

/** Agrupa órdenes por obra social. El período de cada grupo sale de la 1ª orden del grupo. */
export function agruparPorObraSocial(ordenes: OrdenPlanilla[]): GrupoPlanilla[] {
  const mapa = new Map<string, OrdenPlanilla[]>()
  for (const o of ordenes) {
    const os = o.obra_social ?? 'Otra'
    const arr = mapa.get(os) ?? []
    arr.push(o)
    mapa.set(os, arr)
  }
  return Array.from(mapa.entries()).map(([obra_social, ords]) => ({
    obra_social,
    periodo_mes: periodoMesDe(ords[0].fecha_atencion),
    ordenes: ords,
    monto_total: totalHonorarios(ords),
  }))
}

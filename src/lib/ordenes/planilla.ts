export interface OrdenPlanilla {
  id: string
  obra_social: string | null
  agente_facturador: string
  fecha_atencion: string
  honorario_calculado: number
  monto_plus: number
}

export interface GrupoPlanilla {
  obra_social: string
  agente_facturador: string
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

/** Agrupa órdenes en planillas por (obra social, período mensual, agente facturador). */
export function agruparParaPlanilla(ordenes: OrdenPlanilla[]): GrupoPlanilla[] {
  const mapa = new Map<string, OrdenPlanilla[]>()
  for (const o of ordenes) {
    const os = o.obra_social ?? 'Otra'
    const key = `${os}|||${periodoMesDe(o.fecha_atencion)}|||${o.agente_facturador}`
    const arr = mapa.get(key) ?? []
    arr.push(o)
    mapa.set(key, arr)
  }
  return Array.from(mapa.values()).map((ords) => ({
    obra_social: ords[0].obra_social ?? 'Otra',
    agente_facturador: ords[0].agente_facturador,
    periodo_mes: periodoMesDe(ords[0].fecha_atencion),
    ordenes: ords,
    monto_total: totalHonorarios(ords),
  }))
}

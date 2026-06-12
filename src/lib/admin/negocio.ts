/**
 * Foto del negocio para el panel del dueño (spec §5.2): distribución de médicos
 * por plan y por estado de suscripción. Puro y decidible (sin DB).
 */
import type { MedicoMetricas } from './costos'

export interface ResumenNegocio {
  total: number
  full: number
  basico: number
  enPrueba: number
  activos: number
  morosos: number
  suspendidos: number
}

export function resumenNegocio(medicos: MedicoMetricas[]): ResumenNegocio {
  const r: ResumenNegocio = {
    total: medicos.length,
    full: 0,
    basico: 0,
    enPrueba: 0,
    activos: 0,
    morosos: 0,
    suspendidos: 0,
  }
  for (const m of medicos) {
    if (m.plan === 'full') r.full++
    else r.basico++ // null/otro = básico (igual que normalizarPlan)

    switch (m.sub_estado) {
      case 'prueba':
        r.enPrueba++
        break
      case 'activa':
        r.activos++
        break
      case 'morosa':
        r.morosos++
        break
      case 'suspendida':
        r.suspendidos++
        break
    }
  }
  return r
}

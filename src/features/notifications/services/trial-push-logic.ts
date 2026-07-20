/**
 * Lógica PURA del push de la prueba (trial). Sin IO ni `server-only`, así se testea
 * directo (patrón del repo: `alertas.ts`/`semaforo.ts` puros, el IO va aparte).
 *
 * Dos avisos, SOLO al médico INACTIVO (el activo ya ve el chip/modal de
 * AvisosSuscripcion → no lo notificamos por push, evita redundancia). Cada uno una
 * sola vez (marca `push_*_at`), porque el cron corre a diario.
 */

const DIA_MS = 86_400_000

export const UMBRAL_INACTIVO_REENGANCHE_DIAS = 4
export const UMBRAL_INACTIVO_URGENCIA_DIAS = 2
export const VENTANA_REENGANCHE_DIAS = 8 // 1ª mitad de la prueba de 14 días

export type DecisionTrial = 'reenganche' | 'urgencia' | null

export interface SubTrial {
  trialEndsAt: string | null
  createdAt: string
  lastActiveAt: string | null
  pushReenganche: string | null
  pushUrgencia: string | null
}

/**
 * Decide qué push (si alguno) corresponde para una suscripción en prueba. Recibe el
 * `now` explícito (testeable).
 */
export function decidirPushTrial(sub: SubTrial, nowMs: number): DecisionTrial {
  if (!sub.trialEndsAt) return null
  const fin = new Date(sub.trialEndsAt).getTime()
  if (!Number.isFinite(fin)) return null

  const diasRestantes = Math.ceil((fin - nowMs) / DIA_MS)
  if (diasRestantes < 1) return null // ya vencida (la reconciliación la saca de 'prueba')

  const refActividad = new Date(sub.lastActiveAt ?? sub.createdAt).getTime()
  const inactivoDias = Number.isFinite(refActividad) ? (nowMs - refActividad) / DIA_MS : Infinity

  // Urgencia primero: rango disjunto del re-enganche, pero por las dudas gana.
  if (diasRestantes <= 3 && !sub.pushUrgencia && inactivoDias >= UMBRAL_INACTIVO_URGENCIA_DIAS) {
    return 'urgencia'
  }
  if (
    diasRestantes >= VENTANA_REENGANCHE_DIAS &&
    !sub.pushReenganche &&
    inactivoDias >= UMBRAL_INACTIVO_REENGANCHE_DIAS
  ) {
    return 'reenganche'
  }
  return null
}

export interface MensajeTrial {
  title: string
  body: string
  url: string
  tag: string
}

/** Redacta el push según la decisión y los días restantes. */
export function mensajeTrial(decision: Exclude<DecisionTrial, null>, diasRestantes: number): MensajeTrial {
  const dias = `${diasRestantes} día${diasRestantes === 1 ? '' : 's'}`
  if (decision === 'reenganche') {
    return {
      title: 'MediCuenta',
      body: `¡Te extrañamos! 🙌 Te quedan ${dias} de prueba, aprovechalos.`,
      url: '/asistente',
      tag: 'trial-reenganche',
    }
  }
  return {
    title: 'MediCuenta',
    body: `Te ${diasRestantes === 1 ? 'queda' : 'quedan'} ${dias} de prueba. Activá tu plan para no perder el acceso.`,
    url: '/plan',
    tag: 'trial-urgencia',
  }
}

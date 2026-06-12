/**
 * Candado de funciones por plan (spec dashboard §3). Puro y decidible: qué rutas
 * son exclusivas del plan Full. El plan lo resuelve el servidor (resolverConsultorio);
 * acá vive el criterio que usan el menú y los guards de página.
 *
 * Básico = facturación + asistente IA de facturación (rutas NO-Full).
 * Full    = todo lo anterior + consultorio/WhatsApp (estas rutas Full).
 */
export type Plan = 'basico' | 'full'

/** Duración de la prueba gratis (DD4). */
export const TRIAL_DIAS = 15

/** Prefijos de ruta exclusivos del plan Full (el ecosistema del asistente de WhatsApp). */
export const PREFIJOS_FULL = ['/agenda', '/conversaciones', '/pacientes', '/consultorio']

export function rutaEsFull(pathname: string): boolean {
  return PREFIJOS_FULL.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

/** ¿El plan puede acceder a esta ruta? Full puede todo; Básico, todo menos lo Full. */
export function puedeAcceder(plan: Plan, pathname: string): boolean {
  return plan === 'full' || !rutaEsFull(pathname)
}

/** Normaliza un valor crudo de plan a 'basico' por defecto (sin fila = básico). */
export function normalizarPlan(plan: string | null | undefined): Plan {
  return plan === 'full' ? 'full' : 'basico'
}

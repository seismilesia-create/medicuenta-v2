/**
 * Candado de funciones por plan (spec dashboard §3). Puro y decidible: qué rutas
 * son exclusivas del plan Full. El plan lo resuelve el servidor (resolverConsultorio);
 * acá vive el criterio que usan el menú y los guards de página.
 *
 * Básico = facturación + asistente IA de facturación (rutas NO-Full).
 * Full    = todo lo anterior + consultorio/WhatsApp (estas rutas Full).
 */
export type Plan = 'basico' | 'full'

/** Duración de la prueba gratis (DD4, redefinido por R1 del spec F4.3: era 15). */
export const TRIAL_DIAS = 14

/** A partir de acá el aviso de prueba deja de ser pasivo y pasa a modal insistente (R3). */
export const TRIAL_AVISO_URGENTE_DIAS = 4

const DIA_MS = 86_400_000

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

// ============================================================================
// Candado por ESTADO de la suscripción (spec F4.3 §5)
//
// Ojo: es OTRA cosa que el candado por plan. El plan dice QUÉ rutas ve; el
// estado dice SI entra. Un médico Full suspendido no entra a ningún lado.
// ============================================================================

export type EstadoSuscripcion = 'prueba' | 'activa' | 'morosa' | 'suspendida' | 'baja'

const ESTADOS: readonly string[] = ['prueba', 'activa', 'morosa', 'suspendida', 'baja']

/** Normaliza un estado crudo. Un valor desconocido NO abre la puerta: cae a 'suspendida'. */
export function normalizarEstado(estado: string | null | undefined): EstadoSuscripcion {
  return ESTADOS.includes(estado as string) ? (estado as EstadoSuscripcion) : 'suspendida'
}

export interface SuscripcionAcceso {
  estado: EstadoSuscripcion
  /** ISO. Solo lo mira el estado 'prueba'. */
  trialEndsAt: string | null
}

export type Acceso =
  | { acceso: 'total' }
  | { acceso: 'aviso'; motivo: 'trial_pasivo' | 'trial_urgente'; diasRestantes: number }
  | { acceso: 'aviso'; motivo: 'morosa' }
  | { acceso: 'bloqueado'; motivo: 'prueba_vencida' | 'suspendida' | 'baja' }

/**
 * ¿Este médico entra, entra con aviso, o no entra? Puro y decidible: recibe el `now`
 * en vez de leer el reloj (R4/R5 del spec F4.3).
 *
 * Se evalúa EN VIVO contra `trial_ends_at`, no se espera al cron (D1): el cron corre
 * 1×/día, así que delegarle el vencimiento regalaría hasta 24 h de acceso.
 *
 * `sub = null` (médico SIN fila en `suscripciones`) → **acceso total**. No es un
 * descuido: hoy el alta no crea la fila (agujero #2 del spec), así que hay médicos
 * reales sin ella. Bloquearlos acá los dejaría afuera de un día para el otro. La
 * fase 2 hace el backfill y el alta automática; recién ahí deja de existir el caso.
 */
/**
 * ¿Le tiramos el modal insistente de la prueba (R3)? Solo en los últimos días, y
 * UNA VEZ POR DÍA: uno por navegación sería intolerable, y uno por día insiste sin
 * volverse hostil.
 *
 * Puro a propósito: la regla se testea acá y el componente solo la obedece, así no
 * queda escondida adentro de un useEffect que nadie puede probar.
 *
 * @param ultimoVistoISO fecha 'YYYY-MM-DD' en que ya lo vio (null = nunca).
 * @param hoyISO fecha 'YYYY-MM-DD' de hoy.
 */
export function debeMostrarModalPrueba(
  acceso: Acceso,
  ultimoVistoISO: string | null,
  hoyISO: string,
): boolean {
  if (acceso.acceso !== 'aviso' || acceso.motivo !== 'trial_urgente') return false
  return ultimoVistoISO !== hoyISO
}

export function resolverAcceso(sub: SuscripcionAcceso | null, nowMs: number): Acceso {
  if (!sub) return { acceso: 'total' }

  switch (sub.estado) {
    case 'suspendida':
      return { acceso: 'bloqueado', motivo: 'suspendida' }
    case 'baja':
      return { acceso: 'bloqueado', motivo: 'baja' }
    case 'morosa':
      // Entra igual: MP todavía está reintentando el cobro (R5).
      return { acceso: 'aviso', motivo: 'morosa' }
    case 'activa':
      return { acceso: 'total' }
    case 'prueba': {
      const fin = sub.trialEndsAt ? Date.parse(sub.trialEndsAt) : NaN
      // 'prueba' sin fecha válida es un dato corrupto (setSuscripcion siempre la
      // escribe). Ante la duda, un paywall falla CERRADO.
      if (!Number.isFinite(fin) || nowMs >= fin) {
        return { acceso: 'bloqueado', motivo: 'prueba_vencida' }
      }
      // Acá fin > nowMs ⇒ diasRestantes >= 1. No usamos el `ceil(dias) < 0` de
      // alertas.ts: ceil(-0.08) es -0 y `-0 < 0` da false, o sea que una prueba
      // vencida hace horas se leería como vigente.
      const diasRestantes = Math.ceil((fin - nowMs) / DIA_MS)
      return diasRestantes <= TRIAL_AVISO_URGENTE_DIAS
        ? { acceso: 'aviso', motivo: 'trial_urgente', diasRestantes }
        : { acceso: 'aviso', motivo: 'trial_pasivo', diasRestantes }
    }
  }
}

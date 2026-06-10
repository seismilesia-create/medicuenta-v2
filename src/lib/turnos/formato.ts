/** Helpers puros de fecha/hora para el flujo de turnos (hora AR fija, sin DST vigente). */
import { AR_OFFSET, AR_TZ } from './slots'

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
const HORA_RE = /^\d{2}:\d{2}$/

/**
 * Combina fecha (YYYY-MM-DD) + hora (HH:MM o H:MM) en hora argentina → ISO UTC.
 * Devuelve null si el formato no es válido — el caller responde con instrucción
 * de reusar la fecha/hora EXACTAS de consultar_disponibilidad.
 */
export function armarStartsAtISO(fecha: string, hora: string): string | null {
  const f = fecha.trim()
  const hRaw = hora.trim()
  const h = /^\d:\d{2}$/.test(hRaw) ? `0${hRaw}` : hRaw
  if (!FECHA_RE.test(f) || !HORA_RE.test(h)) return null
  const d = new Date(`${f}T${h}:00${AR_OFFSET}`)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/** 'lunes, 15 de junio' (es-AR, hora argentina). */
export function fmtFechaLarga(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: AR_TZ,
  }).format(new Date(iso))
}

/** 'lunes 15/06' para listados compactos. */
export function fmtFechaCorta(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    timeZone: AR_TZ,
  }).format(new Date(iso))
}

/** 'HH:MM' de 24h en hora argentina. */
export function fmtHora(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: AR_TZ,
  }).format(new Date(iso))
}

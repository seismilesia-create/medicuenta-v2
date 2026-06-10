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
  // Anti-rollover: V8 convierte fechas inexistentes (29/2 no bisiesto, 31/6, '24:00')
  // en el día siguiente en silencio — y ese instante PUEDE ser un slot ofrecido de
  // otro día, así que el gate por instante no lo atraparía. Round-trip y rechazo.
  const vuelta = new Intl.DateTimeFormat('en-CA', { timeZone: AR_TZ }).format(d)
  if (vuelta !== f) return null
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

/** 'lunes 15-06' para listados compactos (separador '-' es el es-AR de ICU actual). */
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

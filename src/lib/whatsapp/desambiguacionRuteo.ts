/** Lógica pura de desambiguación de ruteo del bot (matcheo por apellido + parseo de respuestas). */

export interface MedicoNodo {
  medicoId: string
  nombre: string
  apellido: string
  especialidad: string | null
  matricula: string | null
}

/** TTL de una sesión de ruteo activa: tras esta inactividad, se re-pregunta el médico. */
export const RUTEO_TTL_MS = 4 * 60 * 60 * 1000 // 4 horas

/** minúsculas, sin acentos/diacríticos, espacios colapsados, trim. */
export function normalizarNombre(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// Prefijos de cortesía que el paciente puede anteponer y no son el apellido.
const PREFIJOS = new Set(['dr', 'dra', 'doctor', 'doctora', 'el', 'la', 'con'])

/** Médicos del nodo cuyo apellido matchea el texto ingresado (normalizado, tolerante a prefijos). */
export function matchApellido(texto: string, medicos: MedicoNodo[]): MedicoNodo[] {
  const q = normalizarNombre(texto)
  if (!q) return []
  const tokens = q.split(' ').filter((t) => t && !PREFIJOS.has(t))
  if (tokens.length === 0) return []
  return medicos.filter((m) => {
    const ap = normalizarNombre(m.apellido)
    if (!ap) return false
    return tokens.some((t) => ap.includes(t) || t.includes(ap))
  })
}

/** Etiqueta legible de un médico para las preguntas del bot. */
export function etiquetaMedico(m: MedicoNodo): string {
  const base = `${m.apellido}, ${m.nombre}`.trim()
  if (m.especialidad && m.especialidad.trim()) return `${base} — ${m.especialidad.trim()}`
  if (m.matricula && m.matricula.trim()) return `${base} (Mat. ${m.matricula.trim()})`
  return base
}

const SI = new Set(['si', 'sí', 'dale', 'ok', 'oka', 'correcto', 'mismo', 'sigo', 'ese', 'esa', 'confirmo', 'es'])
const NO = new Set(['no', 'otro', 'otra', 'diferente', 'distinto', 'distinta', 'cambiar', 'nel'])

/** Interpreta una respuesta de confirmación: 'si' | 'no' | 'ambiguo'. */
export function interpretarConfirmacion(texto: string): 'si' | 'no' | 'ambiguo' {
  const q = normalizarNombre(texto)
  if (!q) return 'ambiguo'
  const primera = q.split(' ')[0]
  if (SI.has(primera) || SI.has(q)) return 'si'
  if (NO.has(primera) || NO.has(q)) return 'no'
  return 'ambiguo'
}

/** Resuelve una selección entre candidatos: por número (1-based) o por nombre si desambigua a 1. */
export function interpretarSeleccion(texto: string, candidatos: MedicoNodo[]): MedicoNodo | null {
  const q = normalizarNombre(texto)
  const num = /^(\d+)$/.exec(q)
  if (num) {
    const idx = parseInt(num[1], 10) - 1
    return candidatos[idx] ?? null
  }

  // Try to match by nombre (first name)
  const porNombre = candidatos.filter((m) => {
    const nom = normalizarNombre(m.nombre)
    return nom === q
  })
  if (porNombre.length === 1) return porNombre[0]

  // Try to match by apellido (last name)
  const porApellido = matchApellido(texto, candidatos)
  if (porApellido.length === 1) return porApellido[0]

  return null
}

/** ¿La sesión activa venció? (diferencia de instantes; independiente de zona horaria). */
export function sesionVencida(lastActivityAtIso: string, nowMs: number, ttlMs: number): boolean {
  return nowMs - Date.parse(lastActivityAtIso) > ttlMs
}

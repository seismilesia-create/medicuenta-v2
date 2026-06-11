/**
 * Validación pura de identidad del paciente al reservar turnos.
 * La alarma de nombre NO bloquea: dispara una re-pregunta del bot; si el paciente
 * confirma la escritura, la reserva pasa igual (nombre_confirmado:"si" en la tool).
 */
import { normalizarDni } from '@/lib/recetas/normalizar'

const SOLO_LETRAS_RE = /^[\p{L}\s'.\-]+$/u
const VOCAL_RE = /[aeiouáéíóúü]/i

/** Devuelve el MOTIVO de sospecha de tipeo, o null si el nombre parece bien escrito. */
export function nombreSospechoso(nombre: string): string | null {
  const n = nombre.trim().replace(/\s+/g, ' ')
  if (n.length < 6) return 'es demasiado corto'
  if (!SOLO_LETRAS_RE.test(n)) return 'tiene números o símbolos'
  const palabras = n.split(' ')
  if (palabras.length < 2) return 'falta el apellido (se necesita nombre y apellido completos)'
  if (palabras.some((p) => p.replace(/[.'-]/g, '').length <= 1)) {
    return 'tiene iniciales sueltas en vez de la palabra completa'
  }
  if (palabras.some((p) => p.length >= 3 && !VOCAL_RE.test(p))) {
    return 'alguna palabra parece mal tipeada (sin vocales)'
  }
  return null
}

/** DNI argentino: 7 u 8 dígitos. Devuelve el DNI normalizado (solo dígitos) o null. */
export function dniNormalizadoValido(dni: string): string | null {
  const d = normalizarDni(dni)
  return d.length === 7 || d.length === 8 ? d : null
}

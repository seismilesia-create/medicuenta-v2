/**
 * Validación pura de identidad del paciente al reservar turnos.
 * La alarma de tipeo NO bloquea: dispara una re-pregunta del bot; si el paciente
 * confirma la escritura, la reserva pasa igual (nombre_confirmado:"si" en la tool).
 */
import { normalizarDni } from '@/lib/recetas/normalizar'

const SOLO_LETRAS_RE = /^[\p{L}\s'.\-]+$/u
const VOCAL_RE = /[aeiouáéíóúü]/i

/**
 * Devuelve el MOTIVO de sospecha de tipeo en UN campo (nombre O apellido por
 * separado — regla del dueño: se almacenan en columnas distintas), o null si
 * parece bien escrito. Acepta campos compuestos ("María José", "Gómez Paz").
 */
export function nombreSospechoso(valor: string): string | null {
  const n = valor.trim().replace(/\s+/g, ' ')
  if (n.length < 2) return 'es demasiado corto'
  if (!SOLO_LETRAS_RE.test(n)) return 'tiene números o símbolos'
  const palabras = n.split(' ')
  if (palabras.some((p) => p.replace(/[.'-]/g, '').length <= 1)) {
    return 'tiene iniciales sueltas en vez de la palabra completa'
  }
  if (palabras.some((p) => p.length >= 3 && !VOCAL_RE.test(p))) {
    return 'parece mal tipeado (palabras sin vocales)'
  }
  return null
}

/** DNI argentino: 7 u 8 dígitos. Devuelve el DNI normalizado (solo dígitos) o null. */
export function dniNormalizadoValido(dni: string): string | null {
  const d = normalizarDni(dni)
  return d.length === 7 || d.length === 8 ? d : null
}

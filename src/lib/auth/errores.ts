/**
 * Traduce los mensajes de error de Supabase Auth (GoTrue) al español, para no mostrarle
 * texto crudo en inglés a un médico. Función pura. El mensaje original se loguea en el
 * server (la action que llama) para no perder trazabilidad; acá devolvemos solo lo visible.
 */

/** Coincidencias exactas (case-insensitive) de los mensajes conocidos de GoTrue. */
const EXACTOS: Record<string, string> = {
  'invalid login credentials': 'Correo o contraseña incorrectos.',
  'email not confirmed': 'Tenés que confirmar tu correo antes de iniciar sesión. Revisá tu bandeja.',
  'user already registered': 'Ya existe una cuenta con ese correo.',
  'a user with this email address has already been registered':
    'Ya existe una cuenta con ese correo.',
  'password is known to be weak and easy to guess, please choose a different one.':
    'Esa contraseña es demasiado común o insegura. Elegí una diferente.',
  'password should be at least 6 characters.':
    'La contraseña debe tener al menos 6 caracteres.',
  'new password should be different from the old password.':
    'La nueva contraseña debe ser distinta de la anterior.',
  'signups not allowed for this instance':
    'El registro está deshabilitado. Contactá al administrador.',
  'unable to validate email address: invalid format':
    'El correo no tiene un formato válido.',
  'email address is invalid': 'El correo no tiene un formato válido.',
  'token has expired or is invalid':
    'El enlace expiró o no es válido. Pedí uno nuevo.',
}

/** Patrones para mensajes con parte variable (tiempos, contadores). */
const PATRONES: Array<{ re: RegExp; es: string }> = [
  { re: /rate limit|for security purposes|after \d+ seconds|only request this/i,
    es: 'Demasiados intentos. Esperá unos minutos y volvé a probar.' },
  { re: /at least (\d+) characters/i,
    es: 'La contraseña es demasiado corta.' },
  { re: /weak|easy to guess|pwned|known to be/i,
    es: 'Esa contraseña es demasiado común o insegura. Elegí una diferente.' },
]

const GENERICO = 'No se pudo completar la operación. Intentá de nuevo.'

export function traducirErrorAuth(mensaje: string | null | undefined): string {
  const raw = (mensaje ?? '').trim()
  if (!raw) return GENERICO
  const exacto = EXACTOS[raw.toLowerCase()]
  if (exacto) return exacto
  for (const { re, es } of PATRONES) {
    if (re.test(raw)) return es
  }
  return GENERICO
}

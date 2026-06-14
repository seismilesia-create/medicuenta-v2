// Lógica pura del link público de nodo (PRP-006, Fase 2). Sin efectos → testeable con vitest.
// Flujo: el paciente abre /c/<slug> → 302 a wa.me/<numero_nodo>?text=<saludo + [ID:slug]>.
// El [ID:slug] viaja SOLO en el 1.er mensaje; le dice al bot qué médico es (Fase 3 lo parsea).

/** Saludo pre-cargado que viaja en el ?text= del link, con el slug del médico embebido. */
export function construirSaludoConId(slug: string): string {
  return `Hola, quiero hacer una consulta [ID:${slug}]`
}

/** ¿El número del nodo es un E.164 usable? Descarta el placeholder del piloto y formatos inválidos. */
export function numeroNodoEsValido(numeroWhatsapp: string | null | undefined): boolean {
  if (!numeroWhatsapp) return false
  const digits = numeroWhatsapp.replace(/\D/g, '')
  return digits.length >= 8 && digits.length <= 15
}

/**
 * Construye la URL wa.me con el saludo + [ID:slug] URL-encodeado.
 * Devuelve null si el número del nodo todavía no es válido (p.ej. el placeholder del piloto).
 */
export function construirWaMeUrl(numeroWhatsapp: string, slug: string): string | null {
  if (!numeroNodoEsValido(numeroWhatsapp)) return null
  const digits = numeroWhatsapp.replace(/\D/g, '')
  const texto = construirSaludoConId(slug)
  return `https://wa.me/${digits}?text=${encodeURIComponent(texto)}`
}

// El marcador que viaja en el 1.er mensaje. NO global (evita el lastIndex de exec/replace).
const MARCADOR_ID = /\[ID:([a-zA-Z0-9_-]+)\]/

/** Extrae el slug del marcador [ID:slug] del texto entrante. null si no hay marcador (2.º msg en adelante). */
export function extraerIdSlug(text: string): string | null {
  const m = MARCADOR_ID.exec(text)
  return m ? m[1] : null
}

/** Quita el marcador [ID:...] del texto y normaliza espacios (para no ensuciar historial ni respuestas). */
export function limpiarMarcadorId(text: string): string {
  return text.replace(MARCADOR_ID, '').replace(/\s+/g, ' ').trim()
}

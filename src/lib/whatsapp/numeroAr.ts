/**
 * Normaliza un número de celular argentino al formato canónico con el que se guarda el
 * `numero_personal` del médico y con el que el ruteo del bot lo reconoce: `54` + 10 dígitos
 * nacionales (código de área + abonado), SIN el 9 de móvil, SIN el 15 local, SIN el 0 de trunk.
 *
 * El ruteo compara `normalizeRecipient(numero_personal) === normalizeRecipient(from_entrante)`.
 * El entrante llega como `549…`; normalizeRecipient lo pasa a `54…`. Por eso guardar el médico
 * como `54XXXXXXXXXX` matchea. Si se guardaba sin el 54 (o con 0/15), NO matcheaba → el bot lo
 * trataba como paciente (falla silenciosa). Este normalizador cierra esos casos, o devuelve null
 * para que el form muestre un error en vez de guardar un número roto.
 *
 * Funciones puras. Acepta lo que tipee el médico: con/sin +54, con/sin 9, con 0 de trunk, con 15.
 */

/** Devuelve `54XXXXXXXXXX` (canónico) o null si no se pudo interpretar como celular AR. */
export function normalizarWhatsappAr(raw: string | null | undefined): string | null {
  let d = (raw ?? '').replace(/\D/g, '')
  if (!d) return null

  if (d.startsWith('00')) d = d.slice(2) // prefijo de salida internacional
  if (d.startsWith('54')) d = d.slice(2) // código de país
  if (d.startsWith('0')) d = d.slice(1) // 0 de trunk (discado nacional)
  if (d.startsWith('9') && d.length >= 11) d = d.slice(1) // 9 de móvil (ningún área AR empieza en 9)

  // Nacional válido = 10 dígitos. Si quedan 12, lleva un 15 local tras el código de área
  // (2–4 dígitos): lo quitamos en la primera posición donde aparezca.
  if (d.length === 12) {
    for (const pos of [2, 3, 4]) {
      if (d.slice(pos, pos + 2) === '15') {
        d = d.slice(0, pos) + d.slice(pos + 2)
        break
      }
    }
  }

  if (d.length !== 10) return null
  return '54' + d
}

/** Parte nacional (10 dígitos) de un número, para mostrar en el input con el `+54` fijo aparte.
 *  Si el valor guardado normaliza, devuelve sus 10 dígitos; si no, los dígitos crudos (edición). */
export function nacionalDeWhatsappAr(raw: string | null | undefined): string {
  const n = normalizarWhatsappAr(raw)
  if (n) return n.slice(2)
  return (raw ?? '').replace(/\D/g, '')
}

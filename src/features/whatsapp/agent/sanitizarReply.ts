/** Cobro generado de verdad por la tool cobrar_receta (extraído de los tool results). */
export interface CobroGenerado {
  link: string
  monto: number
}

const MP_URL_RE = /https?:\/\/[^\s)]*mercadopago[^\s)]*/gi

/**
 * Borra los links de pago del HISTORIAL que ve el modelo: un link viejo no sirve
 * (vence / pudo ser inválido) y dejarlo a la vista invita al modelo a repetirlo
 * en vez de llamar a cobrar_receta. Se reemplaza por una marca neutra.
 */
export function scrubLinksMP(texto: string): string {
  return texto.replace(MP_URL_RE, '[link de pago anterior — ya no válido]')
}

/**
 * Barrera determinística para la plata: el paciente SOLO puede recibir links de
 * pago que haya devuelto la tool cobrar_receta en este turno. Si el modelo
 * inventó un link (o lo deformó), se reemplaza la respuesta:
 * - sin cobro real + link en el texto → mensaje fail-closed (no se manda el link trucho)
 * - con cobro real pero link ausente/distinto → mensaje determinístico con el link REAL
 */
export function sanitizarReplyCobro(texto: string, cobros: CobroGenerado[]): string {
  const urls = texto.match(MP_URL_RE) ?? []

  if (cobros.length === 0) {
    if (urls.length === 0) return texto
    return 'Encontré tu receta, pero tuve un problema para generar el link de pago. Escribime "quiero pagar mi receta" y lo intento de nuevo 🙏'
  }

  const ultimo = cobros[cobros.length - 1]
  const todasReales =
    urls.length > 0 && urls.every((u) => cobros.some((c) => c.link.startsWith(u) || u.startsWith(c.link)))
  if (todasReales) return texto

  return `Tu receta cuesta $${ultimo.monto.toLocaleString('es-AR')}. Pagá acá: ${ultimo.link}\nApenas se acredite el pago te la mando por acá 📄`
}

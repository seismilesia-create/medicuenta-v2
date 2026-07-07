/** Estado visual de un campo autopoblado por OCR en el form de la orden. */
export type EstadoCampoOcr = 'ok' | 'dudoso' | 'no_encontrado'

/**
 * no_encontrado (no se leyó → cargar a mano, rojo) tiene prioridad sobre
 * dudoso (leído con baja confianza → verificá, ámbar).
 */
export function estadoCampoOcr(
  campo: string,
  noEncontrados: string[],
  dudosos: string[],
): EstadoCampoOcr {
  if (noEncontrados.includes(campo)) return 'no_encontrado'
  if (dudosos.includes(campo)) return 'dudoso'
  return 'ok'
}

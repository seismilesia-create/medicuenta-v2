/** Resolución pura de "qué servicio quiere el paciente" a partir del catálogo del médico. */

export interface ServicioLite {
  id: string
  nombre: string
  duracion_min: number
  precio: number | null
  activo: boolean
}

export type ResultadoServicio =
  | { tipo: 'ok'; servicio: ServicioLite }
  | { tipo: 'elegir'; opciones: ServicioLite[] }
  | { tipo: 'ninguno' }

/** ' consulta de control ' — minúsculas, separadores colapsados, con bordes de palabra. */
function tokens(s: string): string {
  return ` ${s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `
}

export function resolverServicio(servicios: ServicioLite[], query: string): ResultadoServicio {
  // nombre vacío sería un matcheador universal en la dirección q.includes(nombre)
  const activos = servicios.filter((s) => s.activo && s.nombre.trim())
  if (activos.length === 0) return { tipo: 'ninguno' }

  const q = query.trim().toLowerCase()
  if (q) {
    const exacto = activos.find((s) => s.nombre.toLowerCase() === q)
    if (exacto) return { tipo: 'ok', servicio: exacto }
    // Parcial: el nombre contiene lo tipeado, o lo tipeado contiene el nombre como
    // palabra(s) completa(s) — sin bordes, "Eco" matchearía adentro de "reconocen".
    const parciales = activos.filter(
      (s) => s.nombre.toLowerCase().includes(q) || tokens(q).includes(tokens(s.nombre)),
    )
    // Ambiguo (p.ej. "Consulta" y "Consulta de control") → que el paciente elija;
    // resolver por orden de fila reservaría el servicio equivocado en silencio.
    if (parciales.length === 1) return { tipo: 'ok', servicio: parciales[0] }
    if (parciales.length > 1) return { tipo: 'elegir', opciones: parciales }
  }
  // Sin query (o sin match): si ofrece una sola cosa, es esa; si no, que elija.
  if (activos.length === 1) return { tipo: 'ok', servicio: activos[0] }
  return { tipo: 'elegir', opciones: activos }
}

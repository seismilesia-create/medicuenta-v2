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

export function resolverServicio(servicios: ServicioLite[], query: string): ResultadoServicio {
  const activos = servicios.filter((s) => s.activo)
  if (activos.length === 0) return { tipo: 'ninguno' }

  const q = query.trim().toLowerCase()
  if (q) {
    const exacto = activos.find((s) => s.nombre.toLowerCase() === q)
    if (exacto) return { tipo: 'ok', servicio: exacto }
    const parcial = activos.find(
      (s) => s.nombre.toLowerCase().includes(q) || q.includes(s.nombre.toLowerCase()),
    )
    if (parcial) return { tipo: 'ok', servicio: parcial }
  }
  // Sin query (o sin match): si ofrece una sola cosa, es esa; si no, que elija.
  if (activos.length === 1) return { tipo: 'ok', servicio: activos[0] }
  return { tipo: 'elegir', opciones: activos }
}

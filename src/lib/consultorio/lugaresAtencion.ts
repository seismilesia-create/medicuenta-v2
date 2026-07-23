import { weekdayOf } from '@/lib/turnos/slots'
import { formatearDias } from './diasSemana'

export interface LugarAtencion {
  id: string
  nombre: string
  direccion: string | null
  consultorio: string | null
  piso: string | null
  /** Días de la semana en que atiende ahí: 0=domingo .. 6=sábado. */
  dias: number[]
}

/** Paréntesis con lo que ayuda a ubicarse dentro del edificio: "(consultorio 54, 1er piso)". */
function detalle(l: LugarAtencion): string {
  const partes = [l.consultorio ? `consultorio ${l.consultorio}` : null, l.piso].filter(Boolean)
  return partes.length ? ` (${partes.join(', ')})` : ''
}

/** "Sanatorio Pasteur, República 764 (consultorio 54, 1er piso) — Lun, Mié y Vie" */
export function formatearLugar(l: LugarAtencion): string {
  const cabeza = [l.nombre, l.direccion].filter(Boolean).join(', ')
  const dias = formatearDias(l.dias)
  return `${cabeza}${detalle(l)}${dias ? ` — ${dias}` : ''}`
}

/** Bloque de bullets para el mensaje de WhatsApp. '' si no hay lugares cargados. */
export function listaLugaresTexto(lugares: LugarAtencion[]): string {
  return lugares.map((l) => `• ${formatearLugar(l)}`).join('\n')
}

/** Una línea compacta para inyectar en el system prompt. '' si no hay lugares cargados. */
export function resumenLugaresLinea(lugares: LugarAtencion[]): string {
  return lugares
    .map((l) => {
      const dias = formatearDias(l.dias)
      const cabeza = [l.nombre, l.direccion, l.consultorio ? `consultorio ${l.consultorio}` : null, l.piso]
        .filter(Boolean)
        .join(', ')
      return dias ? `${cabeza} (${dias})` : cabeza
    })
    .join(' · ')
}

/** Lugares donde atiende una fecha concreta (YYYY-MM-DD, día de semana en hora AR). */
export function lugaresDelDia(lugares: LugarAtencion[], fechaISO: string): LugarAtencion[] {
  const wd = weekdayOf(fechaISO)
  return lugares.filter((l) => l.dias.includes(wd))
}

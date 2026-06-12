'use client'

import type { ItemDia } from '@/lib/consultorio/armarDia'
import type { JornadaDia } from '@/features/consultorio/services/panelService'
import { minutosAR } from '@/lib/consultorio/calendario'
import { arDateString } from '@/lib/turnos/slots'
import { fmtHora } from '@/lib/turnos/formato'

export type TurnoItem = Extract<ItemDia, { tipo: 'turno' }>
type LibreItem = Extract<ItemDia, { tipo: 'libre' }>

export const PX_POR_MIN_NORMAL = 1.6
export const PX_POR_MIN_COMPACTO = 1.1

/** Rango del timeline redondeado a horas completas (compartido con la regla de la semana). */
export function rangoRedondeado(j: JornadaDia): { desdeMin: number; hastaMin: number } {
  return { desdeMin: Math.floor(j.desdeMin / 60) * 60, hastaMin: Math.ceil(j.hastaMin / 60) * 60 }
}

const ESTADO_BLOQUE: Record<string, string> = {
  proximo: 'bg-blue-500/10 border-blue-500 text-blue-700 dark:text-blue-300 hover:bg-blue-500/20',
  atendido: 'bg-emerald-500/10 border-emerald-500 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20',
  no_vino: 'bg-red-500/10 border-red-500 text-red-600 dark:text-red-400 hover:bg-red-500/20',
}

interface Posicionado {
  item: TurnoItem
  ini: number
  fin: number
  col: number
  cols: number
}

/** Columnas por cluster de solape (greedy): el caso normal es 1 columna a todo el ancho. */
function posicionarTurnos(turnos: TurnoItem[]): Posicionado[] {
  const out: Posicionado[] = []
  let cluster: Posicionado[] = []
  let clusterFin = -1
  const cerrar = () => {
    const n = Math.max(...cluster.map((c) => c.col)) + 1
    for (const c of cluster) c.cols = n
    out.push(...cluster)
    cluster = []
  }
  for (const item of turnos) {
    const ini = minutosAR(item.turno.starts_at)
    const fin = Math.max(ini + 5, minutosAR(item.turno.ends_at))
    if (cluster.length > 0 && ini >= clusterFin) cerrar()
    const ocupadas = cluster.filter((c) => c.fin > ini).map((c) => c.col)
    let col = 0
    while (ocupadas.includes(col)) col++
    cluster.push({ item, ini, fin, col, cols: 1 })
    clusterFin = Math.max(clusterFin, fin)
  }
  if (cluster.length > 0) cerrar()
  return out
}

interface TimelineDiaProps {
  fecha: string
  items: ItemDia[]
  jornada: JornadaDia
  duracionMin: number
  /** Vista semana: bloques mínimos (solo apellido), franjas libres sin texto. */
  compacto?: boolean
  /** Ocultar la regla de horas (en semana la dibuja una sola columna compartida). */
  sinHoras?: boolean
  onSlotClick: (fecha: string, hora: string) => void
  onTurnoClick: (item: TurnoItem) => void
}

export function TimelineDia({
  fecha,
  items,
  jornada,
  duracionMin,
  compacto = false,
  sinHoras = false,
  onSlotClick,
  onTurnoClick,
}: TimelineDiaProps) {
  const pxPorMin = compacto ? PX_POR_MIN_COMPACTO : PX_POR_MIN_NORMAL
  const { desdeMin, hastaMin } = rangoRedondeado(jornada)
  const alto = (hastaMin - desdeMin) * pxPorMin
  const top = (min: number) => (min - desdeMin) * pxPorMin

  const horas: number[] = []
  for (let h = desdeMin; h <= hastaMin; h += 60) horas.push(h)

  const turnos = posicionarTurnos(items.filter((i): i is TurnoItem => i.tipo === 'turno'))
  const libres = items.filter((i): i is LibreItem => i.tipo === 'libre')

  const esHoy = fecha === arDateString(Date.now(), 0)
  const ahoraMin = esHoy ? minutosAR(new Date().toISOString()) : null

  return (
    <div className={`relative ${sinHoras ? '' : 'pl-14'}`} style={{ height: alto }}>
      {/* Regla de horas */}
      {horas.map((min) => (
        <div key={min} className="absolute inset-x-0 border-t border-border/50" style={{ top: top(min) }}>
          {!sinHoras && (
            <span className="absolute -left-14 -top-2 w-12 pr-2 text-right text-[11px] tabular-nums text-[var(--color-muted-foreground)]">
              {`${String(Math.floor(min / 60)).padStart(2, '0')}:00`}
            </span>
          )}
        </div>
      ))}

      {/* Huecos ofrecidos por el asistente (decisión del dueño: visibles, no espacio mudo) */}
      {libres.map((slot) => {
        const ini = minutosAR(slot.startsAt)
        return (
          <button
            key={`libre-${slot.startsAt}`}
            onClick={() => onSlotClick(fecha, slot.label)}
            title={`Dar turno ${slot.label}`}
            className="absolute inset-x-0.5 rounded-md border border-dashed border-primary/35 text-[11px] text-[var(--color-muted-foreground)] opacity-70 hover:opacity-100 hover:bg-primary/10 transition flex items-center justify-center"
            style={{ top: top(ini) + 1, height: Math.max(duracionMin * pxPorMin - 2, 12) }}
          >
            {!compacto && <span>{slot.label} · libre</span>}
          </button>
        )
      })}

      {/* Turnos */}
      {turnos.map(({ item, ini, fin, col, cols }) => {
        const nombre =
          [item.turno.paciente_apellido, item.turno.paciente_nombre].filter(Boolean).join(', ') ||
          item.turno.paciente_telefono ||
          '(sin datos)'
        const altoBloque = Math.max((fin - ini) * pxPorMin - 2, 16)
        return (
          <button
            key={item.turno.id}
            onClick={() => onTurnoClick(item)}
            className={`absolute rounded-lg border-l-4 px-2 py-0.5 text-left text-xs shadow-sm overflow-hidden transition ${
              ESTADO_BLOQUE[item.estadoEfectivo] ?? 'bg-[var(--color-muted)] border-border'
            }`}
            style={{
              top: top(ini) + 1,
              height: altoBloque,
              left: `calc(${(col / cols) * 100}% + 2px)`,
              width: `calc(${100 / cols}% - 4px)`,
            }}
          >
            <span className="font-semibold block truncate leading-tight">
              {compacto ? item.turno.paciente_apellido || nombre : `${fmtHora(item.turno.starts_at)} ${nombre}`}
            </span>
            {!compacto && altoBloque >= 34 && (
              <span className="block truncate text-[11px] opacity-75 leading-tight">
                {[item.turno.paciente_obra_social, item.turno.origen === 'panel' ? 'a mano' : null]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
          </button>
        )
      })}

      {/* Línea "ahora" (solo hoy, dentro de la jornada) */}
      {ahoraMin !== null && ahoraMin >= desdeMin && ahoraMin <= hastaMin && (
        <div className="absolute inset-x-0 z-10 pointer-events-none" style={{ top: top(ahoraMin) }}>
          <div className="relative border-t-2 border-red-500">
            <span className="absolute -left-1.5 -top-[5px] w-2 h-2 rounded-full bg-red-500" />
          </div>
        </div>
      )}
    </div>
  )
}

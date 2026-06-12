'use client'

import type { DiaMesContador } from '@/features/consultorio/services/panelService'
import { gridMes } from '@/lib/consultorio/calendario'
import { arDateString } from '@/lib/turnos/slots'

const DIAS_CORTOS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

interface Props {
  anio: number
  mes: number // 1-12
  contadores: DiaMesContador[]
  onDiaClick: (fecha: string) => void
}

/** Grilla mensual estilo GCal: contadores por día; click en un día abre la vista día. */
export function VistaMes({ anio, mes, contadores, onDiaClick }: Props) {
  const grid = gridMes(anio, mes)
  const porFecha = new Map(contadores.map((c) => [c.fecha, c]))
  const claveMes = `${anio}-${String(mes).padStart(2, '0')}`
  const hoy = arDateString(Date.now(), 0)

  return (
    <div className="rounded-2xl border border-border overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border bg-[var(--color-muted)]/20 text-center text-[11px] text-[var(--color-muted-foreground)]">
        {DIAS_CORTOS.map((d) => (
          <div key={d} className="py-1.5 border-l border-border/50 first:border-l-0">
            {d}
          </div>
        ))}
      </div>
      {grid.map((semana, i) => (
        <div key={i} className="grid grid-cols-7 border-t border-border/50 first:border-t-0">
          {semana.map((fecha) => {
            const c = porFecha.get(fecha)
            const delMes = fecha.startsWith(claveMes)
            return (
              <button
                key={fecha}
                onClick={() => onDiaClick(fecha)}
                title="Abrir el día"
                className={`min-h-[5.5rem] p-1.5 border-l border-border/50 first:border-l-0 text-left align-top space-y-1 hover:bg-primary/5 transition ${
                  delMes ? '' : 'opacity-40'
                } ${c?.bloqueado ? 'bg-[var(--color-muted)]/30' : ''}`}
              >
                <span
                  className={`inline-flex items-center justify-center w-6 h-6 text-xs font-semibold rounded-full ${
                    fecha === hoy ? 'bg-primary text-white' : ''
                  }`}
                >
                  {Number(fecha.slice(8))}
                </span>
                {c && c.turnos > 0 && (
                  <span className="block w-fit max-w-full truncate text-[10px] px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-300 font-medium">
                    {c.turnos} {c.turnos === 1 ? 'turno' : 'turnos'}
                  </span>
                )}
                {c && c.sobreturnos > 0 && (
                  <span className="block w-fit max-w-full truncate text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 font-medium">
                    +{c.sobreturnos} sobret.
                  </span>
                )}
                {c?.bloqueado && (
                  <span className="block text-[10px] uppercase text-[var(--color-muted-foreground)]">bloqueado</span>
                )}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

'use client'

import { CalendarOff } from 'lucide-react'
import type { AgendaSemana } from '@/features/consultorio/services/panelService'
import { arDateString } from '@/lib/turnos/slots'
import { TimelineDia, rangoRedondeado, PX_POR_MIN_COMPACTO, type TurnoItem } from './timeline-dia'

const DIAS_CORTOS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

interface Props {
  semana: AgendaSemana
  onDiaClick: (fecha: string) => void
  onSlotClick: (fecha: string, hora: string) => void
  onTurnoClick: (item: TurnoItem) => void
}

/** Grilla semanal L→D estilo GCal: escala de jornada compartida, sobreturnos como chip por día. */
export function VistaSemana({ semana, onDiaClick, onSlotClick, onTurnoClick }: Props) {
  const jornada = semana.jornada
  if (!jornada) {
    return (
      <div className="rounded-2xl border border-border p-6 text-sm text-[var(--color-muted-foreground)] flex items-center gap-2">
        <CalendarOff className="w-4 h-4" /> Semana sin atención ni turnos.
      </div>
    )
  }

  const { desdeMin, hastaMin } = rangoRedondeado(jornada)
  const alto = (hastaMin - desdeMin) * PX_POR_MIN_COMPACTO
  const horas: number[] = []
  for (let h = desdeMin; h <= hastaMin; h += 60) horas.push(h)
  const hoy = arDateString(Date.now(), 0)

  return (
    <div className="rounded-2xl border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          {/* Cabecera de días */}
          <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] border-b border-border bg-[var(--color-muted)]/20">
            <div />
            {semana.dias.map((d, i) => (
              <button
                key={d.fecha}
                onClick={() => onDiaClick(d.fecha)}
                title="Abrir el día"
                className={`px-1 py-2 text-center border-l border-border/50 hover:bg-primary/5 transition ${
                  d.cerrado || d.bloqueado ? 'opacity-60' : ''
                }`}
              >
                <span className="block text-[11px] text-[var(--color-muted-foreground)]">{DIAS_CORTOS[i]}</span>
                <span
                  className={`inline-flex items-center justify-center w-7 h-7 text-sm font-semibold rounded-full ${
                    d.fecha === hoy ? 'bg-primary text-white' : ''
                  }`}
                >
                  {Number(d.fecha.slice(8))}
                </span>
                <span className="block min-h-4 text-[10px] leading-4">
                  {d.bloqueado ? (
                    <span className="text-[var(--color-muted-foreground)] uppercase">bloqueado</span>
                  ) : d.sobreturnos > 0 ? (
                    <span className="text-amber-600 font-medium">
                      +{d.sobreturnos} sobret.
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>

          {/* Cuerpo: regla de horas + 7 columnas */}
          <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))]">
            <div className="relative" style={{ height: alto }}>
              {horas.map((min) => (
                <span
                  key={min}
                  className="absolute right-1 -translate-y-1/2 text-[10px] tabular-nums text-[var(--color-muted-foreground)]"
                  style={{ top: (min - desdeMin) * PX_POR_MIN_COMPACTO }}
                >
                  {`${String(Math.floor(min / 60)).padStart(2, '0')}:00`}
                </span>
              ))}
            </div>
            {semana.dias.map((d) => (
              <div
                key={d.fecha}
                className={`border-l border-border/50 ${
                  d.cerrado || d.bloqueado ? 'bg-[var(--color-muted)]/30' : ''
                }`}
              >
                <TimelineDia
                  fecha={d.fecha}
                  items={d.items}
                  jornada={jornada}
                  duracionMin={semana.duracionMin}
                  compacto
                  sinHoras
                  onSlotClick={onSlotClick}
                  onTurnoClick={onTurnoClick}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

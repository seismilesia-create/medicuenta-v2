'use client'

import { CalendarOff } from 'lucide-react'
import type { DiaAgenda } from '@/features/consultorio/services/panelService'
import { setEstadoSobreturno, desbloquearDias } from '@/actions/consultorio-agenda'
import { marcarCheckin } from '@/actions/consultorio-checkin'
import { arDateString } from '@/lib/turnos/slots'
import { fmtHora } from '@/lib/turnos/formato'
import { TimelineDia, type TurnoItem } from './timeline-dia'

interface Props {
  fecha: string
  dia: DiaAgenda
  onSlotClick: (fecha: string, hora: string) => void
  onTurnoClick: (item: TurnoItem) => void
  onAccion: (fn: () => Promise<{ error?: string } | { ok: true }>) => Promise<void>
  onNuevoSobreturno: () => void
  onBloquearDia: () => void
}

/** Timeline del día + panel de sobreturnos al costado (pedido explícito del dueño: sin horario). */
export function VistaDia({ fecha, dia, onSlotClick, onTurnoClick, onAccion, onNuevoSobreturno, onBloquearDia }: Props) {
  return (
    <div className="grid gap-4 lg:grid-cols-[7fr_3fr]">
      <div className="rounded-2xl border border-border p-4 space-y-3">
        {dia.bloqueado && (
          <div className="p-3 rounded-lg text-sm bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 flex flex-wrap items-center gap-2">
            <CalendarOff className="w-4 h-4 shrink-0" />
            <span className="flex-1">
              Día bloqueado{dia.bloqueado.nota ? ` — ${dia.bloqueado.nota}` : ''}. El asistente no ofrece turnos.
            </span>
            <button
              className="underline text-xs"
              onClick={() => {
                const id = dia.bloqueado!.id
                if (window.confirm('¿Quitar el bloqueo de este día?')) onAccion(() => desbloquearDias(id))
              }}
            >
              Quitar bloqueo
            </button>
          </div>
        )}
        {dia.particular && !dia.bloqueado && (
          <div className="p-3 rounded-lg text-sm bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/30 flex items-center gap-2">
            <span className="flex-1">Día particular. El asistente le avisa al paciente que se atiende de forma particular.</span>
          </div>
        )}
        {dia.jornada ? (
          <TimelineDia
            fecha={fecha}
            items={dia.items}
            jornada={dia.jornada}
            duracionMin={dia.duracionMin}
            onSlotClick={onSlotClick}
            onTurnoClick={onTurnoClick}
          />
        ) : (
          <p className="text-sm text-[var(--color-muted-foreground)] flex items-center gap-2 py-2">
            <CalendarOff className="w-4 h-4" />
            {dia.cerrado
              ? 'Día sin atención (sin horario cargado para este día de la semana).'
              : 'Sin turnos ni huecos para mostrar.'}
          </p>
        )}
      </div>

      {/* Sobreturnos del día (lista sin hora, siempre visible) */}
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3 h-fit">
        <h2 className="text-sm font-semibold text-amber-600">SOBRETURNOS ({dia.sobreturnos.length})</h2>
        {dia.sobreturnos.map((s) => (
          <div key={s.id} className="rounded-xl bg-amber-500/10 p-3 text-sm space-y-1">
            <p className="font-medium">
              {s.paciente_apellido}, {s.paciente_nombre}
              {s.paciente_dni ? ` · DNI ${s.paciente_dni}` : ''}
            </p>
            <p className="text-xs font-bold text-amber-600 uppercase">
              {s.cobro === 'sin_cargo' ? 'Sin cargo' : 'Particular efectivo'}
              {s.notas ? ` — ${s.notas}` : ''}
            </p>
            {s.checkin_at && (
              <p className="text-xs font-medium text-emerald-600">🟢 En sala desde las {fmtHora(s.checkin_at)}</p>
            )}
            {s.estado === 'pendiente' ? (
              <div className="flex gap-3 text-xs">
                {!s.checkin_at && fecha === arDateString(Date.now(), 0) && (
                  <button
                    className="underline text-emerald-600"
                    onClick={() => onAccion(() => marcarCheckin({ tipo: 'sobreturno', id: s.id, deshacer: false }))}
                  >
                    🚪 llegó
                  </button>
                )}
                <button className="underline" onClick={() => onAccion(() => setEstadoSobreturno(s.id, 'atendido'))}>
                  ✓ atendido
                </button>
                <button className="underline" onClick={() => onAccion(() => setEstadoSobreturno(s.id, 'no_vino'))}>
                  ✗ no vino
                </button>
                <button
                  className="underline text-red-500"
                  onClick={() => onAccion(() => setEstadoSobreturno(s.id, 'cancelado'))}
                >
                  cancelar
                </button>
              </div>
            ) : (
              <p className="text-xs">{s.estado === 'atendido' ? '✓ atendido' : '✗ no vino'}</p>
            )}
          </div>
        ))}
        <button
          onClick={onNuevoSobreturno}
          className="w-full border border-dashed border-amber-500/50 text-amber-600 rounded-xl py-2 text-sm font-medium"
        >
          + Sobreturno
        </button>
        {!dia.bloqueado && (
          <button onClick={onBloquearDia} className="w-full text-xs underline text-[var(--color-muted-foreground)]">
            <CalendarOff className="w-3 h-3 inline mr-1" />
            Bloquear este día
          </button>
        )}
      </div>
    </div>
  )
}

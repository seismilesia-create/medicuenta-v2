'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Plus, CalendarOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getSemana, getDia, type DiaSemana, type DiaAgenda } from '@/features/consultorio/services/panelService'
import { cancelarTurnoPanel, marcarAsistencia, setEstadoSobreturno, bloquearDias } from '@/actions/consultorio-agenda'
import { fmtHora, fmtFechaLarga } from '@/lib/turnos/formato'
import { AR_OFFSET, arDateString } from '@/lib/turnos/slots'
import { TurnoManualForm } from './turno-manual-form'
import { SobreturnoForm } from './sobreturno-form'

const POLL_MS = 15_000

const ESTADO_CHIP: Record<string, { label: string; cls: string }> = {
  proximo: { label: 'próximo', cls: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  atendido: { label: '✓ atendido', cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  no_vino: { label: '✗ no vino', cls: 'bg-red-500/10 text-red-500 border-red-500/20' },
}

export function AgendaView({ medicoId }: { medicoId: string }) {
  const [fecha, setFecha] = useState(() => arDateString(Date.now(), 0))
  const [semana, setSemana] = useState<DiaSemana[]>([])
  const [dia, setDia] = useState<DiaAgenda | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [slotElegido, setSlotElegido] = useState<{ fecha: string; hora: string } | null>(null)
  const [sobreturnoOpen, setSobreturnoOpen] = useState(false)
  const seq = useRef(0)

  const refetch = useCallback(async () => {
    const id = ++seq.current
    const supabase = createClient()
    try {
      const [s, d] = await Promise.all([getSemana(supabase, medicoId), getDia(supabase, medicoId, fecha)])
      if (id !== seq.current) return
      setSemana(s)
      setDia(d)
      setError(null)
    } catch {
      if (id !== seq.current) return
      setError('No pude cargar la agenda. Reintentando…')
    }
    if (id !== seq.current) return
    setLoading(false)
  }, [medicoId, fecha])

  useEffect(() => {
    setLoading(true)
    refetch()
    const t = setInterval(refetch, POLL_MS)
    return () => clearInterval(t)
  }, [refetch])

  async function onAccion(fn: () => Promise<{ error?: string } | { ok: true }>) {
    // El refetch borra errores obsoletos con setError(null) en su rama éxito.
    // El error de la acción se pone DESPUÉS para que persista (el poll de 15s
    // lo borrará si el siguiente refetch es exitoso — comportamiento aceptable).
    const r = await fn()
    await refetch()
    if ('error' in r && r.error) setError(r.error)
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h1 className="text-xl font-semibold">Agenda</h1>

      {/* Tira semanal (D11) */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {semana.map((d) => (
          <button
            key={d.fecha}
            onClick={() => setFecha(d.fecha)}
            className={`px-3 py-2 rounded-xl border text-sm whitespace-nowrap transition ${
              d.fecha === fecha ? 'bg-primary text-white border-primary shadow-lg shadow-primary/25' : 'border-border'
            }`}
          >
            <span className="font-semibold capitalize">
              {fmtFechaLarga(`${d.fecha}T12:00:00${AR_OFFSET}`)}
            </span>
            <span className="ml-2 opacity-75">
              {d.turnos > 0 || d.sobreturnos > 0 ? `${d.turnos}${d.sobreturnos ? `+${d.sobreturnos}` : ''}` : '—'}
            </span>
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-500/20">
          {error}
        </div>
      )}

      {loading || !dia ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-[var(--color-muted-foreground)]" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[7fr_3fr]">
          {/* Lista del día */}
          <div className="rounded-2xl border border-border divide-y divide-border/50">
            {dia.cerrado && (
              <div className="p-4 text-sm text-[var(--color-muted-foreground)] flex items-center gap-2">
                <CalendarOff className="w-4 h-4" /> Día sin atención (cerrado o sin horario cargado).
              </div>
            )}
            {dia.items.map((item) =>
              item.tipo === 'turno' ? (
                <div key={item.turno.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="font-bold tabular-nums w-12">{fmtHora(item.turno.starts_at)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {[item.turno.paciente_apellido, item.turno.paciente_nombre].filter(Boolean).join(', ') ||
                        item.turno.paciente_telefono ||
                        '(sin datos)'}
                    </p>
                    <p className="text-xs text-[var(--color-muted-foreground)] truncate">
                      {[item.turno.paciente_obra_social, item.turno.paciente_dni && `DNI ${item.turno.paciente_dni}`]
                        .filter(Boolean)
                        .join(' · ')}
                      {item.turno.notas ? ` — ${item.turno.notas}` : ''}
                      {item.turno.origen === 'panel' ? ' · cargado a mano' : ''}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${ESTADO_CHIP[item.estadoEfectivo]?.cls ?? ''}`}>
                    {ESTADO_CHIP[item.estadoEfectivo]?.label ?? item.estadoEfectivo}
                  </span>
                  {item.estadoEfectivo === 'atendido' && (
                    <button
                      className="text-xs underline text-[var(--color-muted-foreground)]"
                      onClick={() => onAccion(() => marcarAsistencia(item.turno.id, true))}
                    >
                      no vino
                    </button>
                  )}
                  {item.estadoEfectivo === 'no_vino' && (
                    <button
                      className="text-xs underline text-[var(--color-muted-foreground)]"
                      onClick={() => onAccion(() => marcarAsistencia(item.turno.id, false))}
                    >
                      sí vino
                    </button>
                  )}
                  {item.estadoEfectivo === 'proximo' && (
                    <button
                      className="text-xs underline text-red-500"
                      onClick={() => {
                        if (window.confirm('¿Cancelar este turno?')) onAccion(() => cancelarTurnoPanel(item.turno.id))
                      }}
                    >
                      cancelar
                    </button>
                  )}
                </div>
              ) : (
                <button
                  key={`libre-${item.startsAt}`}
                  onClick={() => setSlotElegido({ fecha, hora: item.label })}
                  className="w-full flex items-center gap-3 px-4 py-2 text-left opacity-60 hover:opacity-100 hover:bg-primary/5 transition"
                >
                  <span className="font-bold tabular-nums w-12">{item.label}</span>
                  <span className="text-sm text-[var(--color-muted-foreground)]">libre — click para dar turno</span>
                  <Plus className="w-4 h-4 ml-auto" />
                </button>
              ),
            )}
            {dia.items.length === 0 && !dia.cerrado && (
              <div className="p-6 text-sm text-center text-[var(--color-muted-foreground)]">Sin turnos ni huecos para este día.</div>
            )}
          </div>

          {/* Sobreturnos del día (D3: lista sin hora, siempre visible) */}
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
                {s.estado === 'pendiente' ? (
                  <div className="flex gap-3 text-xs">
                    <button className="underline" onClick={() => onAccion(() => setEstadoSobreturno(s.id, 'atendido'))}>
                      ✓ atendido
                    </button>
                    <button className="underline" onClick={() => onAccion(() => setEstadoSobreturno(s.id, 'no_vino'))}>
                      ✗ no vino
                    </button>
                    <button className="underline text-red-500" onClick={() => onAccion(() => setEstadoSobreturno(s.id, 'cancelado'))}>
                      cancelar
                    </button>
                  </div>
                ) : (
                  <p className="text-xs">{s.estado === 'atendido' ? '✓ atendido' : '✗ no vino'}</p>
                )}
              </div>
            ))}
            <button
              onClick={() => setSobreturnoOpen(true)}
              className="w-full border border-dashed border-amber-500/50 text-amber-600 rounded-xl py-2 text-sm font-medium"
            >
              + Sobreturno
            </button>
            <button
              onClick={() => {
                const nota = window.prompt('Bloquear ESTE día (vacaciones/congreso). Nota opcional:')
                if (nota !== null) onAccion(() => bloquearDias({ desde: fecha, hasta: fecha, nota }))
              }}
              className="w-full text-xs underline text-[var(--color-muted-foreground)]"
            >
              <CalendarOff className="w-3 h-3 inline mr-1" />
              Bloquear este día
            </button>
          </div>
        </div>
      )}

      {slotElegido && (
        <TurnoManualForm
          fecha={slotElegido.fecha}
          hora={slotElegido.hora}
          onClose={() => setSlotElegido(null)}
          onDone={() => {
            setSlotElegido(null)
            refetch()
          }}
        />
      )}
      {sobreturnoOpen && (
        <SobreturnoForm
          fecha={fecha}
          onClose={() => setSobreturnoOpen(false)}
          onDone={() => {
            setSobreturnoOpen(false)
            refetch()
          }}
        />
      )}
    </div>
  )
}

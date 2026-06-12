'use client'

import { useState } from 'react'
import { CalendarClock, Check, X, ChevronDown } from 'lucide-react'
import type { SugerenciaTurno } from '@/lib/consultorio/correlacion'

/** 'YYYY-MM-DD' → 'mié 12/06' (sin depender de la TZ de la máquina). */
function fechaCorta(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number)
  const dow = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${dow} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}

function etiqueta(s: SugerenciaTurno): string {
  const base = fechaCorta(s.fecha)
  return s.hora ? `${base} a las ${s.hora}` : `${base} (sobreturno)`
}

interface Props {
  sugerencias: SugerenciaTurno[]
  /** La sugerencia ya aplicada (vínculo activo), o null si ninguna. */
  aplicada: SugerenciaTurno | null
  onAplicar: (s: SugerenciaTurno) => void
  onQuitar: () => void
}

/**
 * Tarjeta de correlación turno→orden (3C). Propone fecha/horario REALES tomados
 * de la agenda. Un click los completa. Nunca obligatorio: se puede quitar.
 */
export function SugerenciaTurnoCard({ sugerencias, aplicada, onAplicar, onQuitar }: Props) {
  const [verOtras, setVerOtras] = useState(false)

  if (aplicada) {
    return (
      <div
        className="flex items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm"
        style={{ background: 'var(--color-background)', border: '1px solid var(--color-success)' }}
      >
        <span className="flex items-center gap-2" style={{ color: 'var(--color-success)' }}>
          <Check className="h-4 w-4 shrink-0" />
          Atención tomada del turno del <strong>{etiqueta(aplicada)}</strong>
        </span>
        <button
          type="button"
          onClick={onQuitar}
          className="flex items-center gap-1 text-xs transition-opacity hover:opacity-70"
          style={{ color: 'var(--color-muted-foreground)' }}
        >
          <X className="h-3.5 w-3.5" /> Quitar
        </button>
      </div>
    )
  }

  if (sugerencias.length === 0) return null

  const principal = sugerencias[0]
  const otras = sugerencias.slice(1)

  return (
    <div
      className="rounded-lg px-4 py-3 text-sm"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-primary)' }}
    >
      <div className="flex items-start gap-3">
        <CalendarClock className="h-5 w-5 shrink-0 mt-0.5" style={{ color: 'var(--color-primary)' }} />
        <div className="flex-1">
          <p style={{ color: 'var(--color-foreground)' }}>
            Este paciente tuvo turno el <strong>{etiqueta(principal)}</strong>.
            ¿Usar esa fecha {principal.hora ? 'y horario reales' : 'real'}?
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onAplicar(principal)}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--color-primary)' }}
            >
              Usar fecha{principal.hora ? ' y hora' : ''}
            </button>
            {otras.length > 0 && (
              <button
                type="button"
                onClick={() => setVerOtras((v) => !v)}
                className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs transition-opacity hover:opacity-70"
                style={{ color: 'var(--color-muted-foreground)' }}
              >
                Ver otros turnos ({otras.length})
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${verOtras ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>

          {verOtras && otras.length > 0 && (
            <ul className="mt-2 space-y-1.5 border-t pt-2" style={{ borderColor: 'var(--color-border)' }}>
              {otras.map((s) => (
                <li key={`${s.tipo}-${s.id}`} className="flex items-center justify-between gap-2">
                  <span style={{ color: 'var(--color-muted-foreground)' }}>{etiqueta(s)}</span>
                  <button
                    type="button"
                    onClick={() => onAplicar(s)}
                    className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                    style={{ border: '1px solid var(--color-primary)', color: 'var(--color-primary)' }}
                  >
                    Usar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

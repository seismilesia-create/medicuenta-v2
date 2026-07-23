'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { cancelarTurnoPanel, marcarAsistencia } from '@/actions/consultorio-agenda'
import { marcarCheckin } from '@/actions/consultorio-checkin'
import { fmtHora, fmtFechaLarga } from '@/lib/turnos/formato'
import { arDateString } from '@/lib/turnos/slots'
import type { TurnoItem } from './timeline-dia'

const ESTADO_CHIP: Record<string, { label: string; cls: string }> = {
  proximo: { label: 'próximo', cls: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  atendido: { label: '✓ atendido', cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  no_vino: { label: '✗ no vino', cls: 'bg-red-500/10 text-red-500 border-red-500/20' },
}

interface Props {
  item: TurnoItem
  onClose: () => void
  /** Mismo contrato que el orquestador: ejecuta la action, refetchea y muestra el error global. */
  onAccion: (fn: () => Promise<{ error?: string } | { ok: true }>) => Promise<void>
}

/** Tarjeta de detalle del turno (patrón GCal: click en el bloque → tarjeta con acciones). */
export function TurnoPopover({ item, onClose, onAccion }: Props) {
  const t = item.turno
  const chip = ESTADO_CHIP[item.estadoEfectivo]
  // El check-in solo tiene sentido el día del turno, sobre turnos vivos.
  const esHoy = t.starts_at.length >= 10 && arDateString(new Date(t.starts_at).getTime(), 0) === arDateString(Date.now(), 0)
  const vivo = item.estadoEfectivo === 'proximo' || item.estadoEfectivo === 'atendido'

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  async function accion(fn: () => Promise<{ error?: string } | { ok: true }>) {
    onClose()
    await onAccion(fn)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-border bg-[var(--color-background)] p-5 space-y-3 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold">
              {[t.paciente_apellido, t.paciente_nombre].filter(Boolean).join(', ') || t.paciente_telefono || '(sin datos)'}
            </h2>
            <p className="text-sm text-[var(--color-muted-foreground)] capitalize">
              {fmtFechaLarga(t.starts_at)} · {fmtHora(t.starts_at)}–{fmtHora(t.ends_at)} hs
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-sm space-y-1">
          {chip && (
            <span className={`inline-block text-xs px-2 py-0.5 rounded-full border ${chip.cls}`}>{chip.label}</span>
          )}
          <p className="text-[var(--color-muted-foreground)]">
            {[
              t.paciente_obra_social,
              t.paciente_dni && `DNI ${t.paciente_dni}`,
              t.paciente_telefono && `📱 ${t.paciente_telefono}`,
            ]
              .filter(Boolean)
              .join(' · ') || 'Sin datos de cobertura.'}
          </p>
          {t.notas && <p>{t.notas}</p>}
          {t.origen === 'panel' && <p className="text-xs text-[var(--color-muted-foreground)]">cargado a mano</p>}
          {t.checkin_at && (
            <p className="text-xs font-medium text-emerald-600 flex items-center gap-2">
              🟢 En sala desde las {fmtHora(t.checkin_at)}
              <button
                className="underline text-[var(--color-muted-foreground)] font-normal"
                onClick={() => accion(() => marcarCheckin({ tipo: 'turno', id: t.id, deshacer: true }))}
              >
                deshacer
              </button>
            </p>
          )}
        </div>

        {!t.checkin_at && esHoy && vivo && (
          <button
            className="w-full rounded-xl bg-emerald-600 text-white py-2.5 text-sm font-semibold hover:bg-emerald-700 transition-colors"
            onClick={() => accion(() => marcarCheckin({ tipo: 'turno', id: t.id, deshacer: false }))}
          >
            🚪 Llegó — marcar en sala
          </button>
        )}

        <div className="flex gap-2 pt-1">
          {item.estadoEfectivo === 'proximo' && (
            <button
              className="flex-1 rounded-xl border border-red-500/40 text-red-500 py-2 text-sm font-medium hover:bg-red-500/10"
              onClick={() => {
                if (window.confirm('¿Cancelar este turno?')) accion(() => cancelarTurnoPanel(t.id))
              }}
            >
              Cancelar turno
            </button>
          )}
          {item.estadoEfectivo === 'atendido' && (
            <button
              className="flex-1 rounded-xl border border-border py-2 text-sm font-medium hover:bg-red-500/10 hover:text-red-500"
              onClick={() => accion(() => marcarAsistencia(t.id, true))}
            >
              ✗ No vino
            </button>
          )}
          {item.estadoEfectivo === 'no_vino' && (
            <button
              className="flex-1 rounded-xl border border-border py-2 text-sm font-medium hover:bg-emerald-500/10 hover:text-emerald-600"
              onClick={() => accion(() => marcarAsistencia(t.id, false))}
            >
              ✓ Sí vino
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

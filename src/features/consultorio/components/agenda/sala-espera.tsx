'use client'

import { useState } from 'react'
import { llamarPaciente, type EstadoCheckinItem } from '@/actions/consultorio-checkin'
import { MEDIO_LABELS } from '@/features/cobros/types/cobros'

interface Props {
  items: EstadoCheckinItem[]
  onCobrar: (item: EstadoCheckinItem) => void
  onOrden: (item: EstadoCheckinItem) => void
}

function haceMin(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  return `hace ${Math.floor(min / 60)} h ${min % 60} min`
}

/** "EN SALA": quién llegó, hace cuánto, y qué falta (orden / cobro) para completarlo ahí mismo. */
export function SalaEspera({ items, onCobrar, onOrden }: Props) {
  // Estado local del llamado (enviando / hora del último aviso / error) por paciente.
  const [llamados, setLlamados] = useState<Record<string, 'enviando' | 'ok'>>({})
  const [errorLlamado, setErrorLlamado] = useState<string | null>(null)

  async function llamar(it: EstadoCheckinItem) {
    const clave = `${it.tipo}-${it.id}`
    setErrorLlamado(null)
    setLlamados((p) => ({ ...p, [clave]: 'enviando' }))
    const r = await llamarPaciente({ tipo: it.tipo, id: it.id })
    if ('error' in r) {
      setErrorLlamado(r.error)
      setLlamados((p) => {
        const { [clave]: _x, ...rest } = p
        return rest
      })
      return
    }
    setLlamados((p) => ({ ...p, [clave]: 'ok' }))
  }

  if (items.length === 0) return null
  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
      <h2 className="text-sm font-semibold text-emerald-600">EN SALA ({items.length})</h2>
      <div className="space-y-2">
        {items.map((it) => (
          <div
            key={`${it.tipo}-${it.id}`}
            className="rounded-xl bg-[var(--color-background)] border border-border p-3 flex flex-wrap items-center gap-x-4 gap-y-2"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm truncate">
                {it.paciente}
                {it.tipo === 'sobreturno' && <span className="text-amber-600 text-xs"> · sobreturno</span>}
              </p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {[haceMin(it.checkinAt), it.obraSocial, it.dni && `DNI ${it.dni}`].filter(Boolean).join(' · ')}
              </p>
            </div>

            {/* Cobro (plus u honorario particular) */}
            {it.cobro ? (
              it.cobro.estado === 'cobrado' ? (
                <span className="text-xs font-medium text-emerald-600">
                  💵 ${it.cobro.monto.toLocaleString('es-AR')} {MEDIO_LABELS[it.cobro.medio]} ✓
                </span>
              ) : (
                <span className="text-xs font-medium text-amber-600">
                  ⏳ link ${it.cobro.monto.toLocaleString('es-AR')} sin pagar
                </span>
              )
            ) : (
              <button
                onClick={() => onCobrar(it)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-[var(--color-primary)] text-white hover:opacity-90"
              >
                {it.esParticular ? 'Cobrar consulta' : 'Cobrar plus'}
              </button>
            )}

            {/* Orden presentada (solo trazable en turnos) */}
            {it.tipo === 'turno' &&
              (it.orden ? (
                it.orden.sinFoto ? (
                  <button
                    onClick={() => onOrden(it)}
                    className="text-xs font-medium text-amber-600 underline underline-offset-2"
                    title="Completar la foto de la orden"
                  >
                    📄 orden sin foto
                  </button>
                ) : (
                  <span className="text-xs font-medium text-emerald-600">📄 orden ✓</span>
                )
              ) : it.esParticular ? null : (
                <button
                  onClick={() => onOrden(it)}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold border border-border hover:bg-[var(--color-muted)]"
                >
                  Registrar orden
                </button>
              ))}
            {it.tipo === 'sobreturno' && !it.esParticular && (
              <button
                onClick={() => onOrden(it)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold border border-border hover:bg-[var(--color-muted)]"
              >
                Registrar orden
              </button>
            )}

            {/* Llamado por WhatsApp (texto libre, gratis): requiere ventana de 24h abierta —
                se abre sola cuando el paciente le escribe "llegué" al bot para pagar. */}
            {(() => {
              const clave = `${it.tipo}-${it.id}`
              const estado = llamados[clave]
              if (estado === 'ok') {
                return <span className="text-xs font-medium text-emerald-600">📣 Llamado ✓</span>
              }
              return (
                <button
                  onClick={() => llamar(it)}
                  disabled={!it.puedeLlamar || estado === 'enviando'}
                  title={
                    it.puedeLlamar
                      ? 'Avisarle por WhatsApp que pase al consultorio'
                      : 'Pedile al paciente que le escriba "llegué" al asistente para poder llamarlo'
                  }
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold border border-border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-muted)]"
                >
                  {estado === 'enviando' ? 'Enviando…' : '📣 Llamar'}
                </button>
              )
            })()}
          </div>
        ))}
      </div>
      {errorLlamado && <p className="text-sm text-red-500">{errorLlamado}</p>}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { registrarCobroCheckin, type EstadoCheckinItem } from '@/actions/consultorio-checkin'
import { MEDIOS_COBRO, MEDIO_LABELS, type MedioCobro } from '@/features/cobros/types/cobros'
import { QrLinkMp } from '@/features/cobros/components/QrLinkMp'

interface Props {
  item: EstadoCheckinItem
  onClose: () => void
  /** Refetch de la sala tras registrar (o acreditar) el cobro. */
  onDone: () => void
}

/** Cobro en recepción: plus (obra social) o consulta completa (particular). */
export function CobroCheckinModal({ item, onClose, onDone }: Props) {
  const [monto, setMonto] = useState('')
  const [medio, setMedio] = useState<MedioCobro>('efectivo')
  const [link, setLink] = useState<{ cobroId: string; link: string } | null>(null)
  const [pagado, setPagado] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const concepto = item.esParticular ? 'consulta_particular' : 'plus'
  const titulo = item.esParticular ? 'Cobrar consulta particular' : 'Cobrar plus'

  async function registrar() {
    setError(null)
    const montoNum = Number(monto) || 0
    if (montoNum <= 0) {
      setError('Poné el monto.')
      return
    }
    setLoading(true)
    const res = await registrarCobroCheckin({ tipo: item.tipo, id: item.id, concepto, monto: montoNum, medio })
    setLoading(false)
    if ('error' in res) {
      setError(res.error)
      return
    }
    if (res.link) {
      setLink({ cobroId: res.cobroId, link: res.link })
      onDone() // la sala ya muestra "link pendiente"
    } else {
      onDone()
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-border bg-[var(--color-background)] p-5 space-y-4 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold">{titulo}</h2>
            <p className="text-sm text-[var(--color-muted-foreground)]">{item.paciente}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!link ? (
          <>
            <div>
              <label className="block text-sm font-medium mb-1.5">Monto</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                autoFocus
                className="w-full px-4 py-3 rounded-lg text-sm font-mono border border-border bg-[var(--color-background)]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">¿Cómo paga?</label>
              <div className="flex gap-2 flex-wrap">
                {MEDIOS_COBRO.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMedio(m)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-all border ${
                      medio === m
                        ? 'bg-[var(--color-primary)] text-white border-transparent'
                        : 'border-border text-[var(--color-muted-foreground)]'
                    }`}
                  >
                    {MEDIO_LABELS[m]}
                  </button>
                ))}
              </div>
              {medio === 'mercadopago' && (
                <p className="text-xs text-[var(--color-muted-foreground)] mt-2">
                  Genera un link/QR del MercadoPago del médico: el paciente lo escanea acá y se acredita solo.
                </p>
              )}
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              onClick={registrar}
              disabled={loading}
              className="w-full rounded-xl bg-[var(--color-primary)] text-white py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {loading ? 'Registrando…' : medio === 'mercadopago' ? 'Generar link y QR' : 'Registrar cobro'}
            </button>
          </>
        ) : (
          <>
            <QrLinkMp
              link={link.link}
              cobroId={link.cobroId}
              onAcreditado={() => {
                setPagado(true)
                onDone()
              }}
            />
            <button
              onClick={onClose}
              className="w-full rounded-xl border border-border py-2.5 text-sm font-semibold hover:bg-[var(--color-muted)]"
            >
              {pagado ? 'Listo' : 'Cerrar (queda pendiente hasta que pague)'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

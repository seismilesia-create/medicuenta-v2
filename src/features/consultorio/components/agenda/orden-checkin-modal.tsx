'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { crearOrdenCheckin, type EstadoCheckinItem } from '@/actions/consultorio-checkin'
import { EscanearOrdenButton, type OrdenEscaneada } from '@/features/ordenes/components/EscanearOrdenButton'
import { arDateString } from '@/lib/turnos/slots'

interface Props {
  item: EstadoCheckinItem
  onClose: () => void
  onDone: () => void
}

/**
 * Orden presentada en el mostrador. Dos caminos:
 * — "Tipear" (default): OS + N° de orden/token en ~10 segundos con teclado
 *   (la secretaria atiende en desktop con OSEP abierto; escanear ahí es
 *   inviable). La foto se completa después, en lote, desde "Órdenes sin foto".
 * — "Foto": el flujo OCR completo de siempre, para quien puede.
 */
export function OrdenCheckinModal({ item, onClose, onDone }: Props) {
  const [modo, setModo] = useState<'tipear' | 'foto'>('tipear')
  const [obraSocial, setObraSocial] = useState(item.obraSocial ?? '')
  const [nro, setNro] = useState('')
  const [token, setToken] = useState('')
  const [fecha, setFecha] = useState(arDateString(Date.now(), 0))
  const [ocr, setOcr] = useState<OrdenEscaneada | null>(null)
  const [imagen, setImagen] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar() {
    setError(null)
    if (modo === 'tipear' && obraSocial.trim().length < 2) {
      setError('Indicá la obra social.')
      return
    }
    if (modo === 'foto' && !ocr) {
      setError('Primero escaneá la orden.')
      return
    }
    setLoading(true)
    const res = await crearOrdenCheckin({
      tipo: item.tipo,
      id: item.id,
      fechaAtencion: fecha,
      ...(modo === 'tipear'
        ? { minima: { obraSocial: obraSocial.trim(), nroComprobante: nro.trim() || undefined, tokenOsep: token.trim() || undefined } }
        : { ocr: ocr!, imagenDataUrl: imagen ?? undefined }),
    })
    setLoading(false)
    if ('error' in res) {
      setError(res.error)
      return
    }
    onDone()
    onClose()
  }

  const inputCls = 'w-full px-4 py-3 rounded-lg text-sm border border-border bg-[var(--color-background)]'

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-border bg-[var(--color-background)] p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold">Registrar orden presentada</h2>
            <p className="text-sm text-[var(--color-muted-foreground)]">{item.paciente}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-2">
          {(['tipear', 'foto'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setModo(m)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium border ${
                modo === m
                  ? 'bg-[var(--color-primary)] text-white border-transparent'
                  : 'border-border text-[var(--color-muted-foreground)]'
              }`}
            >
              {m === 'tipear' ? '⌨️ Tipear datos' : '📷 Foto'}
            </button>
          ))}
        </div>

        {modo === 'tipear' ? (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">Obra social *</label>
              <input value={obraSocial} onChange={(e) => setObraSocial(e.target.value)} placeholder="OSEP" className={inputCls} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1.5">N° de orden</label>
                <input value={nro} onChange={(e) => setNro(e.target.value)} placeholder="12345678" className={`${inputCls} font-mono`} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Token OSEP</label>
                <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="6 dígitos" className={`${inputCls} font-mono`} />
              </div>
            </div>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              La orden queda como borrador del médico, marcada &quot;sin foto&quot;: la foto se agrega después, en lote,
              desde Órdenes.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <EscanearOrdenButton
              variant={ocr ? 'compact' : 'hero'}
              onExtracted={(data) => {
                setOcr(data)
                if (data.fecha_realizacion) setFecha(data.fecha_realizacion)
                if (data.obra_social) setObraSocial(data.obra_social)
              }}
              onImage={setImagen}
            />
            {ocr && (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-sm space-y-0.5">
                <p className="font-medium">✓ {ocr.paciente || item.paciente}</p>
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  {[ocr.obra_social, ocr.nro_comprobante && `N° ${ocr.nro_comprobante}`, ocr.token_osep && `token ${ocr.token_osep}`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1.5">Fecha de atención</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          onClick={guardar}
          disabled={loading}
          className="w-full rounded-xl bg-[var(--color-primary)] text-white py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {loading ? 'Guardando…' : 'Guardar borrador'}
        </button>
      </div>
    </div>
  )
}

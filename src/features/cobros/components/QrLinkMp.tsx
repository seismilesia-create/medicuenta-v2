'use client'

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { estadoCobro } from '@/actions/cobros'

interface Props {
  link: string
  cobroId: string
  /** Se dispara una sola vez, con el monto real acreditado. */
  onAcreditado?: (monto: number) => void
}

/**
 * QR + link de un cobro MercadoPago pendiente. El paciente lo escanea en el
 * mostrador; un poll cada 5 s detecta la acreditación del webhook.
 */
export function QrLinkMp({ link, cobroId, onAcreditado }: Props) {
  const [qr, setQr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [acreditado, setAcreditado] = useState(false)
  const onAcreditadoRef = useRef(onAcreditado)
  onAcreditadoRef.current = onAcreditado

  useEffect(() => {
    QRCode.toDataURL(link, { width: 280, margin: 1 }).then(setQr).catch(() => {})
  }, [link])

  useEffect(() => {
    if (acreditado) return
    const timer = setInterval(async () => {
      try {
        const res = await estadoCobro(cobroId)
        if ('estado' in res && res.estado === 'cobrado') {
          setAcreditado(true)
          onAcreditadoRef.current?.(res.monto)
        }
      } catch {
        // el próximo tick reintenta
      }
    }, 5000)
    return () => clearInterval(timer)
  }, [cobroId, acreditado])

  async function copiarLink() {
    await navigator.clipboard.writeText(link)
    setMsg('Link copiado ✓')
    setTimeout(() => setMsg(null), 2000)
  }

  return (
    <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
      {qr && (
        <img
          src={qr}
          alt="QR para pagar con MercadoPago"
          className="w-36 h-36 rounded-xl border bg-white p-1 shrink-0"
          style={{ borderColor: 'var(--color-border)' }}
        />
      )}
      <div className="flex-1 space-y-2 min-w-0">
        {acreditado ? (
          <p className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--color-success)' }}>
            ✓ Acreditado en tu cuenta de MercadoPago
          </p>
        ) : (
          <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
            El paciente escanea el QR y paga. Apenas se acredite, esto se marca solo.
          </p>
        )}
        <div
          className="rounded-lg px-3 py-2 text-xs break-all"
          style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-muted-foreground)' }}
        >
          {link}
        </div>
        <button
          type="button"
          onClick={copiarLink}
          className="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
          style={{ border: '1px solid var(--color-border)', color: 'var(--color-foreground)' }}
        >
          Copiar link
        </button>
        {msg && <p className="text-sm" style={{ color: 'var(--color-primary)' }}>{msg}</p>}
      </div>
    </div>
  )
}

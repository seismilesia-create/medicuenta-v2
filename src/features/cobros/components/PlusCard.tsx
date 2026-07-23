'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { anularCobroPendiente, generarLinkCobro, getMpConectado } from '@/actions/cobros'
import { MEDIOS_COBRO, MEDIO_LABELS, type EstadoCobro, type MedioCobro } from '../types/cobros'
import { QrLinkMp } from './QrLinkMp'

const inputBase = 'w-full px-4 py-3 rounded-lg text-sm'
const inputStyle = {
  background: 'var(--color-background)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-foreground)',
} as const

const LS_MONTOS = 'mc_plus_montos'

function leerMontosRecientes(): number[] {
  try {
    const raw = localStorage.getItem(LS_MONTOS)
    const arr = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(arr)
      ? arr.filter((n): n is number => typeof n === 'number' && n > 0).slice(0, 3)
      : []
  } catch {
    return []
  }
}

function guardarMontoReciente(monto: number) {
  try {
    const prev = leerMontosRecientes().filter((m) => m !== monto)
    localStorage.setItem(LS_MONTOS, JSON.stringify([monto, ...prev].slice(0, 3)))
  } catch {
    // sin localStorage no pasa nada
  }
}

export interface CobroVinculado {
  id: string
  monto: number
  medio: MedioCobro
  estado: EstadoCobro
}

interface Props {
  /** Cobro ya anclado a la orden (modo edición). Bloquea el medio; si es MP acreditado, también el monto. */
  cobroExistente?: CobroVinculado | null
  montoInicial?: number
  pacienteNombre?: string
  turnoId?: string
}

/**
 * Tarjeta prominente del plus: monto (con montos recientes a un toque), medio
 * de pago y cobro por link/QR de MercadoPago del médico. Emite los campos de
 * form `monto_plus`, `cobro_medio` y `cobro_id` (este último solo si se generó
 * un link en esta sesión) — el guardado real lo hace la action de la orden.
 */
export function PlusCard({ cobroExistente, montoInicial, pacienteNombre, turnoId }: Props) {
  const mpAcreditadoPrevio = cobroExistente?.medio === 'mercadopago' && cobroExistente.estado === 'cobrado'
  const [monto, setMonto] = useState(montoInicial && montoInicial > 0 ? String(montoInicial) : '')
  const [medio, setMedio] = useState<MedioCobro>(cobroExistente?.medio ?? 'efectivo')
  const [recientes, setRecientes] = useState<number[]>([])
  const [mpConectado, setMpConectado] = useState<boolean | null>(null)
  const [linkInfo, setLinkInfo] = useState<{ cobroId: string; link: string } | null>(null)
  const [montoDelLink, setMontoDelLink] = useState<number | null>(null)
  const [acreditado, setAcreditado] = useState(mpAcreditadoPrevio)
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setRecientes(leerMontosRecientes())
  }, [])

  useEffect(() => {
    if (medio === 'mercadopago' && mpConectado === null) {
      getMpConectado()
        .then((r) => setMpConectado(r.conectado))
        .catch(() => setMpConectado(false))
    }
  }, [medio, mpConectado])

  const montoNum = Number(monto) || 0
  // Un cobro MP acreditado es plata real: su monto no se toca más.
  const montoBloqueado = acreditado
  // El medio de un cobro ya registrado no se cambia desde acá (anular y recargar).
  const medioBloqueado = Boolean(cobroExistente) || acreditado

  async function generar() {
    setError(null)
    if (montoNum <= 0) {
      setError('Poné el monto antes de generar el link.')
      return
    }
    setGenerando(true)
    const res = await generarLinkCobro({
      monto: montoNum,
      concepto: 'plus',
      pacienteNombre: pacienteNombre || undefined,
      turnoId,
      cobroId: linkInfo?.cobroId,
    })
    setGenerando(false)
    if ('error' in res) {
      setError(res.error)
      return
    }
    setLinkInfo({ cobroId: res.cobroId, link: res.link })
    setMontoDelLink(montoNum)
    guardarMontoReciente(montoNum)
  }

  function cambiarMedio(m: MedioCobro) {
    if (medioBloqueado || m === medio) return
    setMedio(m)
    setError(null)
    // Si había un link pendiente y se pasa a un medio en mano, ese cobro se anula.
    if (m !== 'mercadopago' && linkInfo && !acreditado) {
      anularCobroPendiente(linkInfo.cobroId).catch(() => {})
      setLinkInfo(null)
      setMontoDelLink(null)
    }
  }

  function onAcreditado(montoReal: number) {
    setAcreditado(true)
    setMonto(String(montoReal))
    guardarMontoReciente(montoReal)
  }

  function onBlurMonto() {
    if (montoNum > 0) guardarMontoReciente(montoNum)
  }

  const linkDesactualizado = linkInfo && !acreditado && montoDelLink !== null && montoDelLink !== montoNum

  return (
    <div
      className="p-6 rounded-xl space-y-4"
      style={{ background: 'var(--color-surface)', border: '1px dashed var(--color-warning)' }}
    >
      <div>
        <div className="flex items-center gap-2 mb-1">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--color-warning)' }}>
            <path d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-warning)' }}>Plus (privado)</h3>
        </div>
        <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
          Este dato es estrictamente privado. Solo vos podés verlo. Si no cobrás plus, dejalo en 0.
        </p>
      </div>

      <div className="flex gap-3 items-end flex-wrap">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>Monto</label>
          <input
            name="monto_plus"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            onBlur={onBlurMonto}
            readOnly={montoBloqueado}
            className={`${inputBase} font-mono`}
            style={montoBloqueado ? { ...inputStyle, opacity: 0.7 } : inputStyle}
          />
        </div>
        {!montoBloqueado && recientes.length > 0 && (
          <div className="flex gap-2 pb-1">
            {recientes.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMonto(String(m))}
                className="rounded-full px-3 py-1.5 text-sm font-mono transition-colors"
                style={{ border: '1px solid var(--color-border)', color: 'var(--color-foreground)', background: 'var(--color-background)' }}
              >
                ${m.toLocaleString('es-AR')}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>¿Cómo se cobró?</label>
        <div className="flex gap-2 flex-wrap">
          {MEDIOS_COBRO.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => cambiarMedio(m)}
              disabled={medioBloqueado && m !== medio}
              className="rounded-lg px-3 py-2 text-sm font-medium transition-all disabled:opacity-40"
              style={
                medio === m
                  ? { background: 'var(--color-primary)', color: 'white' }
                  : { background: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-muted-foreground)' }
              }
            >
              {MEDIO_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      <input type="hidden" name="cobro_medio" value={medio} />
      {linkInfo && <input type="hidden" name="cobro_id" value={linkInfo.cobroId} />}

      {medio === 'mercadopago' && !acreditado && (
        <div className="space-y-3">
          {mpConectado === false && (
            <p className="text-sm" style={{ color: 'var(--color-warning)' }}>
              Todavía no conectaste tu cuenta de MercadoPago.{' '}
              <Link href="/consultorio/config" className="underline font-medium">Conectala en Configuración</Link>{' '}
              para cobrar con link.
            </p>
          )}
          {mpConectado !== false && !linkInfo && (
            <button
              type="button"
              onClick={generar}
              disabled={generando || montoNum <= 0}
              className="rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
              style={{ background: 'var(--color-primary)', color: 'white' }}
            >
              {generando ? 'Generando…' : 'Generar link y QR'}
            </button>
          )}
          {linkInfo && (
            <>
              <QrLinkMp link={linkInfo.link} cobroId={linkInfo.cobroId} onAcreditado={onAcreditado} />
              {linkDesactualizado && (
                <button
                  type="button"
                  onClick={generar}
                  disabled={generando}
                  className="rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                  style={{ border: '1px solid var(--color-warning)', color: 'var(--color-warning)' }}
                >
                  {generando ? 'Regenerando…' : `Cambió el monto: regenerar link por $${montoNum.toLocaleString('es-AR')}`}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {acreditado && (
        <p className="text-sm font-semibold" style={{ color: 'var(--color-success)' }}>
          ✓ Acreditado por MercadoPago — el monto ya no se edita.
        </p>
      )}

      {error && <p className="text-sm" style={{ color: 'var(--color-error)' }}>{error}</p>}
    </div>
  )
}

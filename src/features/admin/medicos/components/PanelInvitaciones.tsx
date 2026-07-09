// src/features/admin/medicos/components/PanelInvitaciones.tsx
'use client'

import { useState } from 'react'
import QRCode from 'qrcode'
import { generarInvitacionMedico, listarInvitaciones, revocarInvitacion } from '@/actions/admin-medicos'
import type { InvitacionFila } from '@/features/onboarding/invitaciones-types'

export function PanelInvitaciones({ inicial }: { inicial: InvitacionFila[] }) {
  const [filas, setFilas] = useState<InvitacionFila[]>(inicial)
  const [nombre, setNombre] = useState('')
  const [nuevaUrl, setNuevaUrl] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function refrescar() {
    const r = await listarInvitaciones()
    if ('data' in r) setFilas(r.data)
  }

  async function generar() {
    setError(null); setLoading(true)
    const r = await generarInvitacionMedico(nombre)
    setLoading(false)
    if ('error' in r) { setError(r.error); return }
    setNuevaUrl(r.url)
    setQr(await QRCode.toDataURL(r.url))
    setNombre('')
    await refrescar()
  }

  async function revocar(id: string) {
    await revocarInvitacion(id)
    await refrescar()
  }

  const input = 'rounded-xl border border-border px-3 py-2 text-sm'
  return (
    <div className="space-y-4 rounded-xl border border-border p-4">
      <h2 className="font-medium">Invitar médico por enlace</h2>
      <div className="flex flex-wrap gap-2">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Referencia (ej: Dr. Moreno)" className={input} />
        <button onClick={generar} disabled={loading} className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50">
          {loading ? 'Generando…' : 'Generar enlace'}
        </button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {nuevaUrl && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className="text-sm break-all"><a href={nuevaUrl} className="text-primary underline">{nuevaUrl}</a></p>
          <button onClick={() => navigator.clipboard.writeText(nuevaUrl)} className="rounded-lg border border-border px-3 py-1 text-sm">Copiar enlace</button>
          {qr && <img src={qr} alt="QR del enlace" className="w-40 h-40" />}
          <p className="text-xs text-muted-foreground">Mandale este enlace al médico por WhatsApp. Vence en 72 hs.</p>
        </div>
      )}

      {filas.length > 0 && (
        <ul className="divide-y divide-border text-sm">
          {filas.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 py-2">
              <span>
                {f.nombreReferencia || '(sin referencia)'} · <span className="text-muted-foreground">{f.estado}{f.estado === 'pendiente' && !f.vigente ? ' (vencida)' : ''}</span>
              </span>
              <span className="flex gap-2">
                {f.estado === 'pendiente' && f.vigente && (
                  <>
                    <button onClick={() => navigator.clipboard.writeText(f.url)} className="rounded-lg border border-border px-2 py-1 text-xs">Copiar</button>
                    <button onClick={() => revocar(f.id)} className="rounded-lg border border-border px-2 py-1 text-xs text-destructive">Revocar</button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

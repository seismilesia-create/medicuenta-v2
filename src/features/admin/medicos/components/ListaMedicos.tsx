// src/features/admin/medicos/components/ListaMedicos.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import QRCode from 'qrcode'
import { reintentarCableado } from '@/actions/admin-medicos'
import type { MedicoFila } from '@/features/admin/medicos/types'

export function ListaMedicos({ medicos }: { medicos: MedicoFila[] }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [qr, setQr] = useState<{ url: string; link: string } | null>(null)

  if (medicos.length === 0) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">Todavía no hay médicos. Cargá el primero con "Nuevo médico".</p>
  }

  async function onReintentar(id: string) {
    setMsg(null)
    const r = await reintentarCableado(id)
    setMsg('error' in r ? r.error : 'Cableado completado. Recargá la lista.')
  }

  async function verQR(link: string) {
    const url = await QRCode.toDataURL(link)
    setQr({ url, link })
  }

  return (
    <div className="space-y-3">
      {msg && <p className="text-sm">{msg}</p>}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="text-left text-[var(--color-muted-foreground)]">
            <tr>
              <th className="p-3">Médico</th>
              <th className="p-3">Email</th>
              <th className="p-3">Link</th>
              <th className="p-3">Estado</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {medicos.map((m) => {
              const nombre = [m.nombre, m.apellido].filter(Boolean).join(' ') || '(sin nombre)'
              const link = m.link
              return (
                <tr key={m.id} className="border-t border-border">
                  <td className="p-3">
                    <div className="font-medium">{nombre}</div>
                    {m.especialidad && <div className="text-xs text-[var(--color-muted-foreground)]">{m.especialidad}</div>}
                  </td>
                  <td className="p-3">{m.email}</td>
                  <td className="p-3">
                    {link ? (
                      <div className="flex gap-2">
                        <button onClick={() => { navigator.clipboard.writeText(link); setMsg('Link copiado.') }} className="text-primary underline">Copiar</button>
                        <button onClick={() => verQR(link)} className="text-primary underline">QR</button>
                      </div>
                    ) : '—'}
                  </td>
                  <td className="p-3">{m.cableadoActivo ? '✅ Cableado' : '⏳ Pendiente'}</td>
                  <td className="p-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <Link href={`/admin/medicos/${m.id}/editar`} className="rounded-lg border border-border px-3 py-1">Editar</Link>
                      {!m.cableadoActivo && (
                        <button onClick={() => onReintentar(m.id)} className="rounded-lg border border-border px-3 py-1">Reintentar</button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {qr && (
        <div onClick={() => setQr(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div onClick={(e) => e.stopPropagation()} className="rounded-2xl bg-background border border-border p-6 space-y-3 text-center">
            <p className="text-sm text-[var(--color-muted-foreground)] break-all max-w-xs">{qr.link}</p>
            <img src={qr.url} alt="QR del link" className="w-56 h-56 mx-auto" />
            <button onClick={() => setQr(null)} className="rounded-lg border border-border px-4 py-1 text-sm">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  )
}

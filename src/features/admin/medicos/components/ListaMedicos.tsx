// src/features/admin/medicos/components/ListaMedicos.tsx
'use client'

import { useState } from 'react'
import { reintentarCableado } from '@/actions/admin-medicos'
import type { MedicoFila } from '@/features/admin/medicos/types'

export function ListaMedicos({ medicos }: { medicos: MedicoFila[] }) {
  const [msg, setMsg] = useState<string | null>(null)

  if (medicos.length === 0) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">Todavía no hay médicos. Cargá el primero con "Nuevo médico".</p>
  }

  async function onReintentar(id: string) {
    setMsg(null)
    const r = await reintentarCableado(id)
    setMsg('error' in r ? r.error : 'Cableado completado. Recargá la lista.')
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
                      <button onClick={() => { navigator.clipboard.writeText(link); setMsg('Link copiado.') }} className="text-primary underline">
                        Copiar
                      </button>
                    ) : '—'}
                  </td>
                  <td className="p-3">{m.cableadoActivo ? '✅ Cableado' : '⏳ Pendiente'}</td>
                  <td className="p-3 text-right">
                    {!m.cableadoActivo && (
                      <button onClick={() => onReintentar(m.id)} className="rounded-lg border border-border px-3 py-1">
                        Reintentar
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

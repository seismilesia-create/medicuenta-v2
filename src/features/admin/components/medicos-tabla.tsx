'use client'

import { AlertTriangle } from 'lucide-react'
import type { MedicoConFlags } from '@/lib/admin/costos'

const intAR = new Intl.NumberFormat('es-AR')

function nombreDe(m: MedicoConFlags): string {
  const n = [m.nombre, m.apellido].filter(Boolean).join(' ').trim()
  return n || m.email || 'Sin nombre'
}

function fechaAlta(iso: string | null): string {
  if (!iso) return '—'
  const [y, mo, d] = iso.slice(0, 10).split('-')
  return `${d}/${mo}/${y}`
}

export function MedicosTabla({ medicos }: { medicos: MedicoConFlags[] }) {
  if (medicos.length === 0) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">Todavía no hay médicos.</p>
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[var(--color-muted-foreground)] border-b border-border">
            <th className="px-3 py-2 font-medium">Médico</th>
            <th className="px-3 py-2 font-medium hidden md:table-cell">Número</th>
            <th className="px-3 py-2 font-medium text-right">Tokens (30 d)</th>
            <th className="px-3 py-2 font-medium text-right hidden sm:table-cell">Msj. con costo</th>
            <th className="px-3 py-2 font-medium text-right hidden lg:table-cell">Errores (7 d)</th>
            <th className="px-3 py-2 font-medium text-right hidden lg:table-cell">Turnos</th>
            <th className="px-3 py-2 font-medium hidden xl:table-cell">Alta</th>
          </tr>
        </thead>
        <tbody>
          {medicos.map((m) => (
            <tr
              key={m.medico_id}
              className="border-b border-border last:border-0"
              style={m.esOutlier ? { background: 'rgba(245,158,11,0.07)' } : undefined}
            >
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{nombreDe(m)}</span>
                  {m.esOutlier && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 border border-amber-500/20">
                      <AlertTriangle className="w-3 h-3" /> alto consumo
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-[var(--color-muted-foreground)]">{m.email}</div>
              </td>
              <td className="px-3 py-2 hidden md:table-cell tabular-nums text-[var(--color-muted-foreground)]">
                {m.numero ?? (m.canal_estado ? `(${m.canal_estado})` : '—')}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-medium">{intAR.format(m.tokens_30d)}</td>
              <td className="px-3 py-2 text-right tabular-nums hidden sm:table-cell">
                <span className={m.mensajes_pagos_30d > 0 ? 'text-amber-600 font-medium' : ''}>
                  {intAR.format(m.mensajes_pagos_30d)}
                </span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums hidden lg:table-cell">
                <span className={m.errores_7d > 0 ? 'text-red-500 font-medium' : ''}>
                  {intAR.format(m.errores_7d)}
                </span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums hidden lg:table-cell">{intAR.format(m.turnos_total)}</td>
              <td className="px-3 py-2 hidden xl:table-cell tabular-nums text-[var(--color-muted-foreground)]">
                {fechaAlta(m.alta)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Debito, MotivoDebito } from '../types/debitos'
import { MotivoDebitoBadge } from './MotivoDebitoBadge'
import { MOTIVO_LABELS } from '../types/debitos'

function formatMonto(valor: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(valor)
}

function formatFecha(fecha: string): string {
  return new Date(fecha + 'T00:00:00').toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

export function DebitosTable() {
  const router = useRouter()
  const [debitos, setDebitos] = useState<Debito[]>([])
  const [loading, setLoading] = useState(true)
  const [motivoFilter, setMotivoFilter] = useState<MotivoDebito | ''>('')

  useEffect(() => {
    fetchDebitos()
  }, [motivoFilter])

  async function fetchDebitos() {
    setLoading(true)
    const supabase = createClient()

    let query = supabase
      .from('debitos')
      .select('*')
      .order('fecha', { ascending: false })

    if (motivoFilter) {
      query = query.eq('motivo', motivoFilter)
    }

    const { data } = await query
    setDebitos(data ?? [])
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight" style={{ color: 'var(--color-foreground)' }}>
            Débitos
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
            {debitos.length} {debitos.length === 1 ? 'débito' : 'débitos'}
          </p>
        </div>
        <Link
          href="/debitos/nuevo"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
          style={{ background: 'var(--color-primary)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nuevo Débito
        </Link>
      </div>

      {/* Filter */}
      <div
        className="p-3 md:p-5 rounded-xl"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-foreground)' }}>
          Filtrar por motivo
        </label>
        <select
          value={motivoFilter}
          onChange={(e) => setMotivoFilter(e.target.value as MotivoDebito | '')}
          className="px-3 py-2 rounded-lg text-sm"
          style={{
            background: 'var(--color-background)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-foreground)',
          }}
        >
          <option value="">Todos</option>
          {Object.entries(MOTIVO_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--color-primary)' }} />
        </div>
      ) : debitos.length === 0 ? (
        <div
          className="text-center py-16 rounded-xl"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <svg className="mx-auto mb-4" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--color-muted)' }}>
            <path d="M9 12h6M12 9v6M3 12a9 9 0 1118 0 9 9 0 01-18 0z" />
          </svg>
          <h3 className="text-lg font-medium mb-1" style={{ color: 'var(--color-foreground)' }}>
            No hay débitos
          </h3>
          <p className="text-sm mb-4" style={{ color: 'var(--color-muted)' }}>
            Crea tu primer débito para empezar a registrar descuentos de obras sociales
          </p>
          <Link
            href="/debitos/nuevo"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: 'var(--color-primary)' }}
          >
            Crear primer débito
          </Link>
        </div>
      ) : (
        <div
          className="overflow-x-auto rounded-xl"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th className="text-left px-3 md:px-5 py-3.5 font-medium" style={{ color: 'var(--color-muted)' }}>Fecha</th>
                <th className="text-left px-3 md:px-5 py-3.5 font-medium" style={{ color: 'var(--color-muted)' }}>Motivo</th>
                <th className="text-left px-3 md:px-5 py-3.5 font-medium hidden lg:table-cell" style={{ color: 'var(--color-muted)' }}>Detalle</th>
                <th className="text-right px-3 md:px-5 py-3.5 font-medium" style={{ color: 'var(--color-muted)' }}>Monto</th>
                <th className="text-center px-3 md:px-5 py-3.5 font-medium hidden lg:table-cell" style={{ color: 'var(--color-muted)' }}>Refacturable</th>
              </tr>
            </thead>
            <tbody>
              {debitos.map((debito) => (
                <tr
                  key={debito.id}
                  onClick={() => router.push(`/debitos/${debito.id}`)}
                  className="transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.04] cursor-pointer"
                  style={{ borderBottom: '1px solid var(--color-border)' }}
                >
                  <td className="px-3 md:px-5 py-4" style={{ color: 'var(--color-foreground)' }}>
                    {formatFecha(debito.fecha)}
                  </td>
                  <td className="px-3 md:px-5 py-4">
                    <MotivoDebitoBadge motivo={debito.motivo} />
                  </td>
                  <td className="px-3 md:px-5 py-4 hidden lg:table-cell" style={{ color: 'var(--color-muted)' }}>
                    {debito.motivo_detalle || '-'}
                  </td>
                  <td className="px-3 md:px-5 py-4 text-right font-mono font-medium" style={{ color: 'var(--color-error)' }}>
                    {formatMonto(Number(debito.monto))}
                  </td>
                  <td className="px-3 md:px-5 py-4 text-center hidden lg:table-cell">
                    {debito.refacturable ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-[#30D158]/10 text-[#248A3D] dark:bg-[#30D158]/15 dark:text-[#30D158]">
                        Si
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-[#8E8E93]/10 text-[#8E8E93] dark:bg-[#636366]/20 dark:text-[#98989D]">
                        No
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

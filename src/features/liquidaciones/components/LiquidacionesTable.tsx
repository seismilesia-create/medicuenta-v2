'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Liquidacion, EstadoLiquidacion } from '../types/liquidaciones'
import { LiquidacionStatusBadge } from './LiquidacionStatusBadge'

function formatMonto(valor: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(valor)
}

function formatPeriodo(inicio: string, fin: string): string {
  const formatDate = (fecha: string) => {
    return new Date(fecha + 'T00:00:00').toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    })
  }
  return `${formatDate(inicio)} - ${formatDate(fin)}`
}

export function LiquidacionesTable() {
  const router = useRouter()
  const [liquidaciones, setLiquidaciones] = useState<Liquidacion[]>([])
  const [loading, setLoading] = useState(true)
  const [estadoFilter, setEstadoFilter] = useState<EstadoLiquidacion | ''>('')

  useEffect(() => {
    fetchLiquidaciones()
  }, [estadoFilter])

  async function fetchLiquidaciones() {
    setLoading(true)
    const supabase = createClient()

    let query = supabase
      .from('liquidaciones')
      .select('*')
      .order('periodo_inicio', { ascending: false })

    if (estadoFilter) {
      query = query.eq('estado', estadoFilter)
    }

    const { data } = await query
    setLiquidaciones(data ?? [])
    setLoading(false)
  }

  function getDiferencia(liquidacion: Liquidacion): number {
    return Number(liquidacion.monto_liquidado) - Number(liquidacion.monto_presentado)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight" style={{ color: 'var(--color-foreground)' }}>
            Liquidaciones
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
            {liquidaciones.length} {liquidaciones.length === 1 ? 'liquidacion' : 'liquidaciones'}
          </p>
        </div>
        <Link
          href="/liquidaciones/nueva"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
          style={{ background: 'var(--color-primary)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nueva Liquidacion
        </Link>
      </div>

      {/* Filter */}
      <div
        className="p-3 md:p-5 rounded-xl"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-foreground)' }}>
          Filtrar por estado
        </label>
        <select
          value={estadoFilter}
          onChange={(e) => setEstadoFilter(e.target.value as EstadoLiquidacion | '')}
          className="px-3 py-2 rounded-lg text-sm"
          style={{
            background: 'var(--color-background)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-foreground)',
          }}
        >
          <option value="">Todos</option>
          <option value="pendiente">Pendiente</option>
          <option value="parcial">Parcial</option>
          <option value="pagado">Pagado</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--color-primary)' }} />
        </div>
      ) : liquidaciones.length === 0 ? (
        <div
          className="text-center py-16 rounded-xl"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <svg className="mx-auto mb-4" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--color-muted)' }}>
            <path d="M9 12h6M12 9v6M3 12a9 9 0 1118 0 9 9 0 01-18 0z" />
          </svg>
          <h3 className="text-lg font-medium mb-1" style={{ color: 'var(--color-foreground)' }}>
            No hay liquidaciones
          </h3>
          <p className="text-sm mb-4" style={{ color: 'var(--color-muted)' }}>
            Crea tu primera liquidacion para empezar a registrar pagos de obras sociales
          </p>
          <Link
            href="/liquidaciones/nueva"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: 'var(--color-primary)' }}
          >
            Crear primera liquidacion
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
                <th className="text-left px-3 md:px-5 py-3.5 font-medium" style={{ color: 'var(--color-muted)' }}>Periodo</th>
                <th className="text-left px-3 md:px-5 py-3.5 font-medium" style={{ color: 'var(--color-muted)' }}>OS</th>
                <th className="text-right px-3 md:px-5 py-3.5 font-medium hidden lg:table-cell" style={{ color: 'var(--color-muted)' }}>Presentado</th>
                <th className="text-right px-3 md:px-5 py-3.5 font-medium" style={{ color: 'var(--color-muted)' }}>Liquidado</th>
                <th className="text-right px-3 md:px-5 py-3.5 font-medium hidden lg:table-cell" style={{ color: 'var(--color-muted)' }}>Diferencia</th>
                <th className="text-left px-3 md:px-5 py-3.5 font-medium" style={{ color: 'var(--color-muted)' }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {liquidaciones.map((liquidacion) => {
                const diferencia = getDiferencia(liquidacion)
                const diferenciaColor = diferencia < 0 ? 'var(--color-error)' : 'var(--color-success)'

                return (
                  <tr
                    key={liquidacion.id}
                    onClick={() => router.push(`/liquidaciones/${liquidacion.id}`)}
                    className="transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.04] cursor-pointer"
                    style={{ borderBottom: '1px solid var(--color-border)' }}
                  >
                    <td className="px-3 md:px-5 py-4" style={{ color: 'var(--color-foreground)' }}>
                      {formatPeriodo(liquidacion.periodo_inicio, liquidacion.periodo_fin)}
                    </td>
                    <td className="px-3 md:px-5 py-4" style={{ color: 'var(--color-muted)' }}>
                      {liquidacion.obra_social || 'Todas'}
                    </td>
                    <td className="px-3 md:px-5 py-4 text-right font-mono font-medium hidden lg:table-cell" style={{ color: 'var(--color-foreground)' }}>
                      {formatMonto(Number(liquidacion.monto_presentado))}
                    </td>
                    <td className="px-3 md:px-5 py-4 text-right font-mono font-medium" style={{ color: 'var(--color-foreground)' }}>
                      {formatMonto(Number(liquidacion.monto_liquidado))}
                    </td>
                    <td className="px-3 md:px-5 py-4 text-right font-mono font-medium hidden lg:table-cell" style={{ color: diferenciaColor }}>
                      {formatMonto(diferencia)}
                    </td>
                    <td className="px-3 md:px-5 py-4">
                      <LiquidacionStatusBadge estado={liquidacion.estado} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

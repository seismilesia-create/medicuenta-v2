'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Receipt, Plus, Filter, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadoFilter])

  async function fetchLiquidaciones() {
    setLoading(true)
    const supabase = createClient()

    let query = supabase.from('liquidaciones').select('*').order('periodo_inicio', { ascending: false })

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
    <div className="h-full overflow-y-auto">
      {/* Header con gradient azul (sky) */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-sky-500/5 via-transparent to-transparent" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

        <div className="relative px-4 md:px-8 pt-6 md:pt-8 pb-4 md:pb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/20 to-sky-500/10 ring-1 ring-sky-500/20">
                <Receipt className="h-6 w-6 text-sky-500" strokeWidth={1.5} />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Liquidaciones</h1>
                <p className="text-sm text-muted-foreground">
                  {liquidaciones.length} {liquidaciones.length === 1 ? 'liquidacion registrada' : 'liquidaciones registradas'}
                </p>
              </div>
            </div>

            <Link
              href="/liquidaciones/nueva"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all"
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              Nueva Liquidacion
            </Link>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 pb-8 md:pb-12 space-y-6">
        {/* Filter */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/5 rounded-full blur-2xl pointer-events-none" />

          <div className="relative">
            <div className="flex items-center gap-2 mb-5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Filter className="h-4 w-4 text-primary" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Filtrar por estado</h3>
            </div>

            <select
              value={estadoFilter}
              onChange={(e) => setEstadoFilter(e.target.value as EstadoLiquidacion | '')}
              className="w-full md:w-[220px] px-3 py-2.5 rounded-xl bg-muted/50 border border-border/50 text-sm text-foreground focus:border-primary/50 focus:outline-none transition-colors appearance-none cursor-pointer"
            >
              <option value="">Todos</option>
              <option value="pendiente">Pendiente</option>
              <option value="parcial">Parcial</option>
              <option value="pagado">Pagado</option>
            </select>
          </div>
        </div>

        {/* Loading / Empty / Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : liquidaciones.length === 0 ? (
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-16">
            <div className="absolute inset-0 bg-gradient-to-br from-sky-500/5 via-transparent to-transparent" />
            <div className="absolute -bottom-20 -right-20 w-48 h-48 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative flex flex-col items-center justify-center text-center">
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-sky-500/20 rounded-full blur-xl pulse-glow" />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-sky-500/20 to-sky-500/10 ring-2 ring-sky-500/20">
                  <Receipt className="h-10 w-10 text-sky-500" strokeWidth={1.5} />
                </div>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">No hay liquidaciones</h3>
              <p className="text-sm text-muted-foreground mb-8 max-w-md">
                Crea tu primera liquidacion para empezar a registrar los pagos de las obras sociales
              </p>
              <Link
                href="/liquidaciones/nueva"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground text-base font-medium hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all"
              >
                <Plus className="h-5 w-5" strokeWidth={2} />
                Crear primera liquidacion
              </Link>
            </div>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-3 md:px-5 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Periodo</th>
                    <th className="text-left px-3 md:px-5 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">OS</th>
                    <th className="text-right px-3 md:px-5 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell">Presentado</th>
                    <th className="text-right px-3 md:px-5 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Liquidado</th>
                    <th className="text-right px-3 md:px-5 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell">Diferencia</th>
                    <th className="text-left px-3 md:px-5 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {liquidaciones.map((liquidacion) => {
                    const diferencia = getDiferencia(liquidacion)

                    return (
                      <tr
                        key={liquidacion.id}
                        onClick={() => router.push(`/liquidaciones/${liquidacion.id}`)}
                        className="border-b border-border/50 cursor-pointer transition-colors hover:bg-accent/30"
                      >
                        <td className="px-3 md:px-5 py-4 text-foreground">
                          {formatPeriodo(liquidacion.periodo_inicio, liquidacion.periodo_fin)}
                        </td>
                        <td className="px-3 md:px-5 py-4 text-muted-foreground">
                          {liquidacion.obra_social || 'Todas'}
                        </td>
                        <td className="px-3 md:px-5 py-4 text-right font-mono font-medium text-foreground hidden lg:table-cell">
                          {formatMonto(Number(liquidacion.monto_presentado))}
                        </td>
                        <td className="px-3 md:px-5 py-4 text-right font-mono font-medium text-foreground">
                          {formatMonto(Number(liquidacion.monto_liquidado))}
                        </td>
                        <td
                          className={cn(
                            'px-3 md:px-5 py-4 text-right font-mono font-medium hidden lg:table-cell',
                            diferencia < 0 ? 'text-red-500' : 'text-sky-500',
                          )}
                        >
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
          </div>
        )}
      </div>
    </div>
  )
}

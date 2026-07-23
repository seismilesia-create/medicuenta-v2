'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Filter, AlertTriangle, Plus, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
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
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    fetchDebitos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motivoFilter])

  async function fetchDebitos() {
    setLoading(true)
    const supabase = createClient()

    let query = supabase.from('debitos').select('*').order('fecha', { ascending: false }).limit(500)

    if (motivoFilter) {
      query = query.eq('motivo', motivoFilter)
    }

    const { data, error } = await query
    if (error) {
      setLoadError('No se pudieron cargar los débitos. Reintentá en unos segundos.')
      setDebitos([])
    } else {
      setLoadError(null)
      setDebitos(data ?? [])
    }
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <div className="px-4 py-3 rounded-xl border text-sm font-medium bg-red-500/10 border-red-500/20 text-red-500">
          {loadError}
        </div>
      )}
      {/* Filter */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6">
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/5 rounded-full blur-2xl pointer-events-none" />

        <div className="relative">
          <div className="flex items-center gap-2 mb-5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Filter className="h-4 w-4 text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Filtrar por motivo</h3>
          </div>

          <select
            value={motivoFilter}
            onChange={(e) => setMotivoFilter(e.target.value as MotivoDebito | '')}
            className="w-full md:w-[220px] px-3 py-2.5 rounded-xl bg-muted/50 border border-border/50 text-sm text-foreground focus:border-primary/50 focus:outline-none transition-colors appearance-none cursor-pointer"
          >
            <option value="">Todos</option>
            {Object.entries(MOTIVO_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Loading / Empty / Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : debitos.length === 0 ? (
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-16">
          <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 via-transparent to-transparent" />
          <div className="absolute -bottom-20 -right-20 w-48 h-48 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative flex flex-col items-center justify-center text-center">
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-red-500/20 rounded-full blur-xl pulse-glow" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-red-500/20 to-red-500/10 ring-2 ring-red-500/20">
                <AlertTriangle className="h-10 w-10 text-red-500" strokeWidth={1.5} />
              </div>
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">No hay débitos</h3>
            <p className="text-sm text-muted-foreground mb-8 max-w-md">
              Registra los descuentos aplicados por las obras sociales para llevar un control detallado
            </p>
            <Link
              href="/debitos/nuevo"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground text-base font-medium hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all"
            >
              <Plus className="h-5 w-5" strokeWidth={2} />
              Crear primer debito
            </Link>
          </div>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 md:px-5 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Fecha</th>
                  <th className="text-left px-3 md:px-5 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Motivo</th>
                  <th className="text-left px-3 md:px-5 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell">Detalle</th>
                  <th className="text-right px-3 md:px-5 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Monto</th>
                  <th className="text-center px-3 md:px-5 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell">Refacturable</th>
                </tr>
              </thead>
              <tbody>
                {debitos.map((debito) => (
                  <tr
                    key={debito.id}
                    onClick={() => router.push(`/debitos/${debito.id}`)}
                    className="border-b border-border/50 cursor-pointer transition-colors hover:bg-accent/30"
                  >
                    <td className="px-3 md:px-5 py-4 text-foreground">{formatFecha(debito.fecha)}</td>
                    <td className="px-3 md:px-5 py-4">
                      <MotivoDebitoBadge motivo={debito.motivo} />
                    </td>
                    <td className="px-3 md:px-5 py-4 text-muted-foreground hidden lg:table-cell">{debito.motivo_detalle || '-'}</td>
                    <td className="px-3 md:px-5 py-4 text-right font-mono font-medium text-red-500">{formatMonto(Number(debito.monto))}</td>
                    <td className="px-3 md:px-5 py-4 text-center hidden lg:table-cell">
                      {debito.refacturable ? (
                        <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-sky-500/15 text-sky-500')}>
                          Si
                        </span>
                      ) : (
                        <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-muted text-muted-foreground')}>
                          No
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

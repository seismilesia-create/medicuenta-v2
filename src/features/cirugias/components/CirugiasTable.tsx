'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { hoyArgentina } from '@/shared/lib/fechas'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import { Scissors, Heart, Download, Plus, Check, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { batchUpdateCirugiasEstado } from '@/actions/cirugias'
import type { Cirugia, CirugiaFilters as FilterType } from '../types/cirugias'
import { AGENTE_LABELS } from '../types/cirugias'
import { CirugiaStatusBadge } from './CirugiaStatusBadge'
import { CirugiaFilters } from './CirugiaFilters'

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

const CIRUGIAS_LIMIT = 500

export function CirugiasTable() {
  const router = useRouter()
  const [cirugias, setCirugias] = useState<Cirugia[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<FilterType>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchResult, setBatchResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [truncado, setTruncado] = useState(false)
  const reqId = useRef(0)

  const borradores = cirugias.filter((c) => c.estado === 'borrador')
  const selectedBorradores = borradores.filter((c) => selected.has(c.id))

  const fetchCirugias = useCallback(async (currentFilters: FilterType) => {
    setLoading(true)
    const supabase = createClient()

    let query = supabase.from('cirugias').select('*').order('fecha', { ascending: false }).limit(CIRUGIAS_LIMIT)

    if (currentFilters.obra_social) query = query.eq('obra_social', currentFilters.obra_social)
    if (currentFilters.estado) query = query.eq('estado', currentFilters.estado)
    if (currentFilters.agente_facturador) query = query.eq('agente_facturador', currentFilters.agente_facturador)
    if (currentFilters.nivel) query = query.eq('nivel', currentFilters.nivel)
    if (currentFilters.institucion) query = query.eq('institucion', currentFilters.institucion)
    if (currentFilters.fecha_desde) query = query.gte('fecha', currentFilters.fecha_desde)
    if (currentFilters.fecha_hasta) query = query.lte('fecha', currentFilters.fecha_hasta)
    if (currentFilters.busqueda) query = query.ilike('nombre_paciente', `%${currentFilters.busqueda}%`)

    const myId = ++reqId.current
    const { data, error } = await query
    if (myId !== reqId.current) return
    if (error) {
      setLoadError('No se pudieron cargar las cirugías. Reintentá en unos segundos.')
      setCirugias([])
    } else {
      setLoadError(null)
      setCirugias(data ?? [])
      setTruncado((data?.length ?? 0) >= CIRUGIAS_LIMIT)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchCirugias(filters)
  }, [filters, fetchCirugias])

  useEffect(() => {
    setSelected(new Set())
    setBatchResult(null)
  }, [filters])

  function handleFilterChange(newFilters: FilterType) {
    setFilters(newFilters)
  }

  function toggleSelect(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setBatchResult(null)
  }

  function toggleSelectAll() {
    if (selectedBorradores.length === borradores.length && borradores.length > 0) {
      setSelected((prev) => {
        const next = new Set(prev)
        for (const c of borradores) next.delete(c.id)
        return next
      })
    } else {
      setSelected((prev) => {
        const next = new Set(prev)
        for (const c of borradores) next.add(c.id)
        return next
      })
    }
    setBatchResult(null)
  }

  async function handleBatchPresentar() {
    if (selectedBorradores.length === 0) return

    const confirmed = window.confirm(
      `Marcar ${selectedBorradores.length} ${selectedBorradores.length === 1 ? 'cirugia' : 'cirugias'} como presentada${selectedBorradores.length === 1 ? '' : 's'}?`,
    )
    if (!confirmed) return

    setBatchLoading(true)
    setBatchResult(null)

    try {
      const ids = selectedBorradores.map((c) => c.id)
      const result = await batchUpdateCirugiasEstado(ids, 'presentada')

      if (result.error) {
        setBatchResult({ type: 'error', message: result.error })
        return
      }

      setBatchResult({
        type: 'success',
        message: `${selectedBorradores.length} ${selectedBorradores.length === 1 ? 'cirugia marcada' : 'cirugias marcadas'} como presentada${selectedBorradores.length === 1 ? '' : 's'}`,
      })
      setSelected(new Set())
      fetchCirugias(filters)
    } finally {
      setBatchLoading(false)
    }
  }

  function exportToExcel() {
    const rows = cirugias.map((cirugia) => ({
      Fecha: new Date(cirugia.fecha + 'T00:00:00').toLocaleDateString('es-AR'),
      Paciente: cirugia.nombre_paciente,
      'Obra Social': cirugia.obra_social,
      Nivel: cirugia.nivel === 1 ? '1°' : '2°',
      Agente: AGENTE_LABELS[cirugia.agente_facturador] ?? cirugia.agente_facturador,
      Institucion: cirugia.institucion ?? '-',
      Codigo: cirugia.codigo_practica ?? '-',
      Practica: cirugia.nombre_practica ?? '-',
      Honorarios: Number(cirugia.honorarios),
      Gastos: Number(cirugia.gastos),
      'Total Calc.': Number(cirugia.total_calculado),
      Estado: cirugia.estado.charAt(0).toUpperCase() + cirugia.estado.slice(1),
    }))

    const ws = XLSX.utils.json_to_sheet(rows)
    const colWidths = Object.keys(rows[0] || {}).map((key) => ({
      wch: Math.max(key.length, ...rows.map((r) => String(r[key as keyof typeof r]).length)) + 2,
    }))
    ws['!cols'] = colWidths
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Cirugias')
    const today = hoyArgentina()
    XLSX.writeFile(wb, `cirugias-${today}.xlsx`)
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Header con gradient pink */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-pink-500/5 via-transparent to-transparent" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

        <div className="relative px-4 md:px-8 pt-6 md:pt-8 pb-4 md:pb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500/20 to-pink-500/10 ring-1 ring-pink-500/20">
                <Scissors className="h-6 w-6 text-pink-500" strokeWidth={1.5} />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Cirugias</h1>
                <p className="text-sm text-muted-foreground">
                  {cirugias.length} {cirugias.length === 1 ? 'cirugia registrada' : 'cirugias registradas'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={exportToExcel}
                disabled={cirugias.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border/50 bg-card hover:bg-accent/50 text-sm font-medium text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="h-4 w-4" strokeWidth={1.5} />
                Exportar
              </button>
              <Link
                href="/cirugias/nueva"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all"
              >
                <Plus className="h-4 w-4" strokeWidth={2} />
                Nueva Cirugia
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 pb-8 md:pb-12 space-y-6">
        <CirugiaFilters onFilterChange={handleFilterChange} />

        {loadError && (
          <div className="px-4 py-3 rounded-xl border text-sm font-medium bg-red-500/10 border-red-500/20 text-red-500">
            {loadError}
          </div>
        )}
        {truncado && !loadError && (
          <div className="px-4 py-3 rounded-xl border text-sm bg-amber-500/10 border-amber-500/20 text-amber-600">
            Mostrando las primeras {CIRUGIAS_LIMIT} cirugías. Usá los filtros para acotar la búsqueda.
          </div>
        )}

        {batchResult && (
          <div
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium',
              batchResult.type === 'success'
                ? 'bg-sky-500/10 border-sky-500/20 text-sky-500'
                : 'bg-red-500/10 border-red-500/20 text-red-500',
            )}
          >
            {batchResult.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
            {batchResult.message}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : cirugias.length === 0 ? (
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-16">
            <div className="absolute inset-0 bg-gradient-to-br from-pink-500/5 via-transparent to-transparent" />
            <div className="absolute -bottom-20 -right-20 w-48 h-48 bg-pink-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative flex flex-col items-center justify-center text-center">
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-pink-500/20 rounded-full blur-xl pulse-glow" />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-pink-500/20 to-pink-500/10 ring-2 ring-pink-500/20">
                  <Heart className="h-10 w-10 text-pink-500" strokeWidth={1.5} />
                </div>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">No hay cirugias registradas</h3>
              <p className="text-sm text-muted-foreground mb-8 max-w-md">
                Registra tu primera cirugia para comenzar el seguimiento de procedimientos quirurgicos
              </p>
              <Link
                href="/cirugias/nueva"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground text-base font-medium hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all"
              >
                <Plus className="h-5 w-5" strokeWidth={2} />
                Registrar primera cirugia
              </Link>
            </div>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="w-10 px-3 py-4">
                      {borradores.length > 0 && (
                        <input
                          type="checkbox"
                          checked={selectedBorradores.length === borradores.length && borradores.length > 0}
                          onChange={toggleSelectAll}
                          className="w-4 h-4 rounded cursor-pointer accent-primary"
                          title="Seleccionar todos los borradores"
                        />
                      )}
                    </th>
                    <th className="text-left px-3 md:px-5 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Fecha</th>
                    <th className="text-left px-3 md:px-5 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Paciente</th>
                    <th className="text-left px-3 md:px-5 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden md:table-cell">Nv</th>
                    <th className="text-left px-3 md:px-5 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell">OS</th>
                    <th className="text-left px-3 md:px-5 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden xl:table-cell">Agente</th>
                    <th className="text-left px-3 md:px-5 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden xl:table-cell">Institucion</th>
                    <th className="text-left px-3 md:px-5 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell">Practica</th>
                    <th className="text-right px-3 md:px-5 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Total Calc.</th>
                    <th className="text-left px-3 md:px-5 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {cirugias.map((cirugia) => {
                    const isBorrador = cirugia.estado === 'borrador'
                    const isSelected = selected.has(cirugia.id)

                    return (
                      <tr
                        key={cirugia.id}
                        onClick={() => router.push(`/cirugias/${cirugia.id}`)}
                        className={cn(
                          'border-b border-border/50 cursor-pointer transition-colors hover:bg-accent/30',
                          isSelected && 'bg-primary/5',
                        )}
                      >
                        <td className="w-10 px-3 py-4">
                          {isBorrador ? (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onClick={(e) => toggleSelect(cirugia.id, e)}
                              onChange={() => {}}
                              className="w-4 h-4 rounded cursor-pointer accent-primary"
                            />
                          ) : (
                            <div className="w-4 h-4" />
                          )}
                        </td>
                        <td className="px-3 md:px-5 py-4 text-foreground">{formatFecha(cirugia.fecha)}</td>
                        <td className="px-3 md:px-5 py-4 font-medium text-foreground">{cirugia.nombre_paciente}</td>
                        <td className="px-3 md:px-5 py-4 hidden md:table-cell">
                          <span
                            className={cn(
                              'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium',
                              cirugia.nivel === 1 ? 'bg-sky-500/10 text-sky-500' : 'bg-amber-500/10 text-amber-500',
                            )}
                          >
                            {cirugia.nivel === 1 ? '1°' : '2°'}
                          </span>
                        </td>
                        <td className="px-3 md:px-5 py-4 text-muted-foreground hidden lg:table-cell">{cirugia.obra_social}</td>
                        <td className="px-3 md:px-5 py-4 hidden xl:table-cell">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-muted text-muted-foreground">
                            {cirugia.agente_facturador === 'circulo_medico' ? 'CM' : cirugia.agente_facturador === 'medical_group' ? 'MG' : 'Com.'}
                          </span>
                        </td>
                        <td className="px-3 md:px-5 py-4 text-muted-foreground hidden xl:table-cell">
                          <div className="max-w-[150px] truncate">{cirugia.institucion ?? '—'}</div>
                        </td>
                        <td className="px-3 md:px-5 py-4 text-muted-foreground hidden lg:table-cell">
                          <div className="max-w-[200px] truncate">{cirugia.nombre_practica ?? cirugia.codigo_practica ?? '-'}</div>
                        </td>
                        <td className="px-3 md:px-5 py-4 text-right font-mono font-medium text-foreground">{formatMonto(Number(cirugia.total_calculado))}</td>
                        <td className="px-3 md:px-5 py-4">
                          <CirugiaStatusBadge estado={cirugia.estado} />
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

      {/* Floating batch action bar */}
      {selectedBorradores.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 md:right-8 z-40 flex items-center gap-3 px-5 py-3 rounded-2xl border border-border bg-card shadow-2xl shadow-primary/10 animate-slide-up">
          <span className="text-sm font-medium text-foreground">
            {selectedBorradores.length} {selectedBorradores.length === 1 ? 'seleccionada' : 'seleccionadas'}
          </span>

          <button
            onClick={() => {
              setSelected(new Set())
              setBatchResult(null)
            }}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Cancelar
          </button>

          <button
            onClick={handleBatchPresentar}
            disabled={batchLoading}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 shadow-lg shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {batchLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                Marcar como presentadas
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}

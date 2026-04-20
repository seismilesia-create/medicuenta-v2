'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { batchUpdateOrdenesEstado } from '@/actions/ordenes'
import type { Orden, OrdenFilters as FilterType } from '../types/ordenes'
import { AGENTE_LABELS } from '../types/ordenes'
import { OrdenStatusBadge } from './OrdenStatusBadge'
import { OrdenFilters } from './OrdenFilters'

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

function getMontoTotal(orden: Orden): number {
  return Number(orden.honorario_calculado) + Number(orden.monto_particular) + Number(orden.monto_plus)
}

export function OrdenesTable() {
  const router = useRouter()
  const [ordenes, setOrdenes] = useState<Orden[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<FilterType>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchResult, setBatchResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const borradores = ordenes.filter(o => o.estado === 'borrador')
  const selectedBorradores = borradores.filter(o => selected.has(o.id))

  const fetchOrdenes = useCallback(async (currentFilters: FilterType) => {
    setLoading(true)
    const supabase = createClient()

    let query = supabase
      .from('ordenes')
      .select('*')
      .order('fecha_atencion', { ascending: false })

    if (currentFilters.tipo) query = query.eq('tipo', currentFilters.tipo)
    if (currentFilters.obra_social) query = query.eq('obra_social', currentFilters.obra_social)
    if (currentFilters.estado) query = query.eq('estado', currentFilters.estado)
    if (currentFilters.agente_facturador) query = query.eq('agente_facturador', currentFilters.agente_facturador)
    if (currentFilters.fecha_desde) query = query.gte('fecha_atencion', currentFilters.fecha_desde)
    if (currentFilters.fecha_hasta) query = query.lte('fecha_atencion', currentFilters.fecha_hasta)
    if (currentFilters.busqueda) query = query.ilike('nombre_paciente', `%${currentFilters.busqueda}%`)

    const { data } = await query
    setOrdenes(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchOrdenes(filters)
  }, [filters, fetchOrdenes])

  // Clear selection when filters change
  useEffect(() => {
    setSelected(new Set())
    setBatchResult(null)
  }, [filters])

  function handleFilterChange(newFilters: FilterType) {
    setFilters(newFilters)
  }

  function toggleSelect(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
    setBatchResult(null)
  }

  function toggleSelectAll() {
    if (selectedBorradores.length === borradores.length && borradores.length > 0) {
      // Deselect all borradores
      setSelected(prev => {
        const next = new Set(prev)
        for (const o of borradores) next.delete(o.id)
        return next
      })
    } else {
      // Select all borradores
      setSelected(prev => {
        const next = new Set(prev)
        for (const o of borradores) next.add(o.id)
        return next
      })
    }
    setBatchResult(null)
  }

  async function handleBatchPresentar() {
    if (selectedBorradores.length === 0) return

    const confirmed = window.confirm(
      `Marcar ${selectedBorradores.length} ${selectedBorradores.length === 1 ? 'orden' : 'ordenes'} como presentada${selectedBorradores.length === 1 ? '' : 's'}?`
    )
    if (!confirmed) return

    setBatchLoading(true)
    setBatchResult(null)

    try {
      const ids = selectedBorradores.map(o => o.id)
      const result = await batchUpdateOrdenesEstado(ids, 'presentada')

      if (result.error) {
        setBatchResult({ type: 'error', message: result.error })
        return
      }

      setBatchResult({
        type: 'success',
        message: `${selectedBorradores.length} ${selectedBorradores.length === 1 ? 'orden marcada' : 'ordenes marcadas'} como presentada${selectedBorradores.length === 1 ? '' : 's'}`,
      })
      setSelected(new Set())
      fetchOrdenes(filters)
    } finally {
      setBatchLoading(false)
    }
  }

  function exportToExcel() {
    const rows = ordenes.map((orden) => ({
      'Fecha': new Date(orden.fecha_atencion + 'T00:00:00').toLocaleDateString('es-AR'),
      'Paciente': orden.nombre_paciente,
      'Tipo': orden.tipo === 'obra_social' ? 'Obra Social' : 'Particular',
      'Obra Social': orden.obra_social ?? '-',
      'Agente': AGENTE_LABELS[orden.agente_facturador] ?? orden.agente_facturador,
      'Codigo': orden.codigo_practica ?? '-',
      'Practica': orden.nombre_practica ?? '-',
      'Honorario': Number(orden.honorario_calculado),
      'Monto Particular': Number(orden.monto_particular),
      'Plus': Number(orden.monto_plus),
      'Total': Number(orden.honorario_calculado) + Number(orden.monto_particular) + Number(orden.monto_plus),
      'Estado': orden.estado.charAt(0).toUpperCase() + orden.estado.slice(1),
    }))

    const ws = XLSX.utils.json_to_sheet(rows)

    // Auto-size columns
    const colWidths = Object.keys(rows[0] || {}).map((key) => ({
      wch: Math.max(key.length, ...rows.map(r => String(r[key as keyof typeof r]).length)) + 2,
    }))
    ws['!cols'] = colWidths

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Ordenes')

    const today = new Date().toISOString().split('T')[0]
    XLSX.writeFile(wb, `ordenes-${today}.xlsx`)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight" style={{ color: 'var(--color-foreground)' }}>
            Ordenes
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
            {ordenes.length} {ordenes.length === 1 ? 'orden' : 'ordenes'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={exportToExcel}
            disabled={ordenes.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'var(--color-surface-elevated)',
              color: 'var(--color-foreground)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Exportar
          </button>
          <Link
            href="/ordenes/nueva"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: 'var(--color-primary)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nueva Orden
          </Link>
        </div>
      </div>

      {/* Filters */}
      <OrdenFilters onFilterChange={handleFilterChange} />

      {/* Batch result feedback */}
      {batchResult && (
        <div
          className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium"
          style={{
            backgroundColor: batchResult.type === 'success' ? 'var(--color-success-light)' : 'var(--color-error-light)',
            color: batchResult.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
          }}
        >
          {batchResult.type === 'success' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 3a9 9 0 110 18 9 9 0 010-18z" />
            </svg>
          )}
          {batchResult.message}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--color-primary)' }} />
        </div>
      ) : ordenes.length === 0 ? (
        <div
          className="text-center py-16 rounded-xl"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <svg className="mx-auto mb-4" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--color-muted)' }}>
            <path d="M9 12h6M12 9v6M3 12a9 9 0 1118 0 9 9 0 01-18 0z" />
          </svg>
          <h3 className="text-lg font-medium mb-1" style={{ color: 'var(--color-foreground)' }}>
            No hay ordenes
          </h3>
          <p className="text-sm mb-4" style={{ color: 'var(--color-muted)' }}>
            Crea tu primera orden para empezar a registrar atenciones
          </p>
          <Link
            href="/ordenes/nueva"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: 'var(--color-primary)' }}
          >
            Crear primera orden
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
                <th className="w-10 px-3 py-3.5">
                  {borradores.length > 0 && (
                    <input
                      type="checkbox"
                      checked={selectedBorradores.length === borradores.length && borradores.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded cursor-pointer accent-[var(--color-primary)]"
                      title="Seleccionar todos los borradores"
                    />
                  )}
                </th>
                <th className="text-left px-3 md:px-5 py-3.5 font-medium" style={{ color: 'var(--color-muted)' }}>Fecha</th>
                <th className="text-left px-3 md:px-5 py-3.5 font-medium" style={{ color: 'var(--color-muted)' }}>Paciente</th>
                <th className="text-left px-3 md:px-5 py-3.5 font-medium hidden lg:table-cell" style={{ color: 'var(--color-muted)' }}>Tipo</th>
                <th className="text-left px-3 md:px-5 py-3.5 font-medium hidden lg:table-cell" style={{ color: 'var(--color-muted)' }}>OS</th>
                <th className="text-left px-3 md:px-5 py-3.5 font-medium hidden xl:table-cell" style={{ color: 'var(--color-muted)' }}>Agente</th>
                <th className="text-left px-3 md:px-5 py-3.5 font-medium hidden lg:table-cell" style={{ color: 'var(--color-muted)' }}>Practica</th>
                <th className="text-right px-3 md:px-5 py-3.5 font-medium" style={{ color: 'var(--color-muted)' }}>Monto</th>
                <th className="text-left px-3 md:px-5 py-3.5 font-medium" style={{ color: 'var(--color-muted)' }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {ordenes.map((orden) => {
                const isBorrador = orden.estado === 'borrador'
                const isSelected = selected.has(orden.id)

                return (
                  <tr
                    key={orden.id}
                    onClick={() => router.push(`/ordenes/${orden.id}`)}
                    className={`hover:bg-black/[0.02] dark:hover:bg-white/[0.04] cursor-pointer transition-colors ${
                      isSelected ? 'bg-[var(--color-primary-100)]' : ''
                    }`}
                    style={{ borderBottom: '1px solid var(--color-border)' }}
                  >
                    <td className="w-10 px-3 py-4">
                      {isBorrador ? (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onClick={(e) => toggleSelect(orden.id, e)}
                          onChange={() => {}}
                          className="w-4 h-4 rounded cursor-pointer accent-[var(--color-primary)]"
                        />
                      ) : (
                        <div className="w-4 h-4" />
                      )}
                    </td>
                    <td className="px-3 md:px-5 py-4" style={{ color: 'var(--color-foreground)' }}>
                      {formatFecha(orden.fecha_atencion)}
                    </td>
                    <td className="px-3 md:px-5 py-4 font-medium" style={{ color: 'var(--color-foreground)' }}>
                      {orden.nombre_paciente}
                    </td>
                    <td className="px-3 md:px-5 py-4 hidden lg:table-cell">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        orden.tipo === 'obra_social'
                          ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
                          : 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400'
                      }`}>
                        {orden.tipo === 'obra_social' ? 'OS' : 'Part.'}
                      </span>
                    </td>
                    <td className="px-3 md:px-5 py-4 hidden lg:table-cell" style={{ color: 'var(--color-muted)' }}>
                      {orden.obra_social ?? '-'}
                    </td>
                    <td className="px-3 md:px-5 py-4 hidden xl:table-cell" style={{ color: 'var(--color-muted)' }}>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                        {orden.agente_facturador === 'circulo_medico' ? 'CM' : orden.agente_facturador === 'medical_group' ? 'MG' : 'Com.'}
                      </span>
                    </td>
                    <td className="px-3 md:px-5 py-4 hidden lg:table-cell" style={{ color: 'var(--color-muted)' }}>
                      <div className="max-w-[200px] truncate">
                        {orden.nombre_practica ?? orden.codigo_practica ?? '-'}
                      </div>
                    </td>
                    <td className="px-3 md:px-5 py-4 text-right font-mono font-medium" style={{ color: 'var(--color-foreground)' }}>
                      {formatMonto(getMontoTotal(orden))}
                    </td>
                    <td className="px-3 md:px-5 py-4">
                      <OrdenStatusBadge estado={orden.estado} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Floating batch action bar */}
      {selectedBorradores.length > 0 && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 md:right-8 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg animate-slide-up"
          style={{
            backgroundColor: 'var(--color-surface-elevated)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          }}
        >
          <span className="text-sm font-medium" style={{ color: 'var(--color-foreground)' }}>
            {selectedBorradores.length} {selectedBorradores.length === 1 ? 'seleccionada' : 'seleccionadas'}
          </span>

          <button
            onClick={() => { setSelected(new Set()); setBatchResult(null) }}
            className="px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
            style={{ color: 'var(--color-muted)' }}
          >
            Cancelar
          </button>

          <button
            onClick={handleBatchPresentar}
            disabled={batchLoading}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {batchLoading ? (
              <>
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                Procesando...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Marcar como presentadas
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}

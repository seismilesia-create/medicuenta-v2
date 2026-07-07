'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { hoyArgentina } from '@/shared/lib/fechas'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import { FileText, Download, Plus, CheckCircle2, AlertCircle, Check, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { Orden, OrdenFilters as FilterType } from '../types/ordenes'
import { PresentarPlanillaDialog } from './PresentarPlanillaDialog'
import { AGENTE_LABELS } from '../types/ordenes'
import { OrdenStatusBadge } from './OrdenStatusBadge'
import { OrdenFilters } from './OrdenFilters'
import { evaluarRiesgoOrden, FALTANTE_LABELS } from '@/lib/ordenes/riesgo-debito'
import { evaluarCompletitud } from '@/lib/ordenes/completitud'

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

const ORDENES_LIMIT = 500

export function OrdenesTable() {
  const router = useRouter()
  const [ordenes, setOrdenes] = useState<Orden[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<FilterType>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showPlanilla, setShowPlanilla] = useState(false)
  const [batchResult, setBatchResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [truncado, setTruncado] = useState(false)
  const reqId = useRef(0)

  const borradores = ordenes.filter((o) => o.estado === 'borrador')
  const selectedBorradores = borradores.filter((o) => selected.has(o.id))

  const fetchOrdenes = useCallback(async (currentFilters: FilterType) => {
    const myId = ++reqId.current
    setLoading(true)
    const supabase = createClient()

    let query = supabase.from('ordenes').select('*').order('fecha_atencion', { ascending: false }).limit(ORDENES_LIMIT)

    if (currentFilters.tipo) query = query.eq('tipo', currentFilters.tipo)
    if (currentFilters.codigo_os != null) query = query.eq('codigo_os', currentFilters.codigo_os)
    if (currentFilters.estado) query = query.eq('estado', currentFilters.estado)
    if (currentFilters.agente_facturador) query = query.eq('agente_facturador', currentFilters.agente_facturador)
    if (currentFilters.fecha_desde) query = query.gte('fecha_atencion', currentFilters.fecha_desde)
    if (currentFilters.fecha_hasta) query = query.lte('fecha_atencion', currentFilters.fecha_hasta)
    if (currentFilters.busqueda) query = query.ilike('nombre_paciente', `%${currentFilters.busqueda}%`)

    const { data, error } = await query
    if (myId !== reqId.current) return // llegó una request más nueva: descartamos esta respuesta vieja
    if (error) {
      setLoadError('No se pudieron cargar las órdenes. Reintentá en unos segundos.')
      setOrdenes([])
    } else {
      setLoadError(null)
      setOrdenes(data ?? [])
      setTruncado((data?.length ?? 0) >= ORDENES_LIMIT)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchOrdenes(filters)
  }, [filters, fetchOrdenes])

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
        for (const o of borradores) next.delete(o.id)
        return next
      })
    } else {
      setSelected((prev) => {
        const next = new Set(prev)
        for (const o of borradores) next.add(o.id)
        return next
      })
    }
    setBatchResult(null)
  }

  function exportToExcel() {
    const rows = ordenes.map((orden) => ({
      Fecha: new Date(orden.fecha_atencion + 'T00:00:00').toLocaleDateString('es-AR'),
      Paciente: orden.nombre_paciente,
      Tipo: orden.tipo === 'obra_social' ? 'Obra Social' : 'Particular',
      'Obra Social': orden.obra_social ?? '-',
      Agente: AGENTE_LABELS[orden.agente_facturador] ?? orden.agente_facturador,
      Codigo: orden.codigo_practica ?? '-',
      Practica: orden.nombre_practica ?? '-',
      Honorario: Number(orden.honorario_calculado),
      'Monto Particular': Number(orden.monto_particular),
      Plus: Number(orden.monto_plus),
      Total: Number(orden.honorario_calculado) + Number(orden.monto_particular) + Number(orden.monto_plus),
      Estado: orden.estado.charAt(0).toUpperCase() + orden.estado.slice(1),
    }))

    const ws = XLSX.utils.json_to_sheet(rows)
    const colWidths = Object.keys(rows[0] || {}).map((key) => ({
      wch: Math.max(key.length, ...rows.map((r) => String(r[key as keyof typeof r]).length)) + 2,
    }))
    ws['!cols'] = colWidths
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Ordenes')
    const today = hoyArgentina()
    XLSX.writeFile(wb, `ordenes-${today}.xlsx`)
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Header con gradient + blur orb */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

        <div className="relative px-4 md:px-8 pt-6 md:pt-8 pb-4 md:pb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 ring-1 ring-primary/20">
                <FileText className="h-6 w-6 text-primary" strokeWidth={1.5} />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Ordenes</h1>
                <p className="text-sm text-muted-foreground">
                  {ordenes.length} {ordenes.length === 1 ? 'orden registrada' : 'ordenes registradas'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/ordenes/presentaciones"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border/50 bg-card hover:bg-accent/50 text-sm font-medium text-foreground transition-colors"
              >
                <FileText className="h-4 w-4" strokeWidth={1.5} />
                Presentaciones
              </Link>
              <button
                onClick={exportToExcel}
                disabled={ordenes.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border/50 bg-card hover:bg-accent/50 text-sm font-medium text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="h-4 w-4" strokeWidth={1.5} />
                Exportar
              </button>
              <Link
                href="/ordenes/nueva"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all"
              >
                <Plus className="h-4 w-4" strokeWidth={2} />
                Nueva Orden
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 pb-8 md:pb-12 space-y-6">
        {/* Filters */}
        <OrdenFilters onFilterChange={handleFilterChange} />

        {loadError && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium bg-red-500/10 border-red-500/20 text-red-500">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {loadError}
          </div>
        )}
        {truncado && !loadError && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border text-sm bg-amber-500/10 border-amber-500/20 text-amber-600">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Mostrando las primeras {ORDENES_LIMIT} órdenes. Usá los filtros (fecha, OS, estado) para acotar la búsqueda.
          </div>
        )}

        {/* Batch result feedback */}
        {batchResult && (
          <div
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium',
              batchResult.type === 'success'
                ? 'bg-sky-500/10 border-sky-500/20 text-sky-500'
                : 'bg-red-500/10 border-red-500/20 text-red-500',
            )}
          >
            {batchResult.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            {batchResult.message}
          </div>
        )}

        {/* Loading / Empty / Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : ordenes.length === 0 ? (
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-16">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent" />
            <div className="absolute -bottom-20 -right-20 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative flex flex-col items-center justify-center text-center">
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl pulse-glow" />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/10 ring-2 ring-primary/20">
                  <FileText className="h-10 w-10 text-primary" strokeWidth={1.5} />
                </div>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">No hay ordenes</h3>
              <p className="text-sm text-muted-foreground mb-8 max-w-md">
                Crea tu primera orden para empezar a registrar atenciones medicas y gestionar tu facturacion
              </p>
              <Link
                href="/ordenes/nueva"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground text-base font-medium hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all"
              >
                <Plus className="h-5 w-5" strokeWidth={2} />
                Crear primera orden
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
                    <th className="text-left px-3 md:px-5 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell">Tipo</th>
                    <th className="text-left px-3 md:px-5 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell">OS</th>
                    <th className="text-left px-3 md:px-5 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden xl:table-cell">Agente</th>
                    <th className="text-left px-3 md:px-5 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell">Practica</th>
                    <th className="text-right px-3 md:px-5 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Monto</th>
                    <th className="text-left px-3 md:px-5 py-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Estado</th>
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
                              onClick={(e) => toggleSelect(orden.id, e)}
                              onChange={() => {}}
                              className="w-4 h-4 rounded cursor-pointer accent-primary"
                            />
                          ) : (
                            <div className="w-4 h-4" />
                          )}
                        </td>
                        <td className="px-3 md:px-5 py-4 text-foreground">{formatFecha(orden.fecha_atencion)}</td>
                        <td className="px-3 md:px-5 py-4 font-medium text-foreground">
                          <span className="inline-flex items-center gap-2">
                            {(() => {
                              if (!isBorrador) return null
                              const { enRiesgo, faltantes } = evaluarRiesgoOrden(orden)
                              if (!enRiesgo) return null
                              return (
                                <span
                                  className="inline-block h-2 w-2 rounded-full bg-amber-500 shrink-0"
                                  title={`Riesgo de débito: falta ${faltantes.map((f) => FALTANTE_LABELS[f]).join(', ')}`}
                                />
                              )
                            })()}
                            {orden.nombre_paciente}
                          </span>
                        </td>
                        <td className="px-3 md:px-5 py-4 hidden lg:table-cell">
                          <span
                            className={cn(
                              'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium',
                              orden.tipo === 'obra_social' ? 'bg-indigo-500/10 text-indigo-500' : 'bg-cyan-500/10 text-cyan-500',
                            )}
                          >
                            {orden.tipo === 'obra_social' ? 'OS' : 'Part.'}
                          </span>
                        </td>
                        <td className="px-3 md:px-5 py-4 text-muted-foreground hidden lg:table-cell">{orden.obra_social ?? '-'}</td>
                        <td className="px-3 md:px-5 py-4 hidden xl:table-cell">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-muted text-muted-foreground">
                            {orden.agente_facturador === 'circulo_medico' ? 'CM' : orden.agente_facturador === 'medical_group' ? 'MG' : 'Com.'}
                          </span>
                        </td>
                        <td className="px-3 md:px-5 py-4 text-muted-foreground hidden lg:table-cell">
                          <div className="max-w-[200px] truncate">{orden.nombre_practica ?? orden.codigo_practica ?? '-'}</div>
                        </td>
                        <td className="px-3 md:px-5 py-4 text-right font-mono font-medium text-foreground">{formatMonto(getMontoTotal(orden))}</td>
                        <td className="px-3 md:px-5 py-4">
                          <span className="inline-flex items-center gap-2">
                            <OrdenStatusBadge estado={orden.estado} />
                            {!evaluarCompletitud(orden).completa && (
                              <span
                                className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-500/10 text-amber-600"
                                title="Faltan datos para presentar esta orden"
                              >
                                Incompleta
                              </span>
                            )}
                          </span>
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
            onClick={() => setShowPlanilla(true)}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            Emitir planilla
          </button>
        </div>
      )}

      {showPlanilla && (
        <PresentarPlanillaDialog
          ordenes={selectedBorradores}
          onClose={() => { setShowPlanilla(false); setSelected(new Set()); fetchOrdenes(filters) }}
        />
      )}
    </div>
  )
}

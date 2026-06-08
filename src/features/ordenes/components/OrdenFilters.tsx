'use client'

import { useState } from 'react'
import { Search, Filter, Calendar, ChevronDown } from 'lucide-react'
import type { OrdenFilters as FilterType, TipoAtencion, EstadoOrden } from '../types/ordenes'
import { TIPOS_ATENCION, ESTADOS_ORDEN, OBRAS_SOCIALES, AGENTES_FACTURADORES, AGENTE_LABELS } from '../types/ordenes'

interface Props {
  onFilterChange: (filters: FilterType) => void
  initialFilters?: FilterType
}

const TIPO_LABELS: Record<TipoAtencion, string> = {
  obra_social: 'Obra Social',
  particular: 'Particular',
}

const ESTADO_LABELS: Record<EstadoOrden, string> = {
  borrador: 'Borrador',
  presentada: 'Presentada',
  aprobada: 'Aprobada',
  debitada: 'Debitada',
}

export function OrdenFilters({ onFilterChange, initialFilters = {} }: Props) {
  const [filters, setFilters] = useState<FilterType>(initialFilters)
  const [open, setOpen] = useState(false)

  const activos = Object.values(filters).filter(Boolean).length

  function updateFilter(key: keyof FilterType, value: string) {
    const updated = { ...filters, [key]: value || undefined }
    setFilters(updated)
    onFilterChange(updated)
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-4">
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/5 rounded-full blur-2xl pointer-events-none" />

      <div className="relative">
        {/* Encabezado clickeable — colapsa/despliega los filtros */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2"
          aria-expanded={open}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Filter className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Filtros</h3>
          {activos > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{activos}</span>
          )}
          <ChevronDown
            className="ml-auto h-4 w-4 text-muted-foreground transition-transform"
            style={{ transform: open ? 'rotate(180deg)' : 'none' }}
          />
        </button>

        {open && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 mt-4">
          {/* Busqueda */}
          <div className="relative md:col-span-2 lg:col-span-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar paciente..."
              value={filters.busqueda ?? ''}
              onChange={(e) => updateFilter('busqueda', e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-muted/50 border border-border/50 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none transition-colors"
            />
          </div>

          {/* Tipo */}
          <FilterSelect
            value={filters.tipo ?? ''}
            onChange={(v) => updateFilter('tipo', v)}
            placeholder="Todos los tipos"
            options={TIPOS_ATENCION.map((t) => ({ value: t, label: TIPO_LABELS[t] }))}
          />

          {/* Obra Social */}
          <FilterSelect
            value={filters.obra_social ?? ''}
            onChange={(v) => updateFilter('obra_social', v)}
            placeholder="Todas las OS"
            options={OBRAS_SOCIALES.map((os) => ({ value: os, label: os }))}
          />

          {/* Estado */}
          <FilterSelect
            value={filters.estado ?? ''}
            onChange={(v) => updateFilter('estado', v)}
            placeholder="Todos los estados"
            options={ESTADOS_ORDEN.map((e) => ({ value: e, label: ESTADO_LABELS[e] }))}
          />

          {/* Agente */}
          <FilterSelect
            value={filters.agente_facturador ?? ''}
            onChange={(v) => updateFilter('agente_facturador', v)}
            placeholder="Todos los agentes"
            options={AGENTES_FACTURADORES.map((a) => ({ value: a, label: AGENTE_LABELS[a] }))}
          />

          {/* Fecha desde */}
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="date"
              value={filters.fecha_desde ?? ''}
              onChange={(e) => updateFilter('fecha_desde', e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-muted/50 border border-border/50 text-sm text-foreground focus:border-primary/50 focus:outline-none transition-colors"
            />
          </div>
        </div>
        )}
      </div>
    </div>
  )
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2.5 rounded-xl bg-muted/50 border border-border/50 text-sm text-foreground focus:border-primary/50 focus:outline-none transition-colors appearance-none cursor-pointer"
    >
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

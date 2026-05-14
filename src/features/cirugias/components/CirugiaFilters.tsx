'use client'

import { useState } from 'react'
import { Search, Filter, Calendar } from 'lucide-react'
import type { CirugiaFilters as FilterType, EstadoCirugia, NivelCirugia } from '../types/cirugias'
import { ESTADOS_CIRUGIA, OBRAS_SOCIALES, AGENTES_FACTURADORES, AGENTE_LABELS, NIVELES_CIRUGIA, NIVEL_LABELS } from '../types/cirugias'

interface Props {
  onFilterChange: (filters: FilterType) => void
  initialFilters?: FilterType
}

const ESTADO_LABELS: Record<EstadoCirugia, string> = {
  borrador: 'Borrador',
  presentada: 'Presentada',
  aprobada: 'Aprobada',
  debitada: 'Debitada',
}

export function CirugiaFilters({ onFilterChange, initialFilters = {} }: Props) {
  const [filters, setFilters] = useState<FilterType>(initialFilters)

  function updateFilter(key: keyof FilterType, value: string) {
    const parsedValue = key === 'nivel' && value ? (Number(value) as NivelCirugia) : value || undefined
    const updated = { ...filters, [key]: parsedValue } as FilterType
    setFilters(updated)
    onFilterChange(updated)
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6">
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-pink-500/5 rounded-full blur-2xl pointer-events-none" />

      <div className="relative">
        <div className="flex items-center gap-2 mb-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-pink-500/10">
            <Filter className="h-4 w-4 text-pink-500" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Filtros de busqueda</h3>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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

          <FilterSelect
            value={filters.obra_social ?? ''}
            onChange={(v) => updateFilter('obra_social', v)}
            placeholder="Todas las OS"
            options={OBRAS_SOCIALES.map((os) => ({ value: os, label: os }))}
          />

          <FilterSelect
            value={filters.estado ?? ''}
            onChange={(v) => updateFilter('estado', v)}
            placeholder="Todos los estados"
            options={ESTADOS_CIRUGIA.map((e) => ({ value: e, label: ESTADO_LABELS[e] }))}
          />

          <FilterSelect
            value={filters.nivel?.toString() ?? ''}
            onChange={(v) => updateFilter('nivel', v)}
            placeholder="Todos los niveles"
            options={NIVELES_CIRUGIA.map((n) => ({ value: n.toString(), label: NIVEL_LABELS[n] }))}
          />

          <FilterSelect
            value={filters.agente_facturador ?? ''}
            onChange={(v) => updateFilter('agente_facturador', v)}
            placeholder="Todos los agentes"
            options={AGENTES_FACTURADORES.map((a) => ({ value: a, label: AGENTE_LABELS[a] }))}
          />

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

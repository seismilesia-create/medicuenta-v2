'use client'

import { useState } from 'react'
import type { OrdenFilters as FilterType, TipoAtencion, EstadoOrden } from '../types/ordenes'
import { TIPOS_ATENCION, ESTADOS_ORDEN, OBRAS_SOCIALES } from '../types/ordenes'

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

  function updateFilter(key: keyof FilterType, value: string) {
    const updated = { ...filters, [key]: value || undefined }
    setFilters(updated)
    onFilterChange(updated)
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:flex md:flex-wrap gap-3 md:gap-4 p-3 md:p-5 rounded-xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      {/* Busqueda */}
      <div className="sm:col-span-2 md:flex-1 md:min-w-[200px]">
        <input
          type="text"
          placeholder="Buscar paciente..."
          value={filters.busqueda ?? ''}
          onChange={(e) => updateFilter('busqueda', e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-lg text-sm"
          style={{
            background: 'var(--color-background)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-foreground)',
          }}
        />
      </div>

      {/* Tipo */}
      <select
        value={filters.tipo ?? ''}
        onChange={(e) => updateFilter('tipo', e.target.value)}
        className="px-3.5 py-2.5 rounded-lg text-sm"
        style={{
          background: 'var(--color-background)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-foreground)',
        }}
      >
        <option value="">Todos los tipos</option>
        {TIPOS_ATENCION.map((tipo) => (
          <option key={tipo} value={tipo}>{TIPO_LABELS[tipo]}</option>
        ))}
      </select>

      {/* Obra Social */}
      <select
        value={filters.obra_social ?? ''}
        onChange={(e) => updateFilter('obra_social', e.target.value)}
        className="px-3.5 py-2.5 rounded-lg text-sm"
        style={{
          background: 'var(--color-background)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-foreground)',
        }}
      >
        <option value="">Todas las OS</option>
        {OBRAS_SOCIALES.map((os) => (
          <option key={os} value={os}>{os}</option>
        ))}
      </select>

      {/* Estado */}
      <select
        value={filters.estado ?? ''}
        onChange={(e) => updateFilter('estado', e.target.value)}
        className="px-3.5 py-2.5 rounded-lg text-sm"
        style={{
          background: 'var(--color-background)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-foreground)',
        }}
      >
        <option value="">Todos los estados</option>
        {ESTADOS_ORDEN.map((estado) => (
          <option key={estado} value={estado}>{ESTADO_LABELS[estado]}</option>
        ))}
      </select>

      {/* Fecha desde */}
      <input
        type="date"
        value={filters.fecha_desde ?? ''}
        onChange={(e) => updateFilter('fecha_desde', e.target.value)}
        className="px-3.5 py-2.5 rounded-lg text-sm"
        style={{
          background: 'var(--color-background)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-foreground)',
        }}
      />

      {/* Fecha hasta */}
      <input
        type="date"
        value={filters.fecha_hasta ?? ''}
        onChange={(e) => updateFilter('fecha_hasta', e.target.value)}
        className="px-3.5 py-2.5 rounded-lg text-sm"
        style={{
          background: 'var(--color-background)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-foreground)',
        }}
      />
    </div>
  )
}

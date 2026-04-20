'use client'

import { useState } from 'react'
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
    const parsedValue = key === 'nivel' && value ? (Number(value) as NivelCirugia) : (value || undefined)
    const updated = { ...filters, [key]: parsedValue } as FilterType
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
        {ESTADOS_CIRUGIA.map((estado) => (
          <option key={estado} value={estado}>{ESTADO_LABELS[estado]}</option>
        ))}
      </select>

      {/* Nivel */}
      <select
        value={filters.nivel ?? ''}
        onChange={(e) => updateFilter('nivel', e.target.value)}
        className="px-3.5 py-2.5 rounded-lg text-sm"
        style={{
          background: 'var(--color-background)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-foreground)',
        }}
      >
        <option value="">Todos los niveles</option>
        {NIVELES_CIRUGIA.map((n) => (
          <option key={n} value={n}>{NIVEL_LABELS[n]}</option>
        ))}
      </select>

      {/* Agente facturador */}
      <select
        value={filters.agente_facturador ?? ''}
        onChange={(e) => updateFilter('agente_facturador', e.target.value)}
        className="px-3.5 py-2.5 rounded-lg text-sm"
        style={{
          background: 'var(--color-background)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-foreground)',
        }}
      >
        <option value="">Todos los agentes</option>
        {AGENTES_FACTURADORES.map((a) => (
          <option key={a} value={a}>{AGENTE_LABELS[a]}</option>
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

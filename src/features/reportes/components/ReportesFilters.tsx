'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Filter } from 'lucide-react'
import {
  PERIODO_LABELS,
  TIPO_REPORTE_LABELS,
  NIVEL_FILTRO_LABELS,
  type ReportesFilters,
  type Periodo,
  type TipoReporte,
  type NivelFiltro,
  type AgenteFiltro,
} from '../types/reportes'
import { AGENTE_LABELS } from '@/features/ordenes/types/ordenes'
import { buildFiltersUrl } from '../lib/filters'

interface Props {
  filters: ReportesFilters
  obrasSocialesDisponibles: string[]
  institucionesDisponibles: string[]
  rango?: { desde: string; hasta: string }
}

export function ReportesFiltersBar({ filters, obrasSocialesDisponibles, institucionesDisponibles, rango }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function update(overrides: Partial<ReportesFilters>) {
    const url = buildFiltersUrl(filters, overrides)
    startTransition(() => router.push(url))
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6">
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl pointer-events-none" />

      <div className="relative">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
              <Filter className="h-4 w-4 text-blue-500" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Filtros del reporte</h3>
          </div>
          {rango && (
            <span className="text-xs text-muted-foreground">
              Periodo: {rango.desde} a {rango.hasta}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Field label="Periodo">
            <FilterSelect
              value={filters.periodo}
              onChange={(v) => update({ periodo: v as Periodo })}
              disabled={isPending}
              options={Object.entries(PERIODO_LABELS).map(([k, v]) => ({ value: k, label: v }))}
            />
          </Field>

          <Field label="Obra social">
            <FilterSelect
              value={filters.obra_social ?? 'all'}
              onChange={(v) => update({ obra_social: v === 'all' ? undefined : v })}
              disabled={isPending}
              options={[{ value: 'all', label: 'Todas' }, ...obrasSocialesDisponibles.map((os) => ({ value: os, label: os }))]}
            />
          </Field>

          <Field label="Tipo">
            <FilterSelect
              value={filters.tipo}
              onChange={(v) => update({ tipo: v as TipoReporte })}
              disabled={isPending}
              options={Object.entries(TIPO_REPORTE_LABELS).map(([k, v]) => ({ value: k, label: v }))}
            />
          </Field>

          <Field label="Nivel">
            <FilterSelect
              value={filters.nivel}
              onChange={(v) => update({ nivel: v as NivelFiltro })}
              disabled={isPending}
              options={Object.entries(NIVEL_FILTRO_LABELS).map(([k, v]) => ({ value: k, label: v }))}
            />
          </Field>

          <Field label="Agente">
            <FilterSelect
              value={filters.agente}
              onChange={(v) => update({ agente: v as AgenteFiltro })}
              disabled={isPending}
              options={[
                { value: 'todos', label: 'Todos' },
                { value: 'circulo_medico', label: AGENTE_LABELS.circulo_medico },
                { value: 'medical_group', label: AGENTE_LABELS.medical_group },
                { value: 'comunidad', label: AGENTE_LABELS.comunidad },
              ]}
            />
          </Field>

          <Field label="Institucion">
            <FilterSelect
              value={filters.institucion ?? 'all'}
              onChange={(v) => update({ institucion: v === 'all' ? undefined : v })}
              disabled={isPending}
              options={[{ value: 'all', label: 'Todas' }, ...institucionesDisponibles.map((i) => ({ value: i, label: i }))]}
            />
          </Field>
        </div>

        {filters.periodo === 'personalizado' && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Desde">
              <input
                type="date"
                value={filters.fecha_desde ?? ''}
                onChange={(e) => update({ fecha_desde: e.target.value || undefined })}
                className="w-full px-3 py-2.5 rounded-xl bg-muted/50 border border-border/50 text-sm text-foreground focus:border-primary/50 focus:outline-none transition-colors"
              />
            </Field>
            <Field label="Hasta">
              <input
                type="date"
                value={filters.fecha_hasta ?? ''}
                onChange={(e) => update({ fecha_hasta: e.target.value || undefined })}
                className="w-full px-3 py-2.5 rounded-xl bg-muted/50 border border-border/50 text-sm text-foreground focus:border-primary/50 focus:outline-none transition-colors"
              />
            </Field>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium mb-2 text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function FilterSelect({
  value,
  onChange,
  disabled,
  options,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full px-3 py-2.5 rounded-xl bg-muted/50 border border-border/50 text-sm text-foreground focus:border-primary/50 focus:outline-none transition-colors appearance-none cursor-pointer disabled:opacity-50"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

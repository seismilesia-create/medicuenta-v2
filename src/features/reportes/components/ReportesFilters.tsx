'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
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
}

export function ReportesFiltersBar({ filters, obrasSocialesDisponibles, institucionesDisponibles }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function update(overrides: Partial<ReportesFilters>) {
    const url = buildFiltersUrl(filters, overrides)
    startTransition(() => router.push(url))
  }

  const baseStyle = {
    background: 'var(--color-background)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-foreground)',
  } as const

  return (
    <div
      className="rounded-xl p-4 md:p-5"
      style={{ backgroundColor: 'var(--color-surface)' }}
    >
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Field label="Período">
          <select
            value={filters.periodo}
            onChange={(e) => update({ periodo: e.target.value as Periodo })}
            disabled={isPending}
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={baseStyle}
          >
            {Object.entries(PERIODO_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </Field>

        <Field label="Obra social">
          <select
            value={filters.obra_social ?? 'all'}
            onChange={(e) => update({ obra_social: e.target.value === 'all' ? undefined : e.target.value })}
            disabled={isPending}
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={baseStyle}
          >
            <option value="all">Todas</option>
            {obrasSocialesDisponibles.map((os) => (
              <option key={os} value={os}>{os}</option>
            ))}
          </select>
        </Field>

        <Field label="Tipo">
          <select
            value={filters.tipo}
            onChange={(e) => update({ tipo: e.target.value as TipoReporte })}
            disabled={isPending}
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={baseStyle}
          >
            {Object.entries(TIPO_REPORTE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </Field>

        <Field label="Nivel">
          <select
            value={filters.nivel}
            onChange={(e) => update({ nivel: e.target.value as NivelFiltro })}
            disabled={isPending}
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={baseStyle}
          >
            {Object.entries(NIVEL_FILTRO_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </Field>

        <Field label="Agente">
          <select
            value={filters.agente}
            onChange={(e) => update({ agente: e.target.value as AgenteFiltro })}
            disabled={isPending}
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={baseStyle}
          >
            <option value="todos">Todos</option>
            <option value="circulo_medico">{AGENTE_LABELS.circulo_medico}</option>
            <option value="medical_group">{AGENTE_LABELS.medical_group}</option>
            <option value="comunidad">{AGENTE_LABELS.comunidad}</option>
          </select>
        </Field>

        <Field label="Institución">
          <select
            value={filters.institucion ?? 'all'}
            onChange={(e) => update({ institucion: e.target.value === 'all' ? undefined : e.target.value })}
            disabled={isPending}
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={baseStyle}
          >
            <option value="all">Todas</option>
            {institucionesDisponibles.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        </Field>
      </div>

      {filters.periodo === 'personalizado' && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Desde">
            <input
              type="date"
              value={filters.fecha_desde ?? ''}
              onChange={(e) => update({ fecha_desde: e.target.value || undefined })}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={baseStyle}
            />
          </Field>
          <Field label="Hasta">
            <input
              type="date"
              value={filters.fecha_hasta ?? ''}
              onChange={(e) => update({ fecha_hasta: e.target.value || undefined })}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={baseStyle}
            />
          </Field>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-foreground-secondary)' }}>
        {label}
      </span>
      {children}
    </label>
  )
}

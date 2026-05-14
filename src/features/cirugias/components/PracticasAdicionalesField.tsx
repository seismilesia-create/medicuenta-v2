'use client'

import { useState, useCallback, useMemo } from 'react'
import { PracticaAutocomplete } from '@/features/ordenes/components/PracticaAutocomplete'
import type { PracticaAdicional } from '../types/cirugias'
import type { Prestacion } from '@/features/ordenes/types/ordenes'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  obraSocial: string
  value: PracticaAdicional[]
  onChange: (practicas: PracticaAdicional[]) => void
  /** Total bruto de la practica principal (honorarios + gastos) — used to
   *  determine rank when applying the 100% / 50% OSEP rule. */
  practicaPrincipalTotal: number
}

interface PracticaConPorcentaje extends PracticaAdicional {
  /** Percentage applied to honorarios: 100 or 50 */
  porcentajeHonorarios: 100 | 50
  /** honorarios * (porcentajeHonorarios / 100) */
  honorariosCalculados: number
  /** honorariosCalculados + gastos */
  subtotal: number
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const formatMonto = (valor: number): string =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(valor)

/**
 * Applies the OSEP multiple-intervention rule to a list of additional
 * practices, taking the principal practice total into account.
 *
 * Rule:
 *  - Sort ALL practices (principal + adicionales) by their `total` value
 *    descending.
 *  - The single highest-value practice earns 100% of its honorarios.
 *  - Every other practice earns 50% of its honorarios.
 *  - Gastos are always billed at 100%.
 */
function applyOsepRule(
  practicas: PracticaAdicional[],
  principalTotal: number,
): PracticaConPorcentaje[] {
  if (practicas.length === 0) return []

  // Build a combined list: principal placeholder + adicionales
  // We only need the totals for ranking purposes.
  const allTotals: number[] = [principalTotal, ...practicas.map((p) => p.total)]
  const maxTotal = Math.max(...allTotals)

  return practicas.map((p) => {
    // A practica gets 100% only when its total equals the overall maximum
    // AND the principal does NOT also share that maximum value already
    // occupying the first rank. We handle ties conservatively: the
    // principal is considered to have claimed the top slot; any
    // additional practice with the same total still gets 50%.
    const isPrincipalMax = principalTotal >= p.total
    const isStrictlyHigherThanPrincipal = p.total > principalTotal

    let porcentaje: 100 | 50
    if (isStrictlyHigherThanPrincipal && p.total === maxTotal) {
      // This additional practice is the true maximum — it claims 100%.
      // Check no other additional practice already claimed 100%.
      const otherHigher = practicas.some(
        (other) => other !== p && other.total >= p.total,
      )
      porcentaje = otherHigher ? 50 : 100
    } else {
      // Principal holds the top rank, or another practica outranks this one.
      porcentaje = isPrincipalMax ? 50 : (() => {
        // Among adicionales only, check if this one is the highest and
        // the principal is not the overall maximum.
        const higherExists = practicas.some((other) => other !== p && other.total >= p.total)
        return higherExists ? 50 : 100
      })()
    }

    const honorariosCalculados = p.honorarios * (porcentaje / 100)
    return {
      ...p,
      porcentajeHonorarios: porcentaje,
      honorariosCalculados,
      subtotal: honorariosCalculados + p.gastos,
    }
  })
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface PracticaRowProps {
  practica: PracticaConPorcentaje
  onRemove: () => void
}

function PracticaRow({ practica, onRemove }: PracticaRowProps) {
  const is100 = practica.porcentajeHonorarios === 100

  return (
    <div
      className="rounded-lg p-3 md:p-4"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
      }}
    >
      {/* Header row: codigo + badge + remove */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="font-mono text-xs font-bold shrink-0"
            style={{ color: 'var(--color-primary)' }}
          >
            {practica.codigo}
          </span>
          {/* 100% / 50% badge */}
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold shrink-0"
            style={{
              backgroundColor: is100
                ? 'rgba(34,197,94,0.12)'
                : 'rgba(234,179,8,0.12)',
              color: is100
                ? 'var(--color-success)'
                : 'var(--color-warning, #ca8a04)',
            }}
            title={
              is100
                ? 'Esta practica cobra el 100% de sus honorarios (mayor valor)'
                : 'Esta practica cobra el 50% de sus honorarios (regla OSEP)'
            }
          >
            {practica.porcentajeHonorarios}%
          </span>
        </div>

        {/* Remove button */}
        <button
          type="button"
          onClick={onRemove}
          className="p-1 rounded-md transition-colors hover:bg-black/[0.06] dark:hover:bg-white/[0.08] shrink-0"
          style={{ color: 'var(--color-error)' }}
          aria-label={`Quitar practica ${practica.codigo}`}
          title="Quitar practica"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Detalle */}
      <p className="text-xs mb-3 line-clamp-2" style={{ color: 'var(--color-foreground)' }}>
        {practica.detalle}
      </p>

      {/* Montos grid */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        {/* Honorarios */}
        <div>
          <span className="block mb-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
            Honorarios
          </span>
          <span className="font-mono" style={{ color: 'var(--color-foreground)' }}>
            {formatMonto(practica.honorariosCalculados)}
          </span>
          {practica.porcentajeHonorarios === 50 && (
            <span className="block font-mono text-[10px]" style={{ color: 'var(--color-muted-foreground)' }}>
              (de {formatMonto(practica.honorarios)})
            </span>
          )}
        </div>

        {/* Gastos */}
        <div>
          <span className="block mb-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
            Gastos
          </span>
          <span className="font-mono" style={{ color: 'var(--color-foreground)' }}>
            {formatMonto(practica.gastos)}
          </span>
        </div>

        {/* Subtotal */}
        <div>
          <span className="block mb-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
            Subtotal
          </span>
          <span className="font-mono font-semibold" style={{ color: 'var(--color-success)' }}>
            {formatMonto(practica.subtotal)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div
      className="rounded-lg p-5 text-center"
      style={{
        background: 'var(--color-surface)',
        border: '1px dashed var(--color-border)',
      }}
    >
      <svg
        className="w-8 h-8 mx-auto mb-2"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
        style={{ color: 'var(--color-muted-foreground)' }}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
        />
      </svg>
      <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
        Sin practicas adicionales
      </p>
      <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)' }}>
        Busca y agrega prestaciones del nomenclador
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PracticasAdicionalesField({
  obraSocial,
  value,
  onChange,
  practicaPrincipalTotal,
}: Props) {
  // Key to reset the autocomplete input after a selection
  const [autocompleteKey, setAutocompleteKey] = useState(0)

  // Compute display list with OSEP percentages applied
  const practicasConPorcentaje = useMemo<PracticaConPorcentaje[]>(
    () => applyOsepRule(value, practicaPrincipalTotal),
    [value, practicaPrincipalTotal],
  )

  const subtotal = useMemo(
    () => practicasConPorcentaje.reduce((sum, p) => sum + p.subtotal, 0),
    [practicasConPorcentaje],
  )

  const handleSelect = useCallback(
    (prestacion: Prestacion) => {
      // Prevent duplicate additions (same codigo)
      const alreadyAdded = value.some((p) => p.codigo === prestacion.codigo)
      if (alreadyAdded) return

      const nueva: PracticaAdicional = {
        codigo: prestacion.codigo,
        detalle: prestacion.detalle,
        honorarios: prestacion.honorarios ?? 0,
        gastos: prestacion.gastos ?? 0,
        total: prestacion.total ?? 0,
      }

      onChange([...value, nueva])
      // Reset autocomplete input
      setAutocompleteKey((k) => k + 1)
    },
    [value, onChange],
  )

  const handleRemove = useCallback(
    (index: number) => {
      const updated = value.filter((_, i) => i !== index)
      onChange(updated)
    },
    [value, onChange],
  )

  return (
    <section aria-label="Practicas adicionales">
      {/* Autocomplete search */}
      <div className="mb-4">
        <PracticaAutocomplete
          key={autocompleteKey}
          obraSocial={obraSocial}
          onSelect={handleSelect}
          value=""
        />
        <p className="mt-1.5 text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
          Busca por codigo o nombre de prestacion y selecciona para agregar
        </p>
      </div>

      {/* OSEP rule info pill */}
      {obraSocial === 'OSEP' && (
        <div
          className="flex items-start gap-2 rounded-lg px-3 py-2 mb-4 text-xs"
          style={{
            background: 'rgba(0,113,227,0.06)',
            border: '1px solid rgba(0,113,227,0.15)',
            color: 'var(--color-primary)',
          }}
          role="note"
          aria-label="Informacion sobre regla OSEP"
        >
          <svg
            className="w-4 h-4 shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>
            Regla OSEP: la practica de mayor valor cobra <strong>100%</strong> de honorarios.
            Las demas cobran <strong>50%</strong>. Los gastos siempre al 100%.
          </span>
        </div>
      )}

      {/* List of added practices */}
      {value.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-2" role="list" aria-label="Practicas adicionales agregadas">
          {practicasConPorcentaje.map((practica, index) => (
            <div key={`${practica.codigo}-${index}`} role="listitem">
              <PracticaRow
                practica={practica}
                onRemove={() => handleRemove(index)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Subtotal footer */}
      {value.length > 0 && (
        <div
          className="flex items-center justify-between mt-3 px-4 py-2.5 rounded-lg"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
          }}
        >
          <span className="text-sm font-medium" style={{ color: 'var(--color-foreground)' }}>
            Subtotal practicas adicionales
            <span className="ml-1 text-xs font-normal" style={{ color: 'var(--color-muted-foreground)' }}>
              ({value.length} {value.length === 1 ? 'practica' : 'practicas'})
            </span>
          </span>
          <span
            className="font-mono font-bold text-base"
            style={{ color: 'var(--color-success)' }}
          >
            {formatMonto(subtotal)}
          </span>
        </div>
      )}
    </section>
  )
}

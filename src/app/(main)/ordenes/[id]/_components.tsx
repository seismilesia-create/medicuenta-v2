'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { updateOrdenEstado, deleteOrden } from '@/actions/ordenes'
import { TRANSICIONES_ORDEN } from '@/features/ordenes/types/ordenes'
import type { EstadoOrden } from '@/features/ordenes/types/ordenes'

// ---------------------------------------------------------------------------
// DeleteOrdenButton
// ---------------------------------------------------------------------------

export function DeleteOrdenButton({ ordenId }: { ordenId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    const confirmed = window.confirm(
      '¿Estás seguro de que deseas eliminar esta orden? Esta acción no se puede deshacer.'
    )
    if (!confirmed) return

    setLoading(true)
    try {
      const result = await deleteOrden(ordenId)
      if (result?.error) {
        alert(`Error al eliminar: ${result.error}`)
        return
      }
      router.push('/ordenes')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={loading}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        backgroundColor: 'var(--color-error)',
        color: '#ffffff',
      }}
    >
      {loading ? 'Eliminando...' : 'Eliminar'}
    </button>
  )
}

// ---------------------------------------------------------------------------
// EstadoSelector
// ---------------------------------------------------------------------------

const ESTADO_LABELS: Record<EstadoOrden, string> = {
  borrador: 'Borrador',
  presentada: 'Presentada',
  aprobada: 'Aprobada',
  debitada: 'Debitada',
}

export function EstadoSelector({
  ordenId,
  estadoActual,
}: {
  ordenId: string
  estadoActual: EstadoOrden
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<EstadoOrden>(estadoActual)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSave() {
    if (selected === estadoActual) return

    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const result = await updateOrdenEstado(ordenId, selected)
      if (result?.error) {
        setError(result.error)
        return
      }
      setSuccess(true)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  // Solo ofrecemos las transiciones válidas desde el estado actual (+ el actual).
  const opciones: EstadoOrden[] = [estadoActual, ...TRANSICIONES_ORDEN[estadoActual]]

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={selected}
        onChange={(e) => {
          setSelected(e.target.value as EstadoOrden)
          setSuccess(false)
        }}
        disabled={loading}
        className="rounded-lg px-3 py-2 text-sm border outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          backgroundColor: 'var(--color-surface)',
          color: 'var(--color-foreground)',
          borderColor: 'var(--color-border)',
        }}
        aria-label="Seleccionar nuevo estado"
      >
        {opciones.map((estado) => (
          <option key={estado} value={estado}>
            {ESTADO_LABELS[estado]}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={handleSave}
        disabled={loading || selected === estadoActual}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          backgroundColor: 'var(--color-primary)',
          color: '#ffffff',
        }}
      >
        {loading ? 'Guardando...' : 'Guardar estado'}
      </button>

      {error && (
        <span className="text-sm" style={{ color: 'var(--color-error)' }}>
          {error}
        </span>
      )}
      {success && (
        <span className="text-sm" style={{ color: 'var(--color-success)' }}>
          Estado actualizado
        </span>
      )}
    </div>
  )
}

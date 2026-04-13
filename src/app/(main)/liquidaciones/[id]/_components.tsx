'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { updateLiquidacionEstado, deleteLiquidacion } from '@/actions/liquidaciones'
import { ESTADOS_LIQUIDACION } from '@/features/liquidaciones/types/liquidaciones'
import type { EstadoLiquidacion } from '@/features/liquidaciones/types/liquidaciones'

// ---------------------------------------------------------------------------
// DeleteLiquidacionButton
// ---------------------------------------------------------------------------

export function DeleteLiquidacionButton({ liquidacionId }: { liquidacionId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    const confirmed = window.confirm(
      '¿Estas seguro de que deseas eliminar esta liquidacion? Esta accion no se puede deshacer.'
    )
    if (!confirmed) return

    setLoading(true)
    try {
      const result = await deleteLiquidacion(liquidacionId)
      if (result?.error) {
        alert(`Error al eliminar: ${result.error}`)
        return
      }
      router.push('/liquidaciones')
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
// EstadoLiquidacionSelector
// ---------------------------------------------------------------------------

const ESTADO_LABELS: Record<EstadoLiquidacion, string> = {
  pendiente: 'Pendiente',
  parcial: 'Parcial',
  pagado: 'Pagado',
}

export function EstadoLiquidacionSelector({
  liquidacionId,
  estadoActual,
}: {
  liquidacionId: string
  estadoActual: EstadoLiquidacion
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<EstadoLiquidacion>(estadoActual)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSave() {
    if (selected === estadoActual) return

    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const result = await updateLiquidacionEstado(liquidacionId, selected)
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

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={selected}
        onChange={(e) => {
          setSelected(e.target.value as EstadoLiquidacion)
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
        {ESTADOS_LIQUIDACION.map((estado) => (
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

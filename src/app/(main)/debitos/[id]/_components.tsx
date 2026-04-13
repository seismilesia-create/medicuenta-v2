'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { deleteDebito, updateDebitoRefacturado } from '@/actions/debitos'

// ---------------------------------------------------------------------------
// DeleteDebitoButton
// ---------------------------------------------------------------------------

export function DeleteDebitoButton({ debitoId }: { debitoId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    const confirmed = window.confirm(
      '¿Estas seguro de que deseas eliminar este debito? Esta accion no se puede deshacer.'
    )
    if (!confirmed) return

    setLoading(true)
    try {
      const result = await deleteDebito(debitoId)
      if (result?.error) {
        alert(`Error al eliminar: ${result.error}`)
        return
      }
      router.push('/debitos')
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
// RefacturadoToggle
// ---------------------------------------------------------------------------

export function RefacturadoToggle({
  debitoId,
  refacturable,
  refacturado,
}: {
  debitoId: string
  refacturable: boolean
  refacturado: boolean
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleToggle() {
    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const result = await updateDebitoRefacturado(debitoId, !refacturado)
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

  if (!refacturable) {
    return (
      <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
        Este debito no es refacturable.
      </p>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={handleToggle}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          backgroundColor: refacturado ? 'var(--color-success)' : 'var(--color-primary)',
          color: '#ffffff',
        }}
      >
        {loading
          ? 'Actualizando...'
          : refacturado
            ? 'Marcado como refacturado'
            : 'Marcar como refacturado'}
      </button>

      {error && (
        <span className="text-sm" style={{ color: 'var(--color-error)' }}>{error}</span>
      )}
      {success && (
        <span className="text-sm" style={{ color: 'var(--color-success)' }}>Actualizado</span>
      )}
    </div>
  )
}

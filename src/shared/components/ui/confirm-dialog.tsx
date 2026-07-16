'use client'

import { useEffect } from 'react'

/**
 * Confirmación dentro de la app (reemplaza window.confirm, que rompe el diseño).
 * Mismo tratamiento visual que PresentarPlanillaDialog: overlay + card, click afuera
 * o Escape para cancelar.
 */
export function ConfirmDialog({
  titulo,
  mensaje,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  peligroso = false,
  onConfirm,
  onCancel,
}: {
  titulo: string
  mensaje: string
  confirmLabel?: string
  cancelLabel?: string
  /** Acción destructiva → botón rojo. */
  peligroso?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-foreground">{titulo}</h2>
        <p className="text-sm text-muted-foreground">{mensaje}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface)]"
          >
            {cancelLabel}
          </button>
          <button
            autoFocus
            onClick={onConfirm}
            className={
              'rounded-xl px-4 py-2 text-sm font-medium text-white ' +
              (peligroso ? 'bg-red-500 hover:bg-red-600' : 'bg-primary')
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

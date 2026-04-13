'use client'

import { useState } from 'react'
import { updateDebito } from '@/actions/debitos'
import { MOTIVOS_DEBITO, MOTIVO_LABELS, type DebitoFormData } from '../types/debitos'
import type { Debito } from '../types/debitos'

interface Props {
  debito: Debito
}

export function EditarDebitoForm({ debito }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const form = new FormData(e.currentTarget)

    const formData: DebitoFormData = {
      motivo: form.get('motivo') as DebitoFormData['motivo'],
      motivo_detalle: (form.get('motivo_detalle') as string) || undefined,
      monto: Number(form.get('monto') || 0),
      refacturable: form.get('refacturable') === 'on',
      fecha: form.get('fecha') as string,
    }

    const result = await updateDebito(debito.id, formData)

    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-2xl">
      {error && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400" style={{ border: '1px solid var(--color-error)' }}>
          {error}
        </div>
      )}

      {/* Motivo */}
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
          Motivo del debito *
        </label>
        <select name="motivo" required defaultValue={debito.motivo}
          className="w-full px-4 py-3 rounded-lg text-sm"
          style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-foreground)' }}
        >
          <option value="">Selecciona un motivo</option>
          {MOTIVOS_DEBITO.map((motivo) => (
            <option key={motivo} value={motivo}>{MOTIVO_LABELS[motivo]}</option>
          ))}
        </select>
      </div>

      {/* Detalle */}
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
          Detalle del motivo
        </label>
        <input name="motivo_detalle" type="text" defaultValue={debito.motivo_detalle || ''}
          placeholder="Informacion adicional sobre el debito (opcional)"
          className="w-full px-4 py-3 rounded-lg text-sm"
          style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-foreground)' }}
        />
        <p className="text-xs mt-1.5" style={{ color: 'var(--color-muted)' }}>
          Describe mas detalles sobre el motivo del debito
        </p>
      </div>

      {/* Monto */}
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
          Monto debitado *
        </label>
        <input name="monto" type="number" required min="0" step="0.01" defaultValue={debito.monto} placeholder="0.00"
          className="w-full px-3 py-2.5 rounded-lg text-sm font-mono"
          style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-foreground)' }}
        />
      </div>

      {/* Fecha */}
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
          Fecha del debito *
        </label>
        <input name="fecha" type="date" required defaultValue={debito.fecha}
          className="w-full px-4 py-3 rounded-lg text-sm"
          style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-foreground)' }}
        />
      </div>

      {/* Refacturable */}
      <div className="p-6 rounded-xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input name="refacturable" type="checkbox" className="mt-1" defaultChecked={debito.refacturable} />
          <div className="flex-1">
            <div className="text-sm font-medium" style={{ color: 'var(--color-foreground)' }}>
              ¿Es refacturable?
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
              Marca esta opcion si el debito puede corregirse y refacturarse en el futuro
            </p>
          </div>
        </label>
        <div className="mt-3 p-3 rounded-lg" style={{ background: 'var(--color-background)', border: '1px dashed var(--color-border)' }}>
          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
            <strong>Nota:</strong> Los debitos por falta de token, firma, diagnostico o error en codigo se marcan automaticamente como refacturables.
          </p>
        </div>
      </div>

      {/* Botones */}
      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={loading}
          className="flex-1 px-4 py-3.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
          style={{ background: 'var(--color-primary)' }}
        >
          {loading ? 'Guardando...' : 'Guardar cambios'}
        </button>
        <a href={`/debitos/${debito.id}`}
          className="px-4 py-3 rounded-lg text-sm font-medium transition-colors text-center"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-foreground)' }}
        >
          Cancelar
        </a>
      </div>
    </form>
  )
}

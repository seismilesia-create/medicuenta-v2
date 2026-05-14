'use client'

import { useState } from 'react'
import { updateLiquidacion } from '@/actions/liquidaciones'
import { OBRAS_SOCIALES, type LiquidacionFormData } from '../types/liquidaciones'
import type { Liquidacion } from '../types/liquidaciones'

interface Props {
  liquidacion: Liquidacion
}

export function EditarLiquidacionForm({ liquidacion }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const form = new FormData(e.currentTarget)

    const formData: LiquidacionFormData = {
      periodo_inicio: form.get('periodo_inicio') as string,
      periodo_fin: form.get('periodo_fin') as string,
      obra_social: (form.get('obra_social') as string) || undefined,
      monto_presentado: Number(form.get('monto_presentado') || 0),
      monto_liquidado: Number(form.get('monto_liquidado') || 0),
      monto_debitado: Number(form.get('monto_debitado') || 0),
      observaciones: (form.get('observaciones') as string) || undefined,
    }

    const result = await updateLiquidacion(liquidacion.id, formData)

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

      {/* Periodo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
            Periodo inicio *
          </label>
          <input name="periodo_inicio" type="date" required defaultValue={liquidacion.periodo_inicio}
            className="w-full px-4 py-3 rounded-lg text-sm"
            style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-foreground)' }}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
            Periodo fin *
          </label>
          <input name="periodo_fin" type="date" required defaultValue={liquidacion.periodo_fin}
            className="w-full px-4 py-3 rounded-lg text-sm"
            style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-foreground)' }}
          />
        </div>
      </div>

      {/* Obra Social */}
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
          Obra Social
        </label>
        <select name="obra_social" defaultValue={liquidacion.obra_social || ''}
          className="w-full px-3 py-2.5 rounded-lg text-sm"
          style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-foreground)' }}
        >
          <option value="">Todas</option>
          {OBRAS_SOCIALES.map((os) => (
            <option key={os} value={os}>{os}</option>
          ))}
        </select>
        <p className="text-xs mt-1.5" style={{ color: 'var(--color-muted-foreground)' }}>
          Dejar en blanco para liquidaciones de todas las obras sociales
        </p>
      </div>

      {/* Montos */}
      <div className="space-y-4 p-6 rounded-xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
          Montos de la Liquidacion
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
              Monto presentado *
            </label>
            <input name="monto_presentado" type="number" required min="0" step="0.01" defaultValue={liquidacion.monto_presentado} placeholder="0.00"
              className="w-full px-3 py-2.5 rounded-lg text-sm font-mono"
              style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-foreground)' }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
              Monto liquidado
            </label>
            <input name="monto_liquidado" type="number" min="0" step="0.01" defaultValue={liquidacion.monto_liquidado} placeholder="0.00"
              className="w-full px-3 py-2.5 rounded-lg text-sm font-mono"
              style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-foreground)' }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
              Monto debitado
            </label>
            <input name="monto_debitado" type="number" min="0" step="0.01" defaultValue={liquidacion.monto_debitado} placeholder="0.00"
              className="w-full px-3 py-2.5 rounded-lg text-sm font-mono"
              style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-foreground)' }}
            />
          </div>
        </div>
        <div className="p-3 rounded-lg" style={{ background: 'var(--color-background)', border: '1px dashed var(--color-border)' }}>
          <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
            <strong>Presentado:</strong> Total facturado a la OS. <strong>Liquidado:</strong> Lo que efectivamente paga la OS. <strong>Debitado:</strong> Descuentos/debitos aplicados.
          </p>
        </div>
      </div>

      {/* Observaciones */}
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
          Observaciones
        </label>
        <textarea name="observaciones" rows={3} defaultValue={liquidacion.observaciones || ''}
          placeholder="Notas adicionales sobre esta liquidacion (opcional)"
          className="w-full px-3 py-2.5 rounded-lg text-sm resize-none"
          style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-foreground)' }}
        />
      </div>

      {/* Botones */}
      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={loading}
          className="flex-1 px-4 py-3.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
          style={{ background: 'var(--color-primary)' }}
        >
          {loading ? 'Guardando...' : 'Guardar cambios'}
        </button>
        <a href={`/liquidaciones/${liquidacion.id}`}
          className="px-4 py-3 rounded-lg text-sm font-medium transition-colors text-center"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-foreground)' }}
        >
          Cancelar
        </a>
      </div>
    </form>
  )
}

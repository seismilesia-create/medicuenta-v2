'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { emitirPlanilla } from '@/actions/presentaciones'
import { agruparPorObraSocial } from '@/lib/ordenes/planilla'
import { evaluarRiesgoOrden, FALTANTE_LABELS } from '@/lib/ordenes/riesgo-debito'
import type { Orden } from '../types/ordenes'

export function PresentarPlanillaDialog({ ordenes, onClose }: { ordenes: Orden[]; onClose: () => void }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Solo obra social entra en la planilla (las particulares no se debitan ni se presentan).
  const ordenesOS = ordenes.filter((o) => o.tipo === 'obra_social')
  const particulares = ordenes.length - ordenesOS.length
  const enRiesgoIds = new Set(ordenesOS.filter((o) => evaluarRiesgoOrden(o).enRiesgo).map((o) => o.id))
  const riesgosas = ordenesOS.filter((o) => enRiesgoIds.has(o.id))

  async function emitir(soloOk: boolean) {
    const aPresentar = soloOk ? ordenesOS.filter((o) => !enRiesgoIds.has(o.id)) : ordenesOS
    if (aPresentar.length === 0) { setError('No quedan órdenes para presentar'); return }
    setLoading(true)
    setError(null)
    const grupos = agruparPorObraSocial(aPresentar.map((o) => ({
      id: o.id, obra_social: o.obra_social!, fecha_atencion: o.fecha_atencion,
      honorario_calculado: Number(o.honorario_calculado), monto_plus: Number(o.monto_plus),
    })))
    for (const g of grupos) {
      const res = await emitirPlanilla({
        obra_social: g.obra_social,
        agente_facturador: aPresentar.find((o) => o.obra_social === g.obra_social)?.agente_facturador ?? 'circulo_medico',
        orden_ids: g.ordenes.map((o) => o.id),
      })
      if (res?.error) { setError(res.error); setLoading(false); return }
    }
    setLoading(false)
    router.push('/ordenes/presentaciones')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-foreground">Emitir planilla</h2>
        <p className="text-sm text-muted-foreground">
          {ordenesOS.length} órdenes de obra social. Se emitirá una planilla por cada OS.{particulares > 0 ? ` (${particulares} particular${particulares === 1 ? '' : 'es'} no entran)` : ''}
        </p>

        {riesgosas.length > 0 && (
          <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-warning)' }}>
            <p className="font-medium" style={{ color: 'var(--color-warning)' }}>
              ⚠️ {riesgosas.length} con riesgo de débito
            </p>
            <ul className="mt-2 space-y-1" style={{ color: 'var(--color-foreground)' }}>
              {riesgosas.map((o) => (
                <li key={o.id}>• {o.nombre_paciente} ({o.obra_social}) — falta {evaluarRiesgoOrden(o).faltantes.map((f) => FALTANTE_LABELS[f]).join(', ')}</li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="text-sm" style={{ color: 'var(--color-error)' }}>{error}</p>}

        <div className="flex flex-col gap-2 pt-2">
          <button disabled={loading} onClick={() => emitir(false)}
            className="px-4 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ background: 'var(--color-primary)' }}>
            {loading ? 'Emitiendo...' : 'Presentar igual (todas)'}
          </button>
          {riesgosas.length > 0 && riesgosas.length < ordenesOS.length && (
            <button disabled={loading} onClick={() => emitir(true)}
              className="px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-foreground)' }}>
              Presentar solo las OK ({ordenesOS.length - riesgosas.length})
            </button>
          )}
          <button disabled={loading} onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: 'transparent', color: 'var(--color-muted-foreground)' }}>
            Cancelar y revisar
          </button>
        </div>
      </div>
    </div>
  )
}

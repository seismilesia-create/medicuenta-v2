'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { resolverFaltantes } from '@/actions/ordenes'
import { evaluarRiesgoOrden, FALTANTE_LABELS } from '@/lib/ordenes/riesgo-debito'
import type { Orden } from '../types/ordenes'

export function ResolverFaltantesPanel({ orden }: { orden: Orden }) {
  const router = useRouter()
  const { enRiesgo, faltantes } = evaluarRiesgoOrden(orden)
  const [firmaPaciente, setFirmaPaciente] = useState(orden.firma_paciente)
  const [firmaSelloMedico, setFirmaSelloMedico] = useState(orden.firma_sello_medico)
  const [diagnostico, setDiagnostico] = useState(orden.diagnostico_cie10 ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (orden.estado !== 'borrador' || !enRiesgo) return null

  async function confirmar() {
    setLoading(true)
    setError(null)
    const res = await resolverFaltantes(orden.id, {
      firma_paciente: firmaPaciente,
      firma_sello_medico: firmaSelloMedico,
      diagnostico_cie10: diagnostico,
    })
    setLoading(false)
    if (res?.error) { setError(res.error); return }
    router.refresh()
  }

  return (
    <section className="space-y-4 p-6 rounded-xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-warning)' }}>
      <div>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-warning)' }}>⚠️ Resolver faltantes</h3>
        <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)' }}>
          Esta orden tiene riesgo de débito ({faltantes.map((f) => FALTANTE_LABELS[f]).join(', ')}). Corregí la orden física y confirmá acá; queda registrado como constancia.
        </p>
      </div>

      {faltantes.includes('firma_afiliado') && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={firmaPaciente} onChange={(e) => setFirmaPaciente(e.target.checked)} className="w-4 h-4 rounded" style={{ accentColor: 'var(--color-primary)' }} />
          <span className="text-sm" style={{ color: 'var(--color-foreground)' }}>Ya está la firma del afiliado</span>
        </label>
      )}
      {faltantes.includes('firma_sello_medico') && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={firmaSelloMedico} onChange={(e) => setFirmaSelloMedico(e.target.checked)} className="w-4 h-4 rounded" style={{ accentColor: 'var(--color-primary)' }} />
          <span className="text-sm" style={{ color: 'var(--color-foreground)' }}>Ya está mi firma y sello</span>
        </label>
      )}
      {faltantes.includes('diagnostico') && (
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>Diagnóstico</label>
          <input value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)} placeholder="Ej: J00"
            className="w-full px-4 py-3 rounded-lg text-sm"
            style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-foreground)' }} />
        </div>
      )}

      {error && <p className="text-sm" style={{ color: 'var(--color-error)' }}>{error}</p>}

      <button onClick={confirmar} disabled={loading}
        className="px-4 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
        style={{ background: 'var(--color-primary)' }}>
        {loading ? 'Guardando...' : 'Confirmar que corregí los faltantes'}
      </button>
    </section>
  )
}

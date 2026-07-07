'use client'

import { useState } from 'react'
import { getRecetasPendientesConversacion, liberarReceta } from '@/actions/consultorio-recetas'

type Pendiente = { id: string; paciente_nombre: string; nro_receta: string | null; monto: number | null; created_at: string }

export function LiberarRecetaButton({ conversacionId }: { conversacionId: string }) {
  const [abierto, setAbierto] = useState(false)
  const [pendientes, setPendientes] = useState<Pendiente[]>([])
  const [sel, setSel] = useState<string>('')
  const [nroOrden, setNroOrden] = useState('')
  const [estado, setEstado] = useState<'idle' | 'cargando' | 'guardando'>('idle')
  const [msg, setMsg] = useState<string | null>(null)

  async function abrir() {
    setAbierto(true); setEstado('cargando'); setMsg(null)
    const res = await getRecetasPendientesConversacion(conversacionId)
    setEstado('idle')
    if ('error' in res) { setMsg(res.error ?? 'Ocurrió un error al buscar las recetas.'); return }
    setPendientes(res.recetas)
    if (res.recetas.length === 1) setSel(res.recetas[0].id)
  }

  async function confirmar() {
    if (!sel || !nroOrden.trim()) { setMsg('Elegí la receta y escribí el N° de orden.'); return }
    setEstado('guardando'); setMsg(null)
    const res = await liberarReceta({ recetaId: sel, nroOrden: nroOrden.trim() })
    setEstado('idle')
    if ('error' in res) { setMsg(res.error ?? 'Ocurrió un error al liberar la receta.'); return }
    setMsg('✅ Receta liberada — el bot ya se la envió al paciente.')
    setPendientes((p) => p.filter((x) => x.id !== sel)); setSel(''); setNroOrden('')
  }

  if (!abierto) {
    return (
      <button type="button" onClick={abrir}
        className="text-sm px-3 py-2 rounded-lg border border-border bg-card hover:bg-accent/50 text-foreground">
        Liberar receta por orden de consulta
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3 text-sm">
      {estado === 'cargando' ? (
        <p className="text-muted-foreground">Buscando recetas pendientes…</p>
      ) : pendientes.length === 0 ? (
        <p className="text-muted-foreground">No hay recetas pendientes de este paciente.</p>
      ) : (
        <>
          <ul className="space-y-1">
            {pendientes.map((r) => (
              <li key={r.id}>
                <label className="flex items-center gap-2">
                  <input type="radio" name="receta" checked={sel === r.id} onChange={() => setSel(r.id)} />
                  <span>{r.paciente_nombre}{r.nro_receta ? ` · N° ${r.nro_receta}` : ''}{r.monto != null ? ` · $${r.monto.toLocaleString('es-AR')}` : ''}</span>
                </label>
              </li>
            ))}
          </ul>
          <input value={nroOrden} onChange={(e) => setNroOrden(e.target.value)} placeholder="N° de orden de consulta"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground" />
          <button type="button" onClick={confirmar} disabled={estado === 'guardando'}
            className="text-sm px-3 py-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-50">
            {estado === 'guardando' ? 'Liberando…' : 'Liberar y enviar'}
          </button>
        </>
      )}
      {msg && <p className="text-muted-foreground">{msg}</p>}
      <button type="button" onClick={() => setAbierto(false)} className="text-xs text-muted-foreground underline">Cerrar</button>
    </div>
  )
}

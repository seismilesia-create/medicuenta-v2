'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getBandeja, type ConversacionItem } from '@/features/consultorio/services/panelService'
import { HiloPanel } from './hilo-panel'

const POLL_MS = 15_000

const SEMAFORO_CLS: Record<string, string> = {
  alerta: 'border-l-4 border-l-red-500 bg-red-500/10',
  viva: 'border-l-4 border-l-emerald-500 bg-emerald-500/5',
  terminada: 'border-l-4 border-l-blue-400 bg-blue-500/5 opacity-80',
}

export function ConversacionesView({ medicoId, initialId }: { medicoId: string; initialId: string | null }) {
  const [items, setItems] = useState<ConversacionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [seleccionada, setSeleccionada] = useState<string | null>(initialId)
  const seq = useRef(0)

  const refetch = useCallback(async () => {
    const id = ++seq.current
    const supabase = createClient()
    try {
      const data = await getBandeja(supabase, medicoId)
      if (id !== seq.current) return
      setItems(data)
      setError(null)
    } catch {
      if (id !== seq.current) return
      setError('No pude cargar las conversaciones. Reintentando…')
    }
    if (id !== seq.current) return
    setLoading(false)
  }, [medicoId])

  useEffect(() => {
    refetch()
    const t = setInterval(refetch, POLL_MS)
    return () => clearInterval(t)
  }, [refetch])

  return (
    <div className="p-4 md:p-6 h-[calc(100dvh-8.5rem)] md:h-dvh flex flex-col">
      <h1 className="text-xl font-semibold mb-3">Conversaciones</h1>
      {error && (
        <div className="mb-3 p-3 rounded-lg text-sm bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-500/20">
          {error}
        </div>
      )}
      {/* En celular es master-detail: se ve la lista O el hilo (no los dos apilados,
          que dejaban el hilo en una ventanita). En lg vuelven lado a lado. */}
      <div className="flex-1 min-h-0 grid grid-rows-1 grid-cols-1 gap-4 lg:grid-cols-[3fr_7fr]">
        <div className={`min-w-0 min-h-0 rounded-2xl border border-border overflow-y-auto divide-y divide-border/50 ${seleccionada ? 'hidden lg:block' : ''}`}>
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <p className="p-6 text-sm text-center text-[var(--color-muted-foreground)]">
              Todavía no hay conversaciones del asistente.
            </p>
          ) : (
            items.map((c) => (
              <button
                key={c.id}
                onClick={() => setSeleccionada(c.id)}
                className={`w-full min-w-0 text-left px-3 py-3 transition hover:brightness-105 ${SEMAFORO_CLS[c.semaforo]} ${
                  seleccionada === c.id ? 'ring-1 ring-primary/40' : ''
                }`}
              >
                <p className="font-medium text-sm flex flex-wrap items-center gap-2">
                  {c.contactoNombre || c.contactoTelefono}
                  {c.semaforo === 'alerta' && (
                    <span className="text-[10px] font-bold bg-red-600 text-white rounded-full px-2 py-0.5">
                      NECESITA ATENCIÓN
                    </span>
                  )}
                  {c.botPausado && (
                    <span className="text-[10px] font-bold bg-amber-500/20 text-amber-600 rounded-full px-2 py-0.5">⏸ BOT PAUSADO</span>
                  )}
                </p>
                <p className="text-xs text-[var(--color-muted-foreground)] truncate">{c.ultimoMensaje}</p>
              </button>
            ))
          )}
        </div>
        <div className={`min-w-0 rounded-2xl border border-border min-h-0 ${seleccionada ? '' : 'hidden lg:block'}`}>
          {seleccionada ? (
            <HiloPanel medicoId={medicoId} conversacionId={seleccionada} onChange={refetch} onBack={() => setSeleccionada(null)} />
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-[var(--color-muted-foreground)]">
              Elegí una conversación
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

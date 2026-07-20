'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Loader2, Pause, Play, BellOff, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getHilo, type Hilo } from '@/features/consultorio/services/panelService'
import { responderComoHumano, setBotPausado, resolverAlarma } from '@/actions/consultorio-conversaciones'
import { LiberarRecetaButton } from '@/features/consultorio/components/conversaciones/liberar-receta'

const POLL_MS = 10_000

const BUBBLE: Record<string, string> = {
  paciente: 'self-start bg-[var(--color-muted,#78716c1a)] border border-border/60',
  ia: 'self-end bg-blue-500/15 border border-blue-500/25',
  humano: 'self-end bg-emerald-500/15 border border-emerald-500/30',
  medico: 'self-end bg-blue-500/15 border border-blue-500/25',
}

function horasRestantes(ms: number): string {
  return `${Math.floor(ms / 3_600_000)} h ${Math.floor((ms % 3_600_000) / 60_000)} min`
}

export function HiloPanel({ medicoId, conversacionId, onChange }: { medicoId: string; conversacionId: string; onChange: () => void }) {
  const [hilo, setHilo] = useState<Hilo | null>(null)
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const seq = useRef(0)

  const refetch = useCallback(async () => {
    const id = ++seq.current
    const supabase = createClient()
    try {
      const data = await getHilo(supabase, medicoId, conversacionId)
      if (id !== seq.current) return
      setHilo(data)
      setLoadError(false)
    } catch {
      if (id !== seq.current) return
      // Si no hay hilo cargado aún, marcamos el error para mostrar mensaje en lugar del spinner.
      setLoadError(true)
    }
  }, [medicoId, conversacionId])

  useEffect(() => {
    seq.current++ // invalida cualquier fetch en vuelo de la conversación anterior
    setHilo(null)
    setLoadError(false)
    refetch()
    const t = setInterval(refetch, POLL_MS)
    return () => clearInterval(t)
  }, [refetch])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [hilo?.mensajes.length])

  if (!hilo)
    return (
      <div className="h-full flex items-center justify-center">
        {loadError ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">No pude cargar la conversación. Reintentando…</p>
        ) : (
          <Loader2 className="animate-spin" />
        )}
      </div>
    )

  const ventanaAbierta = hilo.msVentana > 0

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!texto.trim()) return
    setEnviando(true)
    setError(null)
    const r = await responderComoHumano({ conversacionId, texto: texto.trim() })
    if ('error' in r && r.error) setError(r.error)
    else {
      setTexto('')
      await refetch()
      onChange()
    }
    setEnviando(false)
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2.5 border-b border-border/60">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">{hilo.contactoNombre || hilo.contactoTelefono}</p>
          <p className={`text-[11px] font-semibold ${ventanaAbierta ? 'text-emerald-600' : 'text-blue-500'}`}>
            {ventanaAbierta ? `● ventana abierta (cierra en ${horasRestantes(hilo.msVentana)})` : '○ ventana cerrada'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {hilo.necesitaHumano && (
            <button
              onClick={async () => {
                const r = await resolverAlarma(conversacionId)
                if ('error' in r && r.error) setError(r.error)
                refetch()
                onChange()
              }}
              className="text-xs flex items-center gap-1 rounded-lg border border-red-500/40 text-red-500 px-2 py-1"
            >
              <BellOff className="w-3 h-3" /> Resolver
            </button>
          )}
          <button
            onClick={async () => {
              const r = await setBotPausado(conversacionId, !hilo.botPausado)
              if ('error' in r && r.error) setError(r.error)
              refetch()
              onChange()
            }}
            className={`text-xs flex items-center gap-1 rounded-lg border px-2 py-1 ${
              hilo.botPausado ? 'border-emerald-500/40 text-emerald-600' : 'border-amber-500/40 text-amber-600'
            }`}
          >
            {hilo.botPausado ? (
              <>
                <Play className="w-3 h-3" /> Reanudar asistente
              </>
            ) : (
              <>
                <Pause className="w-3 h-3" /> Pausar asistente
              </>
            )}
          </button>
          <LiberarRecetaButton conversacionId={conversacionId} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
        {hilo.mensajes.map((m) => (
          <div key={m.id} className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${BUBBLE[m.origen] ?? BUBBLE.paciente}`}>
            <span className="block text-[9px] font-bold opacity-60 uppercase">
              {m.origen === 'ia' ? '🤖 asistente' : m.origen === 'humano' ? '🧑 humano' : m.origen}
              {' · '}
              {new Date(m.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
            </span>
            {m.contenido}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={enviar} className="p-3 border-t border-border/60 space-y-2">
        {error && (
          <div className="p-2 rounded-lg text-xs bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-500/20">
            {error}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            disabled={!ventanaAbierta || enviando}
            placeholder={
              ventanaAbierta
                ? hilo.botPausado
                  ? 'Escribí como humano (asistente pausado)…'
                  : 'Escribí como humano (conviene pausar el asistente primero)…'
                : 'Ventana cerrada: vas a poder responder cuando el paciente vuelva a escribir.'
            }
            className="flex-1 rounded-xl border border-border bg-[var(--color-background)] px-3 py-2 text-sm disabled:opacity-50"
          />
          <button
            disabled={!ventanaAbierta || enviando || !texto.trim()}
            className="rounded-xl bg-emerald-600 text-white px-4 disabled:opacity-50 flex items-center gap-1 text-sm font-medium"
          >
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Enviar
          </button>
        </div>
      </form>
    </div>
  )
}

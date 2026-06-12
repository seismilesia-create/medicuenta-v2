'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, AlertTriangle, Activity } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getBitacora, type RegistroBitacoraRow } from '@/features/consultorio/services/bitacoraService'
import { describirEvento } from '@/lib/consultorio/bitacora'
import { AR_TZ } from '@/lib/turnos/slots'

const ORIGEN_LABEL: Record<string, string> = {
  agente: 'Asistente',
  panel: 'Panel',
  webhook: 'WhatsApp',
  gcal: 'Calendar',
  mp: 'Pagos',
}

/** ISO → 'dd/mm HH:MM' en hora AR. */
function cuando(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: AR_TZ,
  }).format(new Date(iso))
}

export function ActividadAsistente({ medicoId }: { medicoId: string }) {
  const [rows, setRows] = useState<RegistroBitacoraRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [soloErrores, setSoloErrores] = useState(false)
  const [cargando, setCargando] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const data = await getBitacora(createClient(), medicoId, { limit: 40, soloErrores })
      setRows(data)
      setError(null)
    } catch {
      setError('No pude cargar la actividad. Reintentá.')
    } finally {
      setCargando(false)
    }
  }, [medicoId, soloErrores])

  useEffect(() => {
    cargar()
  }, [cargar])

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--color-muted-foreground)]">
        Lo que hizo el asistente y lo que pasó en el consultorio. Sirve para entender qué respondió y detectar
        si algo falló. Es solo lectura.
      </p>

      <div className="flex items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={soloErrores}
            onChange={(e) => setSoloErrores(e.target.checked)}
            className="w-3.5 h-3.5"
            style={{ accentColor: 'var(--color-primary)' }}
          />
          <span>Solo errores</span>
        </label>
        <button
          onClick={cargar}
          disabled={cargando}
          className="flex items-center gap-1 text-xs text-[var(--color-muted-foreground)] hover:opacity-70 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-500/20">
          {error}
        </div>
      )}

      {!rows && !error && (
        <div className="flex justify-center py-6">
          <Loader2 className="animate-spin w-5 h-5 text-[var(--color-muted-foreground)]" />
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)] py-4">
          <Activity className="w-4 h-4" />
          {soloErrores ? 'Sin errores registrados. 👌' : 'Todavía no hay actividad registrada.'}
        </div>
      )}

      {rows && rows.length > 0 && (
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const v = describirEvento(r)
            const esError = r.nivel === 'error'
            return (
              <li
                key={r.id}
                className="flex items-start gap-3 rounded-lg border px-3 py-2 text-sm"
                style={{
                  borderColor: esError ? 'var(--color-error, #ef4444)' : 'var(--color-border)',
                  background: esError ? 'rgba(239,68,68,0.06)' : 'transparent',
                }}
              >
                <span className="mt-0.5 shrink-0">
                  {esError ? (
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  ) : (
                    <Activity className="w-4 h-4 text-[var(--color-primary)]" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{v.titulo}</span>
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-border text-[var(--color-muted-foreground)]">
                      {ORIGEN_LABEL[r.origen] ?? r.origen}
                    </span>
                  </div>
                  {v.resumen && <p className="text-[var(--color-muted-foreground)] truncate">{v.resumen}</p>}
                </div>
                <span className="shrink-0 tabular-nums text-[11px] text-[var(--color-muted-foreground)]">
                  {cuando(r.created_at)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

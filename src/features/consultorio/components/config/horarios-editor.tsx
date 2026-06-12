'use client'

import { useState } from 'react'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { guardarHorarios } from '@/actions/consultorio-config'

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

interface Bloque {
  weekday: number
  open_time: string
  close_time: string
}

export function HorariosEditor({ inicial, onSaved }: { inicial: Bloque[]; onSaved: () => void }) {
  const [bloques, setBloques] = useState<Bloque[]>(
    inicial.map((b) => ({ ...b, open_time: b.open_time.slice(0, 5), close_time: b.close_time.slice(0, 5) })),
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function set(i: number, patch: Partial<Bloque>) {
    setBloques((bs) => bs.map((b, j) => (j === i ? { ...b, ...patch } : b)))
  }

  async function guardar() {
    setSaving(true)
    setError(null)
    const r = await guardarHorarios(bloques)
    if ('error' in r && r.error) setError(r.error)
    else onSaved()
    setSaving(false)
  }

  const input = 'rounded-lg border border-border bg-[var(--color-background)] px-2 py-1 text-sm'

  return (
    <div className="space-y-2">
      {error && (
        <div className="p-2 rounded-lg text-xs bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-500/20">
          {error}
        </div>
      )}
      {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
        <div key={wd} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="w-24 font-medium">{DIAS[wd]}</span>
          {bloques.map((b, i) =>
            b.weekday === wd ? (
              <span key={i} className="flex items-center gap-1">
                <input
                  type="time"
                  className={input}
                  value={b.open_time}
                  onChange={(e) => set(i, { open_time: e.target.value })}
                />
                –
                <input
                  type="time"
                  className={input}
                  value={b.close_time}
                  onChange={(e) => set(i, { close_time: e.target.value })}
                />
                <button onClick={() => setBloques((bs) => bs.filter((_, j) => j !== i))}>
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </button>
              </span>
            ) : null,
          )}
          <button
            onClick={() =>
              setBloques((bs) => [...bs, { weekday: wd, open_time: '09:00', close_time: '13:00' }])
            }
            className="text-xs flex items-center gap-0.5 text-[var(--color-muted-foreground)] underline"
          >
            <Plus className="w-3 h-3" /> bloque
          </button>
        </div>
      ))}
      <p className="text-[11px] text-[var(--color-muted-foreground)]">
        Los turnos ya dados fuera del nuevo horario se respetan — solo cambia la oferta futura.
      </p>
      <button
        onClick={guardar}
        disabled={saving}
        className="rounded-xl bg-primary text-white px-4 py-2 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        Guardar horarios
      </button>
    </div>
  )
}

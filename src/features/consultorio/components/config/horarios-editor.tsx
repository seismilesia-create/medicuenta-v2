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

/** Editor con el patrón de horarios de Google Business: día + interruptor abierto/cerrado
 *  + franjas apilables. Los cambios se persisten recién con "Guardar horarios". */
export function HorariosEditor({ inicial, onSaved }: { inicial: Bloque[]; onSaved: () => void }) {
  const [bloques, setBloques] = useState<Bloque[]>(
    inicial.map((b) => ({ ...b, open_time: b.open_time.slice(0, 5), close_time: b.close_time.slice(0, 5) })),
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function set(i: number, patch: Partial<Bloque>) {
    setBloques((bs) => bs.map((b, j) => (j === i ? { ...b, ...patch } : b)))
  }

  function toggleDia(wd: number, abierto: boolean) {
    setBloques((bs) =>
      abierto ? bs.filter((b) => b.weekday !== wd) : [...bs, { weekday: wd, open_time: '09:00', close_time: '13:00' }],
    )
  }

  function agregarFranja(wd: number) {
    setBloques((bs) => [...bs, { weekday: wd, open_time: '17:00', close_time: '20:00' }])
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
    <div className="space-y-1">
      {error && (
        <div className="p-2 mb-2 rounded-lg text-xs bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-500/20">
          {error}
        </div>
      )}
      {[1, 2, 3, 4, 5, 6, 0].map((wd) => {
        const delDia = bloques.map((b, i) => ({ b, i })).filter((x) => x.b.weekday === wd)
        const abierto = delDia.length > 0
        return (
          <div key={wd} className="flex items-start gap-3 py-2.5 border-b border-border/40 last:border-b-0">
            <span className="w-24 pt-1.5 text-sm font-medium">{DIAS[wd]}</span>
            <button
              role="switch"
              aria-checked={abierto}
              aria-label={`${DIAS[wd]}: ${abierto ? 'abierto' : 'cerrado'}`}
              onClick={() => toggleDia(wd, abierto)}
              className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors ${
                abierto ? 'bg-primary' : 'bg-[var(--color-muted)] border border-border'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  abierto ? 'translate-x-5' : ''
                }`}
              />
            </button>
            <div className="flex-1 space-y-1.5">
              {abierto ? (
                <>
                  {delDia.map(({ b, i }) => (
                    <div key={i} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="time"
                        className={input}
                        value={b.open_time}
                        onChange={(e) => set(i, { open_time: e.target.value })}
                      />
                      <span className="text-[var(--color-muted-foreground)]">–</span>
                      <input
                        type="time"
                        className={input}
                        value={b.close_time}
                        onChange={(e) => set(i, { close_time: e.target.value })}
                      />
                      <button
                        onClick={() => setBloques((bs) => bs.filter((_, j) => j !== i))}
                        aria-label="Quitar franja"
                        className="p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => agregarFranja(wd)}
                    className="text-xs flex items-center gap-0.5 text-primary hover:underline underline-offset-2"
                  >
                    <Plus className="w-3 h-3" /> Agregar horario
                  </button>
                </>
              ) : (
                <span className="inline-block pt-1.5 text-sm text-[var(--color-muted-foreground)]">Cerrado</span>
              )}
            </div>
          </div>
        )
      })}
      <p className="text-[11px] text-[var(--color-muted-foreground)] pt-2">
        Los turnos ya dados fuera del nuevo horario se respetan — solo cambia la oferta futura.
      </p>
      <button
        onClick={guardar}
        disabled={saving}
        className="rounded-xl bg-primary text-white px-4 py-2 text-sm font-medium disabled:opacity-50 flex items-center gap-2 mt-1"
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        Guardar horarios
      </button>
    </div>
  )
}

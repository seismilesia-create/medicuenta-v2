'use client'

import { useState } from 'react'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { guardarHorarios } from '@/actions/consultorio-config'
import { componerHora, from12, pad2, parseHora, to12, type Periodo } from '@/lib/consultorio/horaFormato'

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

interface Bloque {
  weekday: number
  open_time: string
  close_time: string
}

type FormatoHora = '24h' | '12h'

const HORAS_24 = Array.from({ length: 24 }, (_, i) => i) // 0–23
const HORAS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] // orden de reloj (12 = medianoche/mediodía)
const MINUTOS_BASE = Array.from({ length: 12 }, (_, i) => i * 5) // 00,05,…,55

const selectCls =
  'rounded-lg border border-border bg-[var(--color-background)] px-1.5 py-1 text-sm tabular-nums'

/**
 * Picker de hora propio (selects) en vez de <input type="time">: el input nativo muestra el
 * formato según el locale del navegador (Chrome ignora `lang`), así que el toggle 24h/12h no
 * hacía nada. Con selects, el toggle controla de verdad qué se ve. El valor SIEMPRE se compone
 * y se guarda en 'HH:MM' 24h canónico — el 12h es pura presentación.
 */
function TimeSelect({
  value,
  formato,
  onChange,
  etiqueta,
}: {
  value: string
  formato: FormatoHora
  onChange: (v: string) => void
  etiqueta: string
}) {
  const { h, m } = parseHora(value)
  // Si el minuto guardado no cae en la grilla de 5 (dato viejo), lo agregamos para no perderlo.
  const minutos = MINUTOS_BASE.includes(m) ? MINUTOS_BASE : [...MINUTOS_BASE, m].sort((a, b) => a - b)
  const { h12, periodo } = to12(h)

  if (formato === '24h') {
    return (
      <span className="inline-flex items-center gap-0.5">
        <select aria-label={`${etiqueta}: hora`} className={selectCls} value={h}
          onChange={(e) => onChange(componerHora(Number(e.target.value), m))}>
          {HORAS_24.map((hh) => <option key={hh} value={hh}>{pad2(hh)}</option>)}
        </select>
        <span className="text-[var(--color-muted-foreground)]">:</span>
        <select aria-label={`${etiqueta}: minutos`} className={selectCls} value={m}
          onChange={(e) => onChange(componerHora(h, Number(e.target.value)))}>
          {minutos.map((mm) => <option key={mm} value={mm}>{pad2(mm)}</option>)}
        </select>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-0.5">
      <select aria-label={`${etiqueta}: hora`} className={selectCls} value={h12}
        onChange={(e) => onChange(componerHora(from12(Number(e.target.value), periodo), m))}>
        {HORAS_12.map((hh) => <option key={hh} value={hh}>{hh}</option>)}
      </select>
      <span className="text-[var(--color-muted-foreground)]">:</span>
      <select aria-label={`${etiqueta}: minutos`} className={selectCls} value={m}
        onChange={(e) => onChange(componerHora(h, Number(e.target.value)))}>
        {minutos.map((mm) => <option key={mm} value={mm}>{pad2(mm)}</option>)}
      </select>
      <select aria-label={`${etiqueta}: AM o PM`} className={selectCls} value={periodo}
        onChange={(e) => onChange(componerHora(from12(h12, e.target.value as Periodo), m))}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </span>
  )
}

/** Editor con el patrón de horarios de Google Business: día + interruptor abierto/cerrado
 *  + franjas apilables. Los cambios se persisten recién con "Guardar horarios". */
export function HorariosEditor({ inicial, onSaved }: { inicial: Bloque[]; onSaved: () => void }) {
  const [bloques, setBloques] = useState<Bloque[]>(
    inicial.map((b) => ({ ...b, open_time: b.open_time.slice(0, 5), close_time: b.close_time.slice(0, 5) })),
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Toggle de presentación (ver/cargar): controla si el picker muestra 24h o 12h AM/PM.
  // Nunca cambia lo que se guarda — TimeSelect siempre compone 'HH:MM' 24h canónico.
  const [formato, setFormato] = useState<FormatoHora>('24h')

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

  return (
    <div className="space-y-1">
      {error && (
        <div className="p-2 mb-2 rounded-lg text-xs bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-500/20">
          {error}
        </div>
      )}
      <div className="flex items-center justify-end gap-1.5 pb-1">
        <span className="text-[11px] text-[var(--color-muted-foreground)]">Formato</span>
        <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs">
          <button
            type="button"
            aria-pressed={formato === '24h'}
            onClick={() => setFormato('24h')}
            className={`px-2 py-1 ${formato === '24h' ? 'bg-primary text-white' : 'text-[var(--color-muted-foreground)]'}`}
          >
            24 h
          </button>
          <button
            type="button"
            aria-pressed={formato === '12h'}
            onClick={() => setFormato('12h')}
            className={`px-2 py-1 border-l border-border ${formato === '12h' ? 'bg-primary text-white' : 'text-[var(--color-muted-foreground)]'}`}
          >
            12 h
          </button>
        </div>
      </div>
      {[1, 2, 3, 4, 5, 6, 0].map((wd) => {
        const delDia = bloques.map((b, i) => ({ b, i })).filter((x) => x.b.weekday === wd)
        const abierto = delDia.length > 0
        return (
          <div key={wd} className="flex items-start gap-3 py-2.5 border-b border-border/40 last:border-b-0">
            <span className="w-20 sm:w-24 pt-1.5 text-sm font-medium">{DIAS[wd]}</span>
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
                    <div key={i} className="flex flex-wrap items-center gap-1.5 text-sm">
                      <TimeSelect
                        value={b.open_time}
                        formato={formato}
                        onChange={(v) => set(i, { open_time: v })}
                        etiqueta={`${DIAS[wd]} apertura`}
                      />
                      <span className="text-[var(--color-muted-foreground)]">–</span>
                      <TimeSelect
                        value={b.close_time}
                        formato={formato}
                        onChange={(v) => set(i, { close_time: v })}
                        etiqueta={`${DIAS[wd]} cierre`}
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

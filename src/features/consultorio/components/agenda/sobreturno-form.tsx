'use client'

import { useState, type FormEvent } from 'react'
import { Loader2, X } from 'lucide-react'
import { crearSobreturno } from '@/actions/consultorio-agenda'

interface Props {
  fecha: string
  onClose: () => void
  onDone: () => void
}

export function SobreturnoForm({ fecha, onClose, onDone }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [f, setF] = useState({ nombre: '', apellido: '', dni: '', obraSocial: '', telefono: '', notas: '' })
  const [cobro, setCobro] = useState<'particular' | 'sin_cargo'>('particular')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const r = await crearSobreturno({ fecha, cobro, ...f })
    if ('error' in r && r.error) {
      setError(r.error)
      setLoading(false)
      return
    }
    onDone()
  }

  const input = 'w-full rounded-lg border border-border bg-[var(--color-background)] px-3 py-2 text-sm'

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-amber-500/40 bg-[var(--color-background)] p-5 space-y-3 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-amber-600">Sobreturno — {fecha} (sin hora)</h2>
          <button type="button" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>
        {error && (
          <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-500/20">
            {error}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <input className={input} placeholder="Nombre *" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
          <input className={input} placeholder="Apellido *" value={f.apellido} onChange={(e) => setF({ ...f, apellido: e.target.value })} />
        </div>
        <input className={input} placeholder="DNI (opcional)" value={f.dni} onChange={(e) => setF({ ...f, dni: e.target.value })} />
        <input className={input} placeholder="Obra social (opcional)" value={f.obraSocial} onChange={(e) => setF({ ...f, obraSocial: e.target.value })} />
        <input className={input} placeholder="Teléfono (opcional)" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
        <input className={input} placeholder="Nota (ej. urgencia, amigo)" value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} />
        <div className="flex gap-2">
          {(
            [
              ['particular', 'Particular (efectivo)'],
              ['sin_cargo', 'Sin cargo'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setCobro(v)}
              className={`flex-1 rounded-xl border py-2 text-sm ${cobro === v ? 'border-amber-500 bg-amber-500/15 text-amber-600 font-semibold' : 'border-border'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          disabled={loading}
          className="w-full rounded-xl bg-amber-500 text-white py-2.5 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Anotar sobreturno
        </button>
      </form>
    </div>
  )
}

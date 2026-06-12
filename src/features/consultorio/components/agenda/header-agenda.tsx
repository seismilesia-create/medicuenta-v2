'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

export type Vista = 'dia' | 'semana' | 'mes'

const VISTAS: { id: Vista; label: string }[] = [
  { id: 'dia', label: 'Día' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mes' },
]

interface Props {
  vista: Vista
  titulo: string
  onVista: (v: Vista) => void
  onPrev: () => void
  onHoy: () => void
  onNext: () => void
}

export function HeaderAgenda({ vista, titulo, onVista, onPrev, onHoy, onNext }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <h1 className="text-xl font-semibold">Agenda</h1>
      <div className="flex items-center gap-1">
        <button
          onClick={onPrev}
          aria-label="Anterior"
          className="p-1.5 rounded-lg border border-border hover:bg-primary/5"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button onClick={onHoy} className="px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-primary/5">
          Hoy
        </button>
        <button
          onClick={onNext}
          aria-label="Siguiente"
          className="p-1.5 rounded-lg border border-border hover:bg-primary/5"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <span className="text-sm font-medium flex-1 min-w-max">{titulo}</span>
      <div className="flex rounded-xl border border-border p-0.5 text-sm">
        {VISTAS.map((v) => (
          <button
            key={v.id}
            onClick={() => onVista(v.id)}
            className={`px-3 py-1 rounded-lg transition ${
              vista === v.id ? 'bg-primary text-white shadow' : 'hover:bg-primary/5'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  )
}

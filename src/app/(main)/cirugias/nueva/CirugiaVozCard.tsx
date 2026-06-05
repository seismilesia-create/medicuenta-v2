'use client'

import { Mic, Bot } from 'lucide-react'
import { useSidePanelStore } from '@/features/assistant/store/sidePanelStore'

/**
 * Las cirugías (fojas quirúrgicas) se cargan SOLO por voz, dictándoselas al
 * asistente. Esta tarjeta explica el flujo y abre el panel del asistente.
 */
export function CirugiaVozCard() {
  const open = useSidePanelStore((s) => s.open)

  return (
    <div
      className="rounded-2xl p-8 text-center"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <div
        className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
        style={{ background: 'var(--color-primary)', color: '#fff' }}
      >
        <Mic className="h-7 w-7" strokeWidth={2} />
      </div>

      <h2 className="text-lg font-semibold" style={{ color: 'var(--color-foreground)' }}>
        Las cirugías se cargan por voz
      </h2>
      <p className="mt-2 text-sm max-w-md mx-auto" style={{ color: 'var(--color-muted-foreground)' }}>
        Decile al asistente lo que querés registrar (ej: <em>&quot;cargá una cirugía de Juan Pérez,
        OSEP, colecistectomía, fui cirujano&quot;</em>) y te va guiando con preguntas hasta completarla.
      </p>

      <button
        type="button"
        onClick={open}
        className="mt-6 inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90"
        style={{ background: 'var(--color-primary)' }}
      >
        <Bot className="h-4 w-4" />
        Abrir asistente y dictar
      </button>
    </div>
  )
}

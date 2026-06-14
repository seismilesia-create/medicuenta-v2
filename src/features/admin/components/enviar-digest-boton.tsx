'use client'

import { useState, useTransition } from 'react'
import { Send } from 'lucide-react'
import { enviarDigestAhora } from '@/actions/orquestador'

/**
 * Botón "Enviar resumen ahora" del panel del dueño (spec §6, v1b). Fuerza el
 * envío del digest por email sin esperar al cron diario — para probar el canal.
 */
export function EnviarDigestBoton() {
  const [pending, start] = useTransition()
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null)

  function enviar() {
    setResultado(null)
    start(async () => {
      setResultado(await enviarDigestAhora())
    })
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={enviar}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-muted)] disabled:opacity-50"
      >
        <Send className="w-3.5 h-3.5" />
        {pending ? 'Enviando…' : 'Enviar resumen ahora'}
      </button>
      {resultado && (
        <span className={`text-xs ${resultado.ok ? 'text-emerald-600' : 'text-[var(--color-muted-foreground)]'}`}>
          {resultado.mensaje}
        </span>
      )}
    </div>
  )
}

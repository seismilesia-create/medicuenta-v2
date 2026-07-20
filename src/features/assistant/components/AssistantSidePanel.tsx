'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Bot, X, ChevronLeft, Sparkles } from 'lucide-react'
import { useAssistantChat } from '../hooks/useAssistantChat'
import { useSidePanelStore } from '../store/sidePanelStore'
import { AssistantMessages } from './AssistantMessages'
import { AssistantInput } from './AssistantInput'
import { SUGGESTED_QUESTIONS } from '../types/assistant'

/**
 * Panel lateral colapsable del asistente, fijado a la derecha de la pantalla.
 *
 * - Desktop: panel de 380px de ancho, colapsable a un botón pequeño en el borde derecho
 * - Mobile: overlay full screen al abrir; oculto por default
 *
 * El estado vive en `useSidePanelStore` (persistido en localStorage).
 * El `<main>` ajusta su margen derecho leyendo el mismo store via `MainShell`.
 */
export function AssistantSidePanel() {
  const isOpen = useSidePanelStore((s) => s.isOpen)
  const open = useSidePanelStore((s) => s.open)
  const close = useSidePanelStore((s) => s.close)
  const [mounted, setMounted] = useState(false)
  const pathname = usePathname()

  // En /asistente la pantalla completa YA es el asistente; el panel flotante
  // sería un segundo asistente redundante, así que no lo mostramos ahí.
  const ocultarEnRuta = pathname === '/asistente'

  // Para evitar hydration mismatch con localStorage
  useEffect(() => setMounted(true), [])

  const { messages, status, error, sendMessage } = useAssistantChat()

  const isLoading = status === 'submitted' || status === 'streaming'

  function handleSend(payload: { text: string; files?: FileList }) {
    sendMessage({ text: payload.text, files: payload.files })
  }

  // Si no montó aún, no renderizar nada — evita layout shift
  if (!mounted || ocultarEnRuta) return null

  return (
    <>
      {/* Botón "abrir" cuando está cerrado — tab lateral pegado al borde derecho.
          En celular va arriba (top-16), a la altura del título de la página, para
          no pisar el composer de Conversaciones ni el BottomNav. En escritorio
          queda centrado vertical como estaba. */}
      {!isOpen && (
        <button
          type="button"
          onClick={open}
          className="flex fixed top-16 right-0 md:top-1/2 md:-translate-y-1/2 z-40 items-center gap-1 pl-2 pr-1.5 py-3 rounded-l-xl bg-primary text-primary-foreground shadow-lg hover:pr-2.5 transition-all group"
          aria-label="Abrir asistente"
        >
          <ChevronLeft className="w-4 h-4" />
          <Bot className="w-5 h-5" />
        </button>
      )}

      {/* Overlay backdrop (mobile, cuando está abierto) */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          onClick={close}
        />
      )}

      {/* Panel */}
      <aside
        className={`
          fixed top-0 right-0 h-screen z-50 flex flex-col
          bg-card border-l border-border shadow-2xl
          transition-transform duration-300 ease-out
          w-full md:w-[380px]
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-primary/10 to-transparent">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/80 shadow-md">
              <Bot className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Asistente</h3>
              <p className="text-[10px] text-muted-foreground">Pediles lo que necesites</p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Cerrar asistente"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Empty state / Messages */}
        {messages.length === 0 ? (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="text-center mb-6 mt-4">
              <p className="text-sm font-medium text-foreground">¿Qué necesitás?</p>
              <p className="text-xs mt-1 text-muted-foreground">
                Decime con voz o texto a dónde querés ir o qué registrar.
              </p>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Sugerencias
              </p>
            </div>
            <div className="space-y-2">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q.label}
                  onClick={() => handleSend({ text: q.text })}
                  className="w-full text-left px-3 py-2.5 rounded-lg text-sm border border-border text-foreground transition-colors hover:bg-accent/50 hover:border-primary/40"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <AssistantMessages messages={messages} isLoading={isLoading} />
        )}

        {/* Error */}
        {error && (
          <div className="px-4 py-2 text-xs bg-red-500/10 text-red-500 border-t border-red-500/30">
            Error: {error.message}
          </div>
        )}

        {/* Input */}
        <AssistantInput onSend={handleSend} isLoading={isLoading} />
      </aside>
    </>
  )
}

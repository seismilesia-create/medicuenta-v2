'use client'

import { useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { AssistantMessages } from './AssistantMessages'
import { AssistantInput } from './AssistantInput'
import { SUGGESTED_QUESTIONS } from '../types/assistant'

export function AssistantWidget() {
  const [open, setOpen] = useState(false)
  const { messages, status, error, sendMessage } = useChat()

  const isLoading = status === 'submitted' || status === 'streaming'

  function handleSend(payload: { text: string; files?: FileList }) {
    sendMessage({ text: payload.text, files: payload.files })
  }

  return (
    <>
      {/* FAB button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-transform active:scale-95"
        style={{ backgroundColor: 'var(--color-primary)' }}
        aria-label={open ? 'Cerrar asistente' : 'Abrir asistente'}
      >
        {open ? (
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-36 right-4 md:bottom-20 md:right-6 z-50 w-[calc(100vw-2rem)] md:w-96 h-[70vh] md:h-[500px] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 flex-shrink-0"
            style={{
              backgroundColor: 'var(--color-primary)',
              color: '#fff',
            }}
          >
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
              </svg>
              <div>
                <h3 className="text-sm font-semibold">Asistente MediCuenta</h3>
                <p className="text-[10px] opacity-80">Facturacion medica</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded-lg hover:bg-white/20 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          {messages.length === 0 ? (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="text-center mb-6 mt-4">
                <svg
                  className="w-10 h-10 mx-auto mb-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  style={{ color: 'var(--color-primary)' }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                </svg>
                <p className="text-sm font-medium" style={{ color: 'var(--color-foreground)' }}>
                  Hola! Soy tu asistente de facturacion
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
                  Preguntame sobre nomenclador, ordenes, liquidaciones o debitos
                </p>
              </div>

              <div className="space-y-2">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q.label}
                    onClick={() => handleSend({ text: q.text })}
                    className="w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                    style={{
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-foreground)',
                    }}
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
            <div
              className="px-4 py-2 text-xs"
              style={{ backgroundColor: 'var(--color-error-bg, rgba(239,68,68,0.1))', color: 'var(--color-error)' }}
            >
              Error: {error.message}
            </div>
          )}

          {/* Input */}
          <AssistantInput onSend={handleSend} isLoading={isLoading} />
        </div>
      )}
    </>
  )
}

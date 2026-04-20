'use client'

import { useChat } from '@ai-sdk/react'
import { AssistantMessages } from './AssistantMessages'
import { AssistantInput } from './AssistantInput'
import { SUGGESTED_QUESTIONS } from '../types/assistant'

interface Props {
  variant?: 'widget' | 'fullscreen'
}

export function AssistantPanel({ variant = 'fullscreen' }: Props) {
  const { messages, status, error, sendMessage } = useChat()
  const isLoading = status === 'submitted' || status === 'streaming'

  function handleSend(payload: { text: string; files?: FileList }) {
    sendMessage({ text: payload.text, files: payload.files })
  }

  const isFullscreen = variant === 'fullscreen'

  return (
    <div
      className={`flex flex-col overflow-hidden ${isFullscreen ? 'h-full' : 'h-[500px]'}`}
      style={{ backgroundColor: 'var(--color-surface)' }}
    >
      {messages.length === 0 ? (
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-2xl mx-auto text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4" style={{ backgroundColor: 'var(--color-primary-light, rgba(99,102,241,0.1))' }}>
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--color-primary)' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
              </svg>
            </div>
            <h2 className="text-xl md:text-2xl font-semibold mb-2" style={{ color: 'var(--color-foreground)' }}>
              Hola, soy tu asistente
            </h2>
            <p className="text-sm md:text-base" style={{ color: 'var(--color-foreground-secondary, var(--color-muted))' }}>
              Registrá órdenes, consultá el nomenclador, escaneá una foto. Decime lo que necesitás.
            </p>
          </div>

          <div className="max-w-2xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-2">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q.label}
                onClick={() => handleSend({ text: q.text })}
                className="text-left px-4 py-3 rounded-xl text-sm transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                style={{
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-foreground)',
                  backgroundColor: 'var(--color-background)',
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

      {error && (
        <div
          className="px-4 py-2 text-xs"
          style={{
            backgroundColor: 'var(--color-error-light, rgba(239,68,68,0.1))',
            color: 'var(--color-error)',
            borderTop: '1px solid var(--color-error)',
          }}
        >
          Error: {error.message}
        </div>
      )}

      <AssistantInput onSend={handleSend} isLoading={isLoading} />
    </div>
  )
}

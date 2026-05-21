'use client'

import { useEffect, useRef, useState } from 'react'
import type { UIMessage } from 'ai'
import { AssistantMessages } from './AssistantMessages'
import { AssistantInput } from './AssistantInput'
import { SUGGESTED_QUESTIONS, CAPABILITIES_HELP } from '../types/assistant'
import { useAssistantChat } from '../hooks/useAssistantChat'

interface Props {
  variant?: 'widget' | 'fullscreen'
  initialConversationId?: string
  initialMessages?: UIMessage[]
  highlightMessageId?: string | null
  onConversationCreated?: (id: string) => void
}

export function AssistantPanel({
  variant = 'fullscreen',
  initialConversationId,
  initialMessages,
  highlightMessageId,
  onConversationCreated,
}: Props) {
  const { messages, status, error, sendMessage, conversationId } = useAssistantChat({
    initialConversationId,
    initialMessages,
  })
  const isLoading = status === 'submitted' || status === 'streaming'

  const onCreatedRef = useRef(onConversationCreated)
  onCreatedRef.current = onConversationCreated
  const notifiedRef = useRef<string | null>(initialConversationId ?? null)
  useEffect(() => {
    if (!conversationId) return
    if (notifiedRef.current === conversationId) return
    notifiedRef.current = conversationId
    if (!initialConversationId) onCreatedRef.current?.(conversationId)
  }, [conversationId, initialConversationId])

  function handleSend(payload: { text: string; files?: FileList }) {
    sendMessage({ text: payload.text, files: payload.files })
  }

  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)

  function handleSuggestionClick(text: string, send: boolean) {
    if (send) {
      handleSend({ text })
    } else {
      setPrefill({ text, nonce: Date.now() })
    }
  }

  const isFullscreen = variant === 'fullscreen'

  return (
    <div
      className={`flex flex-col overflow-hidden ${isFullscreen ? 'h-full' : 'h-[500px]'}`}
      style={{ backgroundColor: 'var(--color-surface, var(--color-card))' }}
    >
      {messages.length === 0 ? (
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-2xl mx-auto text-center mb-8">
            <div
              className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
              style={{ backgroundColor: 'var(--color-primary-light, rgba(99,102,241,0.1))' }}
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--color-primary)' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
              </svg>
            </div>
            <h2 className="text-xl md:text-2xl font-semibold mb-2" style={{ color: 'var(--color-foreground)' }}>
              Hola, soy tu asistente
            </h2>
            <p className="text-sm md:text-base" style={{ color: 'var(--color-muted-foreground, var(--color-muted))' }}>
              Registrá órdenes, consultá el nomenclador, escaneá una foto. Decime lo que necesitás.
            </p>
          </div>

          <div className="max-w-2xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-2">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q.label}
                onClick={() => handleSuggestionClick(q.text, q.send ?? false)}
                className="text-left px-4 py-3 rounded-xl text-sm transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                style={{
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-foreground)',
                  backgroundColor: 'var(--color-background, var(--color-card))',
                }}
              >
                {q.label}
              </button>
            ))}
          </div>

          <div className="max-w-2xl mx-auto mt-6">
            <button
              type="button"
              onClick={() => setHelpOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
              style={{ border: '1px solid var(--color-border)', color: 'var(--color-foreground)' }}
            >
              <span>💡 {CAPABILITIES_HELP.title}</span>
              <span style={{ color: 'var(--color-muted-foreground, var(--color-muted))' }}>{helpOpen ? '▲' : '▼'}</span>
            </button>

            {helpOpen && (
              <div
                className="mt-2 p-4 rounded-xl space-y-3 text-sm"
                style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-background, var(--color-card))' }}
              >
                {CAPABILITIES_HELP.sections.map((s) => (
                  <div key={s.heading} className="flex gap-2">
                    <span className="text-lg shrink-0 leading-tight">{s.icon}</span>
                    <div>
                      <p className="font-semibold" style={{ color: 'var(--color-foreground)' }}>{s.heading}</p>
                      <p style={{ color: 'var(--color-muted-foreground, var(--color-muted))' }}>{s.body}</p>
                    </div>
                  </div>
                ))}
                <div className="pt-2 mt-2 text-xs space-y-1" style={{ borderTop: '1px solid var(--color-border)', color: 'var(--color-muted-foreground, var(--color-muted))' }}>
                  {CAPABILITIES_HELP.tips.map((t, i) => (
                    <p key={i}>• {t}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <AssistantMessages messages={messages} isLoading={isLoading} highlightMessageId={highlightMessageId} />
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

      <AssistantInput onSend={handleSend} isLoading={isLoading} prefill={prefill} />
    </div>
  )
}

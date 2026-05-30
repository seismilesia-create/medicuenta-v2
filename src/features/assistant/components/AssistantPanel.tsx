'use client'

import { useEffect, useRef, useState } from 'react'
import type { UIMessage } from 'ai'
import { Bot, Sparkles, FileText, Receipt, Calculator, Plus, ChevronDown, ChevronUp, Lightbulb, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
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

// Icons para suggestions (mismo orden que SUGGESTED_QUESTIONS)
const SUGGESTION_ICONS: LucideIcon[] = [FileText, Receipt, Calculator, Plus]

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
    <div className={cn('flex flex-col overflow-hidden bg-card', isFullscreen ? 'h-full' : 'h-[500px]')}>
      {messages.length === 0 ? (
        <div className="flex-1 overflow-y-auto">
          {/* Hero header con gradient + glow */}
          <div className="relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent" />
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
            <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative px-6 md:px-8 pt-10 md:pt-14 pb-8">
              <div className="max-w-2xl mx-auto text-center">
                <div className="relative inline-block mb-6">
                  <div className="absolute inset-0 bg-primary/30 rounded-2xl blur-xl pulse-glow" />
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-2xl shadow-primary/30">
                    <Bot className="h-10 w-10 text-primary-foreground" strokeWidth={1.5} />
                  </div>
                </div>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-3">
                  Hola, soy tu asistente
                </h2>
                <p className="text-sm md:text-base text-muted-foreground max-w-md mx-auto">
                  Registrá órdenes, consultá el nomenclador, escaneá una foto. Decime lo que necesitás.
                </p>
              </div>
            </div>
          </div>

          {/* Suggestions */}
          <div className="px-6 md:px-8 pb-6">
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                </div>
                <p className="text-sm font-medium text-foreground">Sugerencias para empezar</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {SUGGESTED_QUESTIONS.map((q, i) => {
                  const Icon = SUGGESTION_ICONS[i] ?? Sparkles
                  return (
                    <button
                      key={q.label}
                      onClick={() => handleSuggestionClick(q.text, q.send ?? false)}
                      className="group relative overflow-hidden flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50 group-hover:bg-primary/10 transition-colors shrink-0">
                        <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" strokeWidth={1.5} />
                      </div>
                      <span className="relative text-sm font-medium text-foreground">{q.label}</span>
                    </button>
                  )
                })}
              </div>

              {/* Help collapsible */}
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => setHelpOpen((v) => !v)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border bg-card text-sm font-medium text-foreground transition-colors hover:bg-accent/50"
                >
                  <span className="flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-500" strokeWidth={1.5} />
                    {CAPABILITIES_HELP.title}
                  </span>
                  {helpOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>

                {helpOpen && (
                  <div className="mt-2 p-5 rounded-xl border border-border bg-card space-y-4 text-sm">
                    {CAPABILITIES_HELP.sections.map((s) => (
                      <div key={s.heading} className="flex gap-3">
                        <span className="text-lg shrink-0 leading-tight">{s.icon}</span>
                        <div>
                          <p className="font-semibold text-foreground">{s.heading}</p>
                          <p className="text-muted-foreground mt-0.5">{s.body}</p>
                        </div>
                      </div>
                    ))}
                    <div className="pt-3 mt-3 text-xs space-y-1 border-t border-border/50 text-muted-foreground">
                      {CAPABILITIES_HELP.tips.map((t, i) => (
                        <p key={i}>• {t}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <AssistantMessages messages={messages} isLoading={isLoading} highlightMessageId={highlightMessageId} />
      )}

      {error && (
        <div className="px-4 py-2 text-xs bg-red-500/10 text-red-500 border-t border-red-500/30">
          Error: {error.message}
        </div>
      )}

      <AssistantInput onSend={handleSend} isLoading={isLoading} prefill={prefill} />
    </div>
  )
}

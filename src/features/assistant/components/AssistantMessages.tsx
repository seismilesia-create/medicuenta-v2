'use client'

import { useEffect, useRef } from 'react'
import type { UIMessage } from 'ai'

interface Props {
  messages: UIMessage[]
  isLoading: boolean
}

function getMessageText(message: UIMessage): string {
  if (!message.parts) return ''
  return message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('')
}

export function AssistantMessages({ messages, isLoading }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {messages.map((m) => (
        <div
          key={m.id}
          className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
              m.role === 'user' ? 'rounded-br-md' : 'rounded-bl-md'
            }`}
            style={{
              backgroundColor: m.role === 'user' ? 'var(--color-primary)' : 'var(--color-background)',
              color: m.role === 'user' ? '#fff' : 'var(--color-foreground)',
              border: m.role === 'assistant' ? '1px solid var(--color-border)' : undefined,
            }}
          >
            <p className="whitespace-pre-wrap">{getMessageText(m)}</p>
          </div>
        </div>
      ))}

      {isLoading && messages[messages.length - 1]?.role === 'user' && (
        <div className="flex justify-start">
          <div
            className="px-3.5 py-2.5 rounded-2xl rounded-bl-md"
            style={{
              backgroundColor: 'var(--color-background)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div className="flex gap-1">
              <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--color-muted)', animationDelay: '0ms' }} />
              <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--color-muted)', animationDelay: '150ms' }} />
              <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--color-muted)', animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}

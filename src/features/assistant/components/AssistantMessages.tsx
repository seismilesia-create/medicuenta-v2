'use client'

import { useEffect, useRef } from 'react'
import type { UIMessage } from 'ai'
import { ToolCallCard } from './ToolCallCard'

interface Props {
  messages: UIMessage[]
  isLoading: boolean
}

export function AssistantMessages({ messages, isLoading }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}

      {isLoading && messages[messages.length - 1]?.role === 'user' && (
        <div className="flex justify-start">
          <div
            className="px-3.5 py-2.5 rounded-2xl rounded-bl-md flex items-center gap-2"
            style={{
              backgroundColor: 'var(--color-background)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div className="flex gap-1">
              <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--color-muted-foreground)', animationDelay: '0ms' }} />
              <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--color-muted-foreground)', animationDelay: '150ms' }} />
              <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--color-muted-foreground)', animationDelay: '300ms' }} />
            </div>
            <span className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
              Pensando...
            </span>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} flex-col gap-2 items-${isUser ? 'end' : 'start'}`}>
      {message.parts?.map((part, idx) => {
        if (part.type === 'text') {
          return (
            <div
              key={idx}
              className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                isUser ? 'rounded-br-md' : 'rounded-bl-md'
              }`}
              style={{
                backgroundColor: isUser ? 'var(--color-primary)' : 'var(--color-background)',
                color: isUser ? '#fff' : 'var(--color-foreground)',
                border: isUser ? undefined : '1px solid var(--color-border)',
                alignSelf: isUser ? 'flex-end' : 'flex-start',
              }}
            >
              <p className="whitespace-pre-wrap">{part.text}</p>
            </div>
          )
        }

        if (part.type === 'file' && part.mediaType?.startsWith('image/')) {
          return (
            <div key={idx} className="max-w-[50%]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={part.url}
                alt="adjunto"
                className="rounded-xl max-h-48 object-contain"
                style={{ border: '1px solid var(--color-border)' }}
              />
            </div>
          )
        }

        if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
          const toolName = part.type.slice(5)
          const toolPart = part as typeof part & {
            state?: 'input-streaming' | 'input-available' | 'output-available' | 'output-error'
            input?: unknown
            output?: unknown
            errorText?: string
          }
          return (
            <ToolCallCard
              key={idx}
              toolName={toolName}
              state={toolPart.state ?? 'input-streaming'}
              input={toolPart.input}
              output={toolPart.output}
              errorText={toolPart.errorText}
            />
          )
        }

        return null
      })}
    </div>
  )
}

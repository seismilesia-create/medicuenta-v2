'use client'

import { useState, type FormEvent } from 'react'

interface Props {
  onSend: (text: string) => void
  isLoading: boolean
}

export function AssistantInput({ onSend, isLoading }: Props) {
  const [input, setInput] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    onSend(input.trim())
    setInput('')
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="p-3 flex gap-2"
      style={{ borderTop: '1px solid var(--color-border)' }}
    >
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Pregunta sobre facturacion..."
        disabled={isLoading}
        className="flex-1 px-3 py-2 rounded-lg text-sm"
        style={{
          background: 'var(--color-background)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-foreground)',
        }}
      />
      <button
        type="submit"
        disabled={isLoading || !input.trim()}
        className="p-2 rounded-lg transition-opacity disabled:opacity-30"
        style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </button>
    </form>
  )
}

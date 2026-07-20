'use client'

import { Sparkles, Mic, MicOff, Send, FileText, Receipt, Calculator, Plus, Loader2, PenSquare } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAssistantChat } from '../hooks/useAssistantChat'
import { useVoiceInput } from '../hooks/useVoiceInput'
import { AssistantMessages } from './AssistantMessages'
import { SUGGESTED_QUESTIONS } from '../types/assistant'

interface Props {
  /** Nombre del médico para el saludo (ej: "Héctor"). null si no hay perfil cargado. */
  nombre: string | null
}

const SUGGESTION_ICONS = [FileText, Receipt, Calculator, Plus]

export function AssistantHome({ nombre }: Props) {
  const [text, setText] = useState('')

  // restore: false → el home arranca SIEMPRE limpio (mic-first) y no resucita la
  // conversación vieja al montar. Ver useAssistantChat.
  const { messages, status, error, sendMessage, setMessages, setConversationId } =
    useAssistantChat({ restore: false })

  const isLoading = status === 'submitted' || status === 'streaming'

  const voice = useVoiceInput({
    onFinalTranscript: (transcript) => {
      sendMessage({ text: transcript })
      setText('')
    },
  })

  // Volver al inicio (mic-first) sin tener que tipear: limpia el chat actual.
  function nuevaConversacion() {
    setMessages([])
    setConversationId(undefined)
    setText('')
    if (voice.isListening) voice.stop()
  }

  function handleSuggestion(q: string) {
    sendMessage({ text: q })
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || isLoading) return
    sendMessage({ text: trimmed })
    setText('')
  }

  function toggleVoice() {
    if (voice.isListening) voice.stop()
    else voice.start()
  }

  const saludo = nombre ? `Hola Dr. ${nombre}` : 'Hola Doctor'

  // Modo conversación: si hay mensajes (y todavía no se navegó), mostramos el chat.
  if (messages.length > 0) {
    return (
      <div className="h-full flex flex-col bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
          <span className="text-sm font-semibold text-foreground">{saludo}</span>
          <button
            type="button"
            onClick={nuevaConversacion}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-accent/50"
          >
            <PenSquare className="w-4 h-4" />
            Nueva conversación
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <AssistantMessages messages={messages} isLoading={isLoading} />
        </div>
        {error && (
          <div className="px-4 py-2 text-xs bg-red-500/10 text-red-500 border-t border-red-500/30">
            Error: {error.message}
          </div>
        )}
        {voice.isListening && (
          <p className="px-4 pt-2 text-xs text-foreground/80 animate-pulse text-center">
            {voice.interimTranscript || 'Te escucho...'}
          </p>
        )}
        <form onSubmit={handleSubmit} className="p-3 border-t border-border flex gap-2">
          <button
            type="button"
            onClick={toggleVoice}
            disabled={!voice.isSupported || isLoading}
            aria-label={voice.isListening ? 'Detener grabación' : 'Hablar'}
            className={`p-2 rounded-lg shrink-0 transition-colors disabled:opacity-30 ${
              voice.isListening
                ? 'bg-red-500 text-white animate-pulse'
                : 'bg-muted text-foreground hover:bg-accent'
            }`}
          >
            {voice.isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Seguí la conversación..."
            disabled={isLoading}
            className="flex-1 px-3 py-2 rounded-lg text-sm bg-background border border-border"
          />
          <button
            type="submit"
            disabled={isLoading || !text.trim()}
            className="p-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-30"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full overflow-y-auto bg-background">
      {/* Orbes decorativos */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-32 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 left-1/4 w-72 h-72 bg-primary/15 rounded-full blur-3xl" />
      </div>

      <div className="relative min-h-full flex flex-col items-center justify-center px-4 py-12 md:py-20">
        {/* Saludo */}
        <div className="text-center mb-10 md:mb-16">
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground mb-3">
            {saludo}
          </h1>
          <p className="text-base md:text-xl text-muted-foreground">
            ¿Qué vamos a hacer hoy?
          </p>
        </div>

        {/* Mic gigante — el actor principal */}
        <button
          type="button"
          onClick={toggleVoice}
          disabled={!voice.isSupported || isLoading}
          className="group relative mb-8 md:mb-12"
          aria-label={voice.isListening ? 'Detener grabación' : 'Hablar al asistente'}
        >
          <div
            className={`absolute inset-0 rounded-full blur-2xl transition-all duration-500 ${
              voice.isListening
                ? 'bg-red-500/50 scale-125 animate-pulse'
                : 'bg-primary/40 group-hover:bg-primary/60 group-hover:scale-110'
            }`}
          />
          {voice.isListening && (
            <>
              <span className="absolute inset-0 rounded-full border-4 border-red-500/30 animate-ping" />
              <span
                className="absolute -inset-3 rounded-full border-2 border-red-500/20 animate-ping"
                style={{ animationDelay: '300ms' }}
              />
            </>
          )}
          <div
            className={`relative flex h-28 w-28 md:h-36 md:w-36 items-center justify-center rounded-full shadow-2xl transition-all ${
              voice.isListening
                ? 'bg-gradient-to-br from-red-500 to-red-600 scale-105'
                : 'bg-gradient-to-br from-primary to-primary/80 group-hover:scale-105'
            }`}
          >
            {voice.isListening ? (
              <MicOff className="h-12 w-12 md:h-16 md:w-16 text-white" strokeWidth={2} />
            ) : (
              <Mic className="h-12 w-12 md:h-16 md:w-16 text-primary-foreground" strokeWidth={2} />
            )}
          </div>
        </button>

        {/* Estado de voz */}
        <div className="h-6 mb-4 text-center">
          {voice.isListening && (
            <p className="text-sm text-foreground/80 animate-pulse">
              {voice.interimTranscript || 'Te escucho...'}
            </p>
          )}
          {!voice.isListening && voice.error && (
            <p className="text-xs text-red-500 max-w-md">
              {voice.error === 'not-allowed' || voice.error === 'service-not-allowed'
                ? 'Permiso del micrófono bloqueado. Tocá el candado al lado de la URL → Configuración del sitio → Micrófono → Permitir, y refrescá.'
                : voice.error === 'no-speech'
                ? 'No te escuché. Intentá de nuevo.'
                : voice.error === 'audio-capture'
                ? 'No encuentro micrófono. Verificá que esté conectado.'
                : voice.error === 'network'
                ? 'Sin internet (la voz necesita conexión). Probá de nuevo.'
                : `Error: ${voice.error}`}
            </p>
          )}
          {!voice.isListening && !voice.error && !isLoading && (
            <p className="text-xs text-muted-foreground">
              {voice.isSupported ? 'Tocá el micrófono o escribí abajo' : 'Tu navegador no soporta voz — escribí abajo'}
            </p>
          )}
          {isLoading && (
            <p className="text-sm text-muted-foreground inline-flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Pensando...
            </p>
          )}
        </div>

        {/* Input de texto */}
        <form onSubmit={handleSubmit} className="w-full max-w-2xl mb-10">
          <div className="relative">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="O escribime: ¿qué necesitás?"
              disabled={isLoading}
              className="w-full pl-5 pr-14 py-4 text-base rounded-2xl bg-card border border-border shadow-lg shadow-primary/5 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
            <button
              type="submit"
              disabled={isLoading || !text.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 rounded-xl bg-primary text-primary-foreground disabled:opacity-30 transition-opacity hover:bg-primary/90"
              aria-label="Enviar"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </form>

        {/* Sugerencias */}
        <div className="w-full max-w-2xl">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Sparkles className="h-4 w-4 text-primary" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Sugerencias
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {SUGGESTED_QUESTIONS.map((q, i) => {
              const Icon = SUGGESTION_ICONS[i] ?? Sparkles
              return (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => handleSuggestion(q.text)}
                  disabled={isLoading}
                  className="group flex items-center gap-3 rounded-xl border border-border bg-card/50 backdrop-blur-sm px-4 py-3 text-left transition-all hover:border-primary/40 hover:bg-card hover:shadow-md hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors shrink-0">
                    <Icon className="h-4 w-4 text-primary" strokeWidth={2} />
                  </div>
                  <span className="text-sm font-medium text-foreground">{q.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {error && (
          <div className="mt-6 px-4 py-2 text-xs rounded-lg bg-red-500/10 text-red-500 border border-red-500/30">
            Error: {error.message}
          </div>
        )}
      </div>
    </div>
  )
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Tipos mínimos para Web Speech API (no están en lib.dom.d.ts en todos los TS).
type SpeechRecognitionResult = {
  0: { transcript: string }
  isFinal: boolean
  length: number
}
type SpeechRecognitionEvent = {
  results: { length: number; [index: number]: SpeechRecognitionResult }
  resultIndex: number
}
type SpeechRecognitionErrorEvent = { error: string }
type SpeechRecognitionInstance = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance

interface Options {
  /** Callback con el texto final cuando el usuario termina de hablar. */
  onFinalTranscript: (text: string) => void
  /** Idioma (default es-AR). */
  lang?: string
}

interface VoiceState {
  isSupported: boolean
  isListening: boolean
  interimTranscript: string
  error: string | null
  start: () => void
  stop: () => void
  abort: () => void
}

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  return (
    (window as unknown as { SpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition ||
    null
  )
}

// Red de seguridad: si la grabación queda colgada sin recibir NADA durante este tiempo,
// la cortamos a la fuerza. iOS Safari a veces no dispara onend ni respeta stop() (sobre
// todo la 1ª vez, al otorgar el permiso), y sin esto la app queda trabada. Cada resultado
// reinicia el reloj, así una dictado real largo no se corta.
const SEGURIDAD_MS = 15_000

export function useVoiceInput({ onFinalTranscript, lang = 'es-AR' }: Options): VoiceState {
  const [isSupported, setIsSupported] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [interimTranscript, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Una instancia *activa* por vez. Cada `start()` crea una nueva y limpia la
  // anterior; cuando termina (onend / onerror), nulleamos el ref.
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const finalCallbackRef = useRef(onFinalTranscript)
  // Timer de la red de seguridad (auto-corte si la grabación queda colgada).
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    finalCallbackRef.current = onFinalTranscript
  }, [onFinalTranscript])

  useEffect(() => {
    setIsSupported(getCtor() !== null)
  }, [])

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort()
        } catch {
          // ignore
        }
        recognitionRef.current = null
      }
    }
  }, [])

  const start = useCallback(() => {
    // Si hay una recognition viva (en cualquier estado), la matamos.
    // Esto previene "InvalidStateError: recognition has already started"
    // cuando el navegador rechaza el permiso pero deja el flag interno activo.
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort()
      } catch {
        // ignore
      }
      recognitionRef.current = null
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    const Ctor = getCtor()
    if (!Ctor) {
      setError('not_supported')
      return
    }

    const rec = new Ctor()
    rec.lang = lang
    rec.continuous = false
    rec.interimResults = true

    const limpiarTimeout = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
    // (Re)arma el reloj de seguridad. Si vence sin actividad, la grabación quedó colgada
    // (iOS no disparó onend / ignoró stop): la cortamos y reseteamos para no trabar la app.
    const armarTimeout = () => {
      limpiarTimeout()
      timeoutRef.current = setTimeout(() => {
        try {
          rec.abort()
        } catch {
          // ignore
        }
        recognitionRef.current = null
        setIsListening(false)
        setInterim('')
      }, SEGURIDAD_MS)
    }

    rec.onresult = (event) => {
      armarTimeout() // hubo actividad → reiniciamos el reloj
      let finalText = ''
      let interimText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const transcript = result[0].transcript
        if (result.isFinal) finalText += transcript
        else interimText += transcript
      }
      if (interimText) setInterim(interimText)
      if (finalText) {
        setInterim('')
        finalCallbackRef.current(finalText.trim())
      }
    }

    rec.onerror = (e) => {
      limpiarTimeout()
      setError(e.error)
      setIsListening(false)
      setInterim('')
      recognitionRef.current = null
    }

    rec.onend = () => {
      limpiarTimeout()
      setIsListening(false)
      setInterim('')
      recognitionRef.current = null
    }

    recognitionRef.current = rec
    setError(null)
    setInterim('')

    try {
      rec.start()
      setIsListening(true)
      armarTimeout()
    } catch (err) {
      limpiarTimeout()
      setError(err instanceof Error ? err.message : 'start_error')
      recognitionRef.current = null
    }
  }, [lang])

  const stop = useCallback(() => {
    if (!recognitionRef.current) return
    try {
      recognitionRef.current.stop()
    } catch {
      // ignore
    }
  }, [])

  const abort = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort()
      } catch {
        // ignore
      }
      recognitionRef.current = null
    }
    setIsListening(false)
    setInterim('')
  }, [])

  return { isSupported, isListening, interimTranscript, error, start, stop, abort }
}

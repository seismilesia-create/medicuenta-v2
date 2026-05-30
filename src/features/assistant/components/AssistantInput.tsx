'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useVoiceInput } from '../hooks/useVoiceInput'

interface Props {
  onSend: (payload: { text: string; files?: FileList }) => void
  isLoading: boolean
  /** Si es true, agrega botón de micrófono (Web Speech API). Default true. */
  withVoice?: boolean
  /** Prefill request from parent. `nonce` distingue requests aunque text sea igual. */
  prefill?: { text: string; nonce: number } | null
}

async function compressImage(file: File, maxWidth = 1400, quality = 0.75): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxWidth / bitmap.width)
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(bitmap, 0, 0, w, h)
  const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) return file
  return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
}

export function AssistantInput({ onSend, isLoading, withVoice = true, prefill }: Props) {
  const [input, setInput] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [compressing, setCompressing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textInputRef = useRef<HTMLInputElement>(null)

  // Cuando el padre pide pre-llenar el input (click en sugerencia), volcamos el
  // texto y enfocamos para que el médico complete y mande UN solo turno.
  useEffect(() => {
    if (!prefill) return
    setInput(prefill.text)
    queueMicrotask(() => {
      textInputRef.current?.focus()
      const el = textInputRef.current
      if (el) el.setSelectionRange(el.value.length, el.value.length)
    })
  }, [prefill])

  const voice = useVoiceInput({
    onFinalTranscript: (text) => {
      // Auto-send cuando termina de dictar
      onSend({ text })
      setInput('')
    },
  })

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = input.trim()
    if (isLoading || compressing) return
    if (!trimmed && pendingFiles.length === 0) return

    let dt: DataTransfer | undefined
    if (pendingFiles.length > 0) {
      dt = new DataTransfer()
      pendingFiles.forEach(f => dt!.items.add(f))
    }

    onSend({
      text: trimmed || 'Analizá esta imagen',
      files: dt?.files,
    })
    setInput('')
    setPendingFiles([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    setCompressing(true)
    const compressed = await Promise.all(Array.from(files).map(f => compressImage(f)))
    setPendingFiles(prev => [...prev, ...compressed])
    setCompressing(false)
  }

  function removeFile(idx: number) {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx))
  }

  function toggleVoice() {
    if (voice.isListening) voice.stop()
    else voice.start()
  }

  const showMic = withVoice && voice.isSupported
  const placeholder = voice.isListening
    ? voice.interimTranscript || 'Escuchando...'
    : compressing
    ? 'Comprimiendo imagen...'
    : 'Preguntá, registrá o escaneá...'

  return (
    <form
      onSubmit={handleSubmit}
      className="p-3 flex flex-col gap-2"
      style={{ borderTop: '1px solid var(--color-border)' }}
    >
      {pendingFiles.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {pendingFiles.map((f, i) => (
            <div
              key={i}
              className="relative w-14 h-14 rounded-lg overflow-hidden"
              style={{ border: '1px solid var(--color-border)' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={URL.createObjectURL(f)} alt={f.name} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="absolute top-0 right-0 w-4 h-4 rounded-bl-lg flex items-center justify-center text-[10px] leading-none"
                style={{ backgroundColor: 'var(--color-error)', color: '#fff' }}
                aria-label="Quitar"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {voice.error && (
        <p className="text-[11px]" style={{ color: 'var(--color-error)' }}>
          {voice.error === 'not-allowed'
            ? 'Necesito permiso del micrófono. Activalo en el navegador.'
            : voice.error === 'no-speech'
            ? 'No te escuché. Intentá de nuevo.'
            : `Error de voz: ${voice.error}`}
        </p>
      )}

      <div className="flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading || compressing}
          className="p-2 rounded-lg transition-colors"
          style={{
            backgroundColor: 'var(--color-background)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-foreground)',
          }}
          aria-label="Adjuntar imagen"
          title="Adjuntar imagen"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        </button>

        {showMic && (
          <button
            type="button"
            onClick={toggleVoice}
            disabled={isLoading || compressing}
            className="p-2 rounded-lg transition-all"
            style={{
              backgroundColor: voice.isListening ? 'var(--color-error)' : 'var(--color-background)',
              border: `1px solid ${voice.isListening ? 'var(--color-error)' : 'var(--color-border)'}`,
              color: voice.isListening ? '#fff' : 'var(--color-foreground)',
            }}
            aria-label={voice.isListening ? 'Detener grabación' : 'Hablar'}
            title={voice.isListening ? 'Detener grabación' : 'Hablar'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-14 0m7 7v3m-4 0h8M12 3a3 3 0 00-3 3v5a3 3 0 006 0V6a3 3 0 00-3-3z" />
            </svg>
          </button>
        )}

        <input
          ref={textInputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
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
          disabled={isLoading || compressing || (!input.trim() && pendingFiles.length === 0)}
          className="p-2 rounded-lg transition-opacity disabled:opacity-30"
          style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </form>
  )
}

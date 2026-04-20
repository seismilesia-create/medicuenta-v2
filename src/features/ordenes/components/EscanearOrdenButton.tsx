'use client'

import { useRef, useState } from 'react'

export interface OrdenEscaneada {
  es_orden_medica: boolean
  motivo_rechazo: string | null
  paciente: string | null
  obra_social: string | null
  nro_afiliado: string | null
  codigo_practica: string | null
  nombre_practica: string | null
  diagnostico: string | null
  fecha: string | null
  medico_solicitante: string | null
  token_osep: string | null
  firma_paciente: boolean | null
  horario_atencion: string | null
  observaciones: string | null
  confianza: 'alta' | 'media' | 'baja'
  campos_dudosos: string[]
}

async function compressImage(file: File, maxWidth = 1400, quality = 0.75): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxWidth / bitmap.width)
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas no disponible')
  ctx.drawImage(bitmap, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}

interface Props {
  onExtracted: (data: OrdenEscaneada) => void
}

export function EscanearOrdenButton({ onExtracted }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setError(null)

    try {
      const dataUrl = await compressImage(file)
      const res = await fetch('/api/ocr-orden', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagen: dataUrl }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error procesando imagen' }))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      const data = (await res.json()) as OrdenEscaneada

      if (!data.es_orden_medica) {
        setError(data.motivo_rechazo ?? 'La imagen no parece ser una orden médica')
        return
      }

      onExtracted(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error procesando imagen')
    } finally {
      setLoading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="mb-6">
      <div
        className="rounded-xl p-4 flex items-center justify-between gap-3"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px dashed var(--color-border)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'var(--color-primary-light, rgba(99,102,241,0.1))', color: 'var(--color-primary)' }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium" style={{ color: 'var(--color-foreground)' }}>
              Escanear orden desde foto
            </p>
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
              Sacá una foto y completamos el formulario automáticamente.
            </p>
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleFile}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="px-3 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-40 flex-shrink-0"
          style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
        >
          {loading ? 'Analizando...' : 'Escanear'}
        </button>
      </div>

      {error && (
        <div
          className="mt-2 px-3 py-2 rounded-lg text-xs"
          style={{ backgroundColor: 'var(--color-error-light, rgba(239,68,68,0.1))', color: 'var(--color-error)' }}
        >
          {error}
        </div>
      )}
    </div>
  )
}

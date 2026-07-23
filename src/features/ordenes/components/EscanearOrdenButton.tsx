'use client'

import { useRef, useState } from 'react'
import type { OrdenExtraida } from '@/lib/ai/ocr-orden'

// El tipo de la orden escaneada es el inferido del schema OCR compartido.
export type OrdenEscaneada = OrdenExtraida

export async function compressImage(file: File, maxWidth = 1400, quality = 0.75): Promise<string> {
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
  /** Foto comprimida (data URL) para guardarla como comprobante de la orden. */
  onImage?: (dataUrl: string) => void
  /**
   * 'hero': pantalla inicial grande y centrada (antes de escanear).
   * 'compact': barra delgada para re-escanear (cuando ya hay datos).
   */
  variant?: 'hero' | 'compact'
}

export function EscanearOrdenButton({ onExtracted, onImage, variant = 'compact' }: Props) {
  // Dos inputs separados: uno con `capture="environment"` para forzar la
  // cámara trasera del celu, otro sin capture para abrir la galería/archivos.
  // Es más confiable que un input único, que en iOS Safari y algunos Android
  // termina abriendo solo el picker de archivos sin opción de cámara.
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
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
        setError(data.motivo_rechazo || 'La imagen no parece ser una orden médica')
        return
      }

      onImage?.(dataUrl)
      onExtracted(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error procesando imagen')
    } finally {
      setLoading(false)
      if (cameraInputRef.current) cameraInputRef.current.value = ''
      if (galleryInputRef.current) galleryInputRef.current.value = ''
    }
  }

  // Inputs ocultos (cámara + galería) y bloque de error: comunes a las dos variantes.
  const inputs = (
    <>
      {/* Input de cámara — capture="environment" abre la cámara trasera */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        className="hidden"
      />
      {/* Input de galería — sin capture, abre el picker normal */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />
    </>
  )

  const errorBox = error && (
    <div
      className="mt-2 px-3 py-2 rounded-lg text-xs"
      style={{ backgroundColor: 'var(--color-error-light, rgba(239,68,68,0.1))', color: 'var(--color-error)' }}
    >
      {error}
    </div>
  )

  // ── Variante HERO: pantalla inicial grande con botones protagonistas ──
  if (variant === 'hero') {
    return (
      <div className="mb-6">
        <div
          className="rounded-2xl px-6 py-8 flex flex-col items-center text-center"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px dashed var(--color-border)' }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ backgroundColor: 'var(--color-primary-light, rgba(99,102,241,0.1))', color: 'var(--color-primary)' }}
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="text-base font-semibold" style={{ color: 'var(--color-foreground)' }}>
            Cargá la orden con una foto
          </p>
          <p className="text-sm mt-1 mb-6 max-w-xs" style={{ color: 'var(--color-muted-foreground)' }}>
            Sacale una foto o subila desde la galería y completamos el formulario por vos.
          </p>

          {inputs}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-sm">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-5 py-4 rounded-xl text-base font-semibold transition-opacity disabled:opacity-40"
              style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
              aria-label="Sacar foto con la cámara"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {loading ? 'Analizando...' : 'Sacar foto'}
            </button>
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-5 py-4 rounded-xl text-base font-semibold transition-opacity disabled:opacity-40"
              style={{
                backgroundColor: 'var(--color-background)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-foreground)',
              }}
              aria-label="Subir foto desde la galería"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Subir foto
            </button>
          </div>

          {errorBox}
        </div>
      </div>
    )
  }

  // ── Variante COMPACT: barra delgada para volver a escanear ──
  return (
    <div className="mb-6">
      <div
        className="rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
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
              ¿Otra foto?
            </p>
            <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
              Volvé a escanear si querés reemplazar los datos.
            </p>
          </div>
        </div>

        {inputs}

        <div className="flex gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
            aria-label="Sacar foto con la cámara"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {loading ? 'Analizando...' : 'Sacar foto'}
          </button>
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-40"
            style={{
              backgroundColor: 'var(--color-background)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-foreground)',
            }}
            aria-label="Subir foto desde la galería"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Subir foto
          </button>
        </div>
      </div>

      {errorBox}
    </div>
  )
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { completarFotoOrden } from '@/actions/consultorio-checkin'
import { compressImage } from './EscanearOrdenButton'
import type { OrdenExtraida } from '@/lib/ai/ocr-orden'

interface Fila {
  id: string
  nombre_paciente: string
  obra_social: string | null
  fecha_atencion: string
  nro_comprobante: string | null
}

/**
 * Lote "órdenes sin foto": los borradores que el mostrador tipeó sin escanear.
 * Con la pila física en mano, se fotografía una atrás de otra desde el celular;
 * el OCR completa SOLO los campos vacíos (lo tipeado no se pisa).
 */
export function OrdenesSinFoto() {
  const [filas, setFilas] = useState<Fila[]>([])
  const [procesando, setProcesando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const targetRef = useRef<string | null>(null)

  const cargar = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('ordenes')
      .select('id, nombre_paciente, obra_social, fecha_atencion, nro_comprobante')
      .is('imagen_comprobante', null)
      .eq('estado', 'borrador')
      .eq('tipo', 'obra_social')
      .eq('nivel', 1)
      .order('fecha_atencion', { ascending: false })
      .limit(50)
    setFilas((data as Fila[] | null) ?? [])
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const ordenId = targetRef.current
    if (!file || !ordenId) return
    setProcesando(ordenId)
    setError(null)
    try {
      const dataUrl = await compressImage(file)
      let ocr: OrdenExtraida | undefined
      try {
        const res = await fetch('/api/ocr-orden', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imagen: dataUrl }),
        })
        if (res.ok) {
          const data = (await res.json()) as OrdenExtraida
          if (data.es_orden_medica) ocr = data
        }
      } catch {
        // sin OCR la foto igual sirve como comprobante
      }
      const r = await completarFotoOrden({ ordenId, imagenDataUrl: dataUrl, ocr })
      if ('error' in r) setError(r.error)
      else await cargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo procesar la foto')
    } finally {
      setProcesando(null)
      targetRef.current = null
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  if (filas.length === 0) return null

  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-amber-600">📄 Órdenes sin foto ({filas.length})</h2>
        <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
          Cargadas a mano en el mostrador. Con la pila en mano, sacales la foto: el OCR completa lo que falte sin pisar
          lo tipeado.
        </p>
      </div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
      <div className="space-y-2">
        {filas.map((f) => (
          <div key={f.id} className="flex items-center gap-3 rounded-xl bg-[var(--color-background)] border border-border px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{f.nombre_paciente}</p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {[f.obra_social, f.nro_comprobante && `N° ${f.nro_comprobante}`, f.fecha_atencion].filter(Boolean).join(' · ')}
              </p>
            </div>
            <button
              onClick={() => {
                targetRef.current = f.id
                inputRef.current?.click()
              }}
              disabled={procesando !== null}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-[var(--color-primary)] text-white disabled:opacity-50"
            >
              {procesando === f.id ? 'Procesando…' : '📷 Foto'}
            </button>
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}

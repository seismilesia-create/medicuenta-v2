'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Prestacion } from '../types/ordenes'

interface Props {
  obraSocial: string
  onSelect: (prestacion: Prestacion) => void
  value?: string
}

export function PracticaAutocomplete({ obraSocial, onSelect, value = '' }: Props) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<Prestacion[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleInputChange(newQuery: string) {
    setQuery(newQuery)

    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (newQuery.length < 2) {
      setResults([])
      setIsOpen(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      const supabase = createClient()

      const { data } = await supabase
        .from('prestaciones')
        .select('id, codigo, detalle, honorarios, gastos, total, seccion, categoria, obra_social')
        .eq('obra_social', obraSocial || 'OSEP')
        .or(`codigo.ilike.%${newQuery}%,detalle.ilike.%${newQuery}%`)
        .limit(15)

      setResults(data ?? [])
      setIsOpen(true)
      setLoading(false)
    }, 300)
  }

  function handleSelect(prestacion: Prestacion) {
    setQuery(`${prestacion.codigo} - ${prestacion.detalle}`)
    setIsOpen(false)
    onSelect(prestacion)
  }

  function formatMonto(valor: number | null): string {
    if (!valor) return '-'
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
    }).format(valor)
  }

  return (
    <div ref={wrapperRef} className="relative">
      <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
        Codigo de practica
      </label>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder="Buscar por código o nombre..."
          className="w-full px-4 py-3 rounded-lg text-sm pr-8"
          style={{
            background: 'var(--color-background)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-foreground)',
          }}
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2" style={{ borderColor: 'var(--color-primary)' }} />
          </div>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div
          className="absolute z-50 w-full mt-1 max-h-64 overflow-y-auto rounded-lg shadow-xl"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
          }}
        >
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSelect(p)}
              className="w-full text-left px-4 py-3"
              style={{ borderBottom: '1px solid var(--color-border)' }}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-mono font-bold" style={{ color: 'var(--color-primary)' }}>
                    {p.codigo}
                  </span>
                  <span className="text-xs ml-2" style={{ color: 'var(--color-muted-foreground)' }}>
                    {p.seccion}
                  </span>
                  <p className="text-sm truncate mt-0.5" style={{ color: 'var(--color-foreground)' }}>
                    {p.detalle}
                  </p>
                </div>
                <span className="text-sm font-mono font-medium ml-3 whitespace-nowrap" style={{ color: 'var(--color-success)' }}>
                  {formatMonto(p.total)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {isOpen && results.length === 0 && !loading && query.length >= 2 && (
        <div
          className="absolute z-50 w-full mt-1 p-4 text-center text-sm rounded-lg"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-muted-foreground)',
          }}
        >
          No se encontraron practicas
        </div>
      )}
    </div>
  )
}

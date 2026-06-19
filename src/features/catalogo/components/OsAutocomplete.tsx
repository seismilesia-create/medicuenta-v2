'use client'

import { useState, useMemo } from 'react'
import { normalizarOs } from '@/lib/consultorio/osSuspendidas'
import type { OsCatalogoItem } from '@/lib/catalogo/obras-sociales'

interface Props {
  catalogo: OsCatalogoItem[]
  valor: string                       // obra_social actual (texto)
  onSelect: (sel: { nombre_os: string; codigo_os: number | null }) => void
  inputClassName?: string
  inputStyle?: React.CSSProperties
}

export function OsAutocomplete({ catalogo, valor, onSelect, inputClassName, inputStyle }: Props) {
  const [texto, setTexto] = useState(valor)
  const [abierto, setAbierto] = useState(false)

  const sugerencias = useMemo(() => {
    const q = normalizarOs(texto)
    if (!q) return catalogo.slice(0, 8)
    return catalogo.filter((c) => normalizarOs(c.nombre_os).includes(q)).slice(0, 8)
  }, [texto, catalogo])

  function elegir(item: OsCatalogoItem) {
    setTexto(item.nombre_os)
    setAbierto(false)
    onSelect({ nombre_os: item.nombre_os, codigo_os: item.codigo_os })
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={texto}
        placeholder="Buscar obra social..."
        onChange={(e) => { setTexto(e.target.value); setAbierto(true); onSelect({ nombre_os: e.target.value, codigo_os: null }) }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        className={inputClassName}
        style={inputStyle}
      />
      {abierto && sugerencias.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg shadow-lg"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          {sugerencias.map((c) => (
            <li key={c.codigo_os}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); elegir(c) }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-primary/10"
                style={{ color: 'var(--color-foreground)' }}>
                <span>{c.nombre_os}</span>
                {!c.activa && <span className="text-xs" style={{ color: 'var(--color-warning)' }}>suspendida</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

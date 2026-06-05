'use client'

import { useState } from 'react'
import { Camera, Mic } from 'lucide-react'
import { NuevaOrdenForm } from './NuevaOrdenForm'
import { NuevaFojaForm } from './NuevaFojaForm'

/**
 * Selector de nivel de orden:
 *  - Nivel 1: consulta / práctica ambulatoria → se carga por FOTO (NuevaOrdenForm)
 *  - Nivel 2: foja quirúrgica → se carga por VOZ (NuevaFojaForm)
 */
export function NuevaOrdenSwitcher() {
  const [nivel, setNivel] = useState<1 | 2>(1)

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-foreground)' }}>
          Tipo de orden
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setNivel(1)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
            style={nivel === 1
              ? { background: 'var(--color-primary)', color: '#fff', boxShadow: '0 0 0 2px var(--color-primary)' }
              : { background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-muted-foreground)' }}
          >
            <Camera className="h-5 w-5 shrink-0" />
            <span>
              <span className="block text-sm font-medium">Nivel 1 — Consulta / práctica</span>
              <span className="block text-xs opacity-80">Se carga por foto</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setNivel(2)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
            style={nivel === 2
              ? { background: 'var(--color-primary)', color: '#fff', boxShadow: '0 0 0 2px var(--color-primary)' }
              : { background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-muted-foreground)' }}
          >
            <Mic className="h-5 w-5 shrink-0" />
            <span>
              <span className="block text-sm font-medium">Nivel 2 — Foja quirúrgica</span>
              <span className="block text-xs opacity-80">Se carga por voz</span>
            </span>
          </button>
        </div>
      </div>

      {nivel === 1 ? <NuevaOrdenForm /> : <NuevaFojaForm />}
    </div>
  )
}

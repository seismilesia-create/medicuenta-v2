'use client'

import { useEffect, useState } from 'react'
import { useSidePanelStore } from '../store/sidePanelStore'

/**
 * Wrapper del <main> de las rutas (main) que ajusta dinámicamente el margen
 * derecho según si el panel del asistente está abierto o cerrado.
 *
 * El sidebar izquierdo se queda en md:ml-72 (eso lo maneja el layout).
 * Acá controlamos el margen derecho que reserva espacio para el panel.
 */
export function MainShell({ children }: { children: React.ReactNode }) {
  const isOpen = useSidePanelStore((s) => s.isOpen)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  // Antes de hidratarse, asumimos panel abierto (default del store) para
  // evitar un salto visible si el localStorage también dice "abierto".
  const panelOpen = mounted ? isOpen : true

  return (
    <main
      className={`pt-14 pb-20 md:pt-0 md:pb-0 md:ml-72 transition-[margin] duration-300 ease-out ${
        panelOpen ? 'md:mr-[380px]' : 'md:mr-0'
      }`}
    >
      {children}
    </main>
  )
}

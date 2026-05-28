'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SidePanelState {
  /** ¿El panel del asistente está abierto en desktop? */
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

/**
 * Estado del panel lateral del asistente.
 * Persiste en localStorage para que el médico no tenga que reabrirlo en cada navegación.
 */
export const useSidePanelStore = create<SidePanelState>()(
  persist(
    (set) => ({
      isOpen: true,
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
    }),
    {
      name: 'medicuenta-side-panel',
    },
  ),
)

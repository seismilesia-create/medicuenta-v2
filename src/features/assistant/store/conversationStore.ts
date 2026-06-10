'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ConversationState {
  /** Id de la conversación activa del asistente. null = conversación nueva. */
  conversationId: string | null
  setConversationId: (id: string | null) => void
  /** Arranca una conversación nueva (limpia el id persistido). */
  reset: () => void
}

/**
 * Guarda la conversación activa del asistente en localStorage para que al salir
 * de la sección y volver (o navegar entre páginas) se restaure el chat en curso
 * en vez de empezar de cero. Los mensajes en sí viven en BD; acá solo el id.
 */
export const useConversationStore = create<ConversationState>()(
  persist(
    (set) => ({
      conversationId: null,
      setConversationId: (id) => set({ conversationId: id }),
      reset: () => set({ conversationId: null }),
    }),
    {
      name: 'medicuenta-active-conversation',
    },
  ),
)

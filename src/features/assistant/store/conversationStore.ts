'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ConversationState {
  /** Id de la conversación activa del asistente. null = conversación nueva. */
  conversationId: string | null
  setConversationId: (id: string | null) => void
  /**
   * Contador que sube en cada `reset()`. Los consumidores del asistente
   * (home + panel lateral) lo observan para vaciar su chat EN MEMORIA cuando se
   * reinicia (ej: inactividad). Efímero: NO se persiste.
   */
  resetNonce: number
  /**
   * Arranca una conversación nueva: limpia el id persistido y avisa a los chats
   * montados (vía `resetNonce`) para que vuelvan a foja cero.
   */
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
      resetNonce: 0,
      reset: () => set((s) => ({ conversationId: null, resetNonce: s.resetNonce + 1 })),
    }),
    {
      name: 'medicuenta-active-conversation',
      // Solo el id se persiste; el nonce es una señal efímera de esta sesión.
      partialize: (s) => ({ conversationId: s.conversationId }),
    },
  ),
)

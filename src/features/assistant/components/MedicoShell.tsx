'use client'

import { usePathname } from 'next/navigation'
import { AssistantHome } from './AssistantHome'

/**
 * Shell del MÉDICO que decide qué mostrar según la ruta (asistente-first).
 *
 * - En `/asistente` (home del asistente): en CELULAR se muestra el `AssistantHome`
 *   a pantalla completa (mic) y el shell queda `only-web` (oculto en el teléfono).
 *   En ESCRITORIO se ve el shell normal con el asistente en el panel lateral.
 * - En cualquier otra ruta: el shell se muestra en ambos (modo app normal en celular:
 *   header con menú + BottomNav + FAB del asistente), y NO se renderiza `AssistantHome`.
 *
 * `children` = el shell del médico (Sidebar + MainShell{page} + BottomNav + SidePanel).
 * Se renderiza UNA sola vez: `AssistantHome` no lo contiene, así que no hay doble montaje.
 */
export function MedicoShell({
  nombre,
  children,
}: {
  nombre: string | null
  children: React.ReactNode
}) {
  const enHomeAsistente = usePathname() === '/asistente'

  return (
    <>
      <div className={enHomeAsistente ? 'only-web' : undefined}>{children}</div>
      {enHomeAsistente && (
        <div className="only-phone h-[100dvh] w-screen overflow-hidden">
          <AssistantHome nombre={nombre} />
        </div>
      )}
    </>
  )
}

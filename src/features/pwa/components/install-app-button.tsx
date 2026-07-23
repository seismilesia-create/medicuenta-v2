'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { useInstallPWA } from '../hooks/useInstallPWA'
import { InstallIosSheet } from './install-ios-sheet'

interface Props {
  /**
   * `pill`: chip discreto para la barra superior de la pantalla del asistente.
   * `auth`: botón suelto para la pantalla de login.
   */
  variant: 'pill' | 'auth'
  /** Se llama tras instalar o cerrar la hoja. */
  onDone?: () => void
}

/**
 * Punto de entrada para instalar la PWA. Se muestra SOLO si tiene sentido:
 * desaparece cuando la app ya corre instalada o cuando el navegador no ofrece
 * ninguna vía de instalación.
 *
 * En Android/escritorio dispara el diálogo nativo del navegador (un toque). En
 * iPhone abre `InstallIosSheet` con los pasos, porque Safari no expone API.
 */
export function InstallAppButton({ variant, onDone }: Props) {
  const { yaInstalada, modo, loading, instalar } = useInstallPWA()
  const [mostrarIOS, setMostrarIOS] = useState(false)

  if (loading || yaInstalada || modo === 'no-disponible') return null

  const handleClick = async () => {
    if (modo === 'nativo') {
      await instalar()
      onDone?.()
      return
    }
    setMostrarIOS(true)
  }

  const cerrarIOS = () => {
    setMostrarIOS(false)
    onDone?.()
  }

  return (
    <>
      {variant === 'pill' ? (
        <button
          type="button"
          onClick={handleClick}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
        >
          <Download className="h-3.5 w-3.5" />
          Instalar app
        </button>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          className="mx-auto flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground-secondary transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <Download className="h-4 w-4" />
          Instalar la app en tu celular
        </button>
      )}

      {mostrarIOS && (
        <InstallIosSheet soloSafari={modo === 'ios-otro-navegador'} onClose={cerrarIOS} />
      )}
    </>
  )
}

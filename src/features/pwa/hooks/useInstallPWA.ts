'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Cómo puede instalarse la app en este dispositivo/navegador.
 * - `nativo`: hay prompt de instalación del navegador (Chrome/Edge, Android y escritorio) → un toque.
 * - `ios-safari`: iPhone/iPad en Safari. No existe API: hay que guiar por Compartir → Agregar a inicio.
 * - `ios-otro-navegador`: iOS en Chrome/Firefox/Edge. NO pueden instalar: hay que abrirlo en Safari.
 * - `no-disponible`: ya instalada, navegador sin soporte, o el prompt todavía no llegó.
 */
export type ModoInstalacion = 'nativo' | 'ios-safari' | 'ios-otro-navegador' | 'no-disponible'

interface UseInstallPWAReturn {
  /** La app ya corre instalada (standalone) → no tiene sentido ofrecer instalarla. */
  yaInstalada: boolean
  modo: ModoInstalacion
  /** Evita el parpadeo del botón durante el primer render (aún no sabemos nada del entorno). */
  loading: boolean
  /**
   * Dispara el diálogo nativo del navegador. Solo tiene efecto con `modo === 'nativo'`.
   * Devuelve `true` si el usuario aceptó instalar.
   */
  instalar: () => Promise<boolean>
}

/** El evento `beforeinstallprompt` no está en lib.dom: lo tipamos con lo que usamos. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

declare global {
  interface Window {
    /** Lo setea el script inline de `src/app/layout.tsx` (corre antes que React). */
    __mcInstallPrompt?: BeforeInstallPromptEvent | null
  }
}

/** iOS incluye el iPad moderno, que miente y se reporta como Macintosh con touch. */
function esIOS(): boolean {
  const ua = navigator.userAgent
  if (/iphone|ipad|ipod/i.test(ua)) return true
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
}

/** En iOS todos los navegadores usan WebKit, pero solo Safari puede instalar a la pantalla de inicio. */
function esSafariIOS(): boolean {
  return !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(navigator.userAgent)
}

function corriendoInstalada(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  // iOS no soporta display-mode: usa este flag propietario.
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/**
 * Estado de instalabilidad de la PWA para el dispositivo actual.
 *
 * El evento `beforeinstallprompt` NO se escucha acá: Chrome lo dispara antes de
 * que monte React, así que lo captura un script inline en el layout raíz y lo
 * deja en `window.__mcInstallPrompt`. Este hook lo lee y además escucha los
 * eventos `mc:installable` / `mc:installed` que emite ese mismo script, para el
 * caso de que el evento llegue con la página ya montada.
 */
export function useInstallPWA(): UseInstallPWAReturn {
  const [yaInstalada, setYaInstalada] = useState(false)
  const [modo, setModo] = useState<ModoInstalacion>('no-disponible')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const evaluar = () => {
      if (corriendoInstalada()) {
        setYaInstalada(true)
        setModo('no-disponible')
        return
      }
      setYaInstalada(false)

      if (esIOS()) {
        setModo(esSafariIOS() ? 'ios-safari' : 'ios-otro-navegador')
        return
      }

      setModo(window.__mcInstallPrompt ? 'nativo' : 'no-disponible')
    }

    evaluar()
    setLoading(false)

    // `mc:installable` puede llegar después del montaje (Chrome no garantiza cuándo).
    window.addEventListener('mc:installable', evaluar)
    window.addEventListener('mc:installed', evaluar)
    return () => {
      window.removeEventListener('mc:installable', evaluar)
      window.removeEventListener('mc:installed', evaluar)
    }
  }, [])

  const instalar = useCallback(async () => {
    const prompt = window.__mcInstallPrompt
    if (!prompt) return false

    // `beforeinstallprompt` es de un solo uso: reusarlo tira error, así que se
    // descarta apenas se consume. Si el usuario dice que no, Chrome volverá a
    // dispararlo en una visita futura y el script del layout lo recapturará.
    window.__mcInstallPrompt = null
    setModo('no-disponible')

    await prompt.prompt()
    const { outcome } = await prompt.userChoice

    if (outcome === 'accepted') setYaInstalada(true)
    return outcome === 'accepted'
  }, [])

  return { yaInstalada, modo, loading, instalar }
}

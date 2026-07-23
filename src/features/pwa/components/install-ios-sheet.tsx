'use client'

import { X, PlusSquare, Compass } from 'lucide-react'

/**
 * Ícono Compartir de iOS (cuadrado con flecha saliendo hacia arriba).
 * Va dibujado a mano porque es LO que el médico tiene que reconocer en la barra
 * de Safari: describirlo con palabras no alcanza para alguien no técnico.
 */
function IconoCompartirIOS({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className} aria-hidden>
      <path d="M12 3v12" strokeLinecap="round" />
      <path d="M8.5 6.5 12 3l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 10.5H5.5A1.5 1.5 0 0 0 4 12v7.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V12a1.5 1.5 0 0 0-1.5-1.5H17" strokeLinecap="round" />
    </svg>
  )
}

interface Props {
  /** `true` cuando el usuario está en iOS pero NO en Safari (Chrome, Firefox, Edge). */
  soloSafari: boolean
  onClose: () => void
}

/**
 * Hoja con los pasos para instalar en iPhone/iPad.
 *
 * iOS no expone ninguna API de instalación (no hay `beforeinstallprompt`), así
 * que lo único posible es guiar al usuario por el menú Compartir de Safari.
 * Importa que quede claro: en iOS las notificaciones push SOLO funcionan con la
 * app instalada, así que este paso no es opcional para el médico.
 */
export function InstallIosSheet({ soloSafari, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cómo instalar MediCuenta en tu iPhone"
        className="relative w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-border bg-card p-5 pb-8 sm:pb-5 shadow-xl animate-slide-up"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        {soloSafari ? (
          <>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
              <Compass className="h-6 w-6 text-primary" />
            </div>
            <h2 className="mt-3 pr-6 text-base font-semibold text-foreground">
              Abrila en Safari para instalarla
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              En iPhone solo Safari puede agregar apps a la pantalla de inicio. Copiá esta dirección,
              pegala en Safari y volvé a tocar «Instalar app».
            </p>
            <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-center text-sm font-medium text-foreground">
              {typeof window === 'undefined' ? '' : window.location.host}
            </p>
          </>
        ) : (
          <>
            <h2 className="pr-6 text-base font-semibold text-foreground">
              Instalá MediCuenta en 3 pasos
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Te queda como una app más, con su ícono y sin la barra del navegador.
            </p>

            <ol className="mt-5 space-y-4">
              <PasoIOS numero={1}>
                <span>
                  Tocá el botón <strong className="text-foreground">Compartir</strong> abajo en la
                  barra de Safari.
                </span>
                <IconoCompartirIOS className="h-6 w-6 shrink-0 text-primary" />
              </PasoIOS>

              <PasoIOS numero={2}>
                <span>
                  Deslizá y elegí{' '}
                  <strong className="text-foreground">«Agregar a pantalla de inicio»</strong>.
                </span>
                <PlusSquare className="h-6 w-6 shrink-0 text-primary" />
              </PasoIOS>

              <PasoIOS numero={3}>
                <span>
                  Tocá <strong className="text-foreground">«Agregar»</strong> arriba a la derecha.
                  ¡Listo!
                </span>
              </PasoIOS>
            </ol>

            <button
              type="button"
              onClick={onClose}
              className="mt-6 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Entendido
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function PasoIOS({ numero, children }: { numero: number; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
        {numero}
      </span>
      <div className="flex flex-1 items-center gap-3 text-sm leading-snug text-muted-foreground">
        {children}
      </div>
    </li>
  )
}

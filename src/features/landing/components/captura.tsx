'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ImageIcon } from 'lucide-react'

/**
 * Capturas reales de la app dentro de un marco (navegador o teléfono).
 *
 * Cuando hay dos versiones de la misma pantalla (tema claro y oscuro), hacen un crossfade
 * en bucle: muestra el mismo producto en sus dos modos sin ocupar el doble de espacio, y le
 * da movimiento a la sección. La animación corre SOLO mientras el bloque está a la vista
 * (IntersectionObserver) y se detiene si el visitante pidió reducir el movimiento.
 *
 * Si un archivo todavía no existe, cae al placeholder rotulado en vez de romper la página.
 */

const MS_POR_IMAGEN = 4200

interface Props {
  /** Rutas dentro de /public. La segunda es opcional: sin ella no hay crossfade. */
  imagenes: string[]
  alt: string
  marco: 'navegador' | 'telefono'
  /** Texto del placeholder mientras no exista el archivo. */
  rotulo: string
  /** Desfasa el inicio del ciclo para que las tarjetas vecinas no cambien todas juntas. */
  retrasoMs?: number
  prioridad?: boolean
}

export function Captura({ imagenes, alt, marco, rotulo, retrasoMs = 0, prioridad = false }: Props) {
  const [visible, setVisible] = useState(0)
  const [rotas, setRotas] = useState<Set<string>>(new Set())
  const contenedor = useRef<HTMLDivElement>(null)

  const disponibles = imagenes.filter((src) => !rotas.has(src))
  const alterna = disponibles.length > 1

  useEffect(() => {
    if (!alterna) return
    const nodo = contenedor.current
    if (!nodo) return
    const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (sinMovimiento) return

    let timer: ReturnType<typeof setInterval> | undefined
    let arranque: ReturnType<typeof setTimeout> | undefined
    const observer = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting && !timer) {
          arranque = setTimeout(() => {
            timer = setInterval(() => setVisible((v) => (v + 1) % disponibles.length), MS_POR_IMAGEN)
          }, retrasoMs)
        } else if (!entrada.isIntersecting) {
          clearTimeout(arranque)
          clearInterval(timer)
          timer = undefined
        }
      },
      { threshold: 0.25 },
    )
    observer.observe(nodo)
    return () => {
      clearTimeout(arranque)
      clearInterval(timer)
      observer.disconnect()
    }
  }, [alterna, disponibles.length, retrasoMs])

  const aspecto = marco === 'telefono' ? 'aspect-[9/19.5]' : 'aspect-[16/10]'

  const contenido =
    disponibles.length === 0 ? (
      <div className="grid h-full w-full place-items-center bg-primary-50/60 dark:bg-primary-900/20">
        <div className="px-4 text-center">
          <ImageIcon className="mx-auto h-7 w-7 text-primary-300 dark:text-primary-700" aria-hidden="true" />
          <p className="mt-2 font-mono text-[11px] font-medium text-primary-600 dark:text-primary-400">{rotulo}</p>
        </div>
      </div>
    ) : (
      disponibles.map((src, i) => (
        <Image
          key={src}
          src={src}
          alt={i === 0 ? alt : ''}
          aria-hidden={i !== 0}
          fill
          sizes={marco === 'telefono' ? '(max-width: 768px) 60vw, 260px' : '(max-width: 768px) 92vw, 560px'}
          priority={prioridad && i === 0}
          onError={() => setRotas((prev) => new Set(prev).add(src))}
          className={`object-cover object-top transition-opacity duration-700 ease-in-out ${
            i === visible % disponibles.length ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ))
    )

  if (marco === 'telefono') {
    return (
      <div ref={contenedor} className="mx-auto w-full max-w-[240px]">
        <div className="rounded-[2rem] border-[6px] border-slate-800 bg-slate-800 shadow-2xl shadow-slate-900/25 dark:border-slate-700 dark:bg-slate-700">
          <div className={`relative ${aspecto} overflow-hidden rounded-[1.6rem] bg-white dark:bg-slate-900`}>
            {/* Muesca del teléfono */}
            <div className="absolute left-1/2 top-0 z-10 h-4 w-20 -translate-x-1/2 rounded-b-xl bg-slate-800 dark:bg-slate-700" />
            {contenido}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={contenedor} className="w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg shadow-slate-900/5">
      {/* Barra del navegador: ubica la captura como "esto es la app, en tu compu" */}
      <div className="flex items-center gap-1.5 border-b border-border/70 bg-muted/60 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-red-400/70" />
        <span className="h-2 w-2 rounded-full bg-amber-400/70" />
        <span className="h-2 w-2 rounded-full bg-emerald-400/70" />
        <span className="ml-2 truncate rounded-md bg-background/70 px-2 py-0.5 text-[10px] text-muted-foreground">
          medicuenta.app
        </span>
      </div>
      <div className={`relative ${aspecto} bg-background`}>{contenido}</div>
    </div>
  )
}

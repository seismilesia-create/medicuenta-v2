'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  getDia,
  getAgendaSemana,
  getMesContadores,
  type DiaAgenda,
  type AgendaSemana,
  type DiaMesContador,
} from '@/features/consultorio/services/panelService'
import { bloquearDias } from '@/actions/consultorio-agenda'
import { arDateString, AR_OFFSET, AR_TZ } from '@/lib/turnos/slots'
import { addDias, inicioSemana } from '@/lib/consultorio/calendario'
import { fmtFechaLarga } from '@/lib/turnos/formato'
import { HeaderAgenda, type Vista } from './header-agenda'
import { VistaDia } from './vista-dia'
import { VistaSemana } from './vista-semana'
import { VistaMes } from './vista-mes'
import { TurnoManualForm } from './turno-manual-form'
import { SobreturnoForm } from './sobreturno-form'
import { TurnoPopover } from './turno-popover'
import type { TurnoItem } from './timeline-dia'

const POLL_MS = 15_000

/** Primer día del mes a `delta` meses de la fecha dada. */
function mesVecino(fecha: string, delta: number): string {
  const [y, m] = fecha.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function fmtMesLargo(fecha: string): string {
  return new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: AR_TZ }).format(
    new Date(`${fecha.slice(0, 7)}-15T12:00:00${AR_OFFSET}`),
  )
}

export function AgendaView({ medicoId }: { medicoId: string }) {
  const [vista, setVista] = useState<Vista>('dia')
  const [fecha, setFecha] = useState(() => arDateString(Date.now(), 0))
  const [dia, setDia] = useState<DiaAgenda | null>(null)
  const [semana, setSemana] = useState<AgendaSemana | null>(null)
  const [mesCont, setMesCont] = useState<DiaMesContador[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [slotElegido, setSlotElegido] = useState<{ fecha: string; hora: string } | null>(null)
  const [sobreturnoOpen, setSobreturnoOpen] = useState(false)
  const [turnoElegido, setTurnoElegido] = useState<TurnoItem | null>(null)
  const seq = useRef(0)

  const refetch = useCallback(async () => {
    const id = ++seq.current
    const supabase = createClient()
    try {
      if (vista === 'dia') {
        const d = await getDia(supabase, medicoId, fecha)
        if (id !== seq.current) return
        setDia(d)
      } else if (vista === 'semana') {
        const s = await getAgendaSemana(supabase, medicoId, inicioSemana(fecha))
        if (id !== seq.current) return
        setSemana(s)
      } else {
        const [anio, mes] = fecha.split('-').map(Number)
        const c = await getMesContadores(supabase, medicoId, anio, mes)
        if (id !== seq.current) return
        setMesCont(c)
      }
      setError(null)
    } catch {
      if (id !== seq.current) return
      setError('No pude cargar la agenda. Reintentando…')
    }
    if (id !== seq.current) return
    setLoading(false)
  }, [medicoId, fecha, vista])

  useEffect(() => {
    setLoading(true)
    refetch()
    const t = setInterval(refetch, POLL_MS)
    return () => clearInterval(t)
  }, [refetch])

  async function onAccion(fn: () => Promise<{ error?: string } | { ok: true }>) {
    // El refetch borra errores obsoletos con setError(null) en su rama éxito.
    // El error de la acción se pone DESPUÉS para que persista (el poll de 15s
    // lo borrará si el siguiente refetch es exitoso — comportamiento aceptable).
    const r = await fn()
    await refetch()
    if ('error' in r && r.error) setError(r.error)
  }

  function mover(delta: -1 | 1) {
    if (vista === 'dia') setFecha(addDias(fecha, delta))
    else if (vista === 'semana') setFecha(addDias(inicioSemana(fecha), delta * 7))
    else setFecha(mesVecino(fecha, delta))
  }

  function irADia(f: string) {
    setFecha(f)
    setVista('dia')
  }

  function bloquearEsteDia() {
    const nota = window.prompt('Bloquear ESTE día (vacaciones/congreso). Nota opcional:')
    if (nota !== null) onAccion(() => bloquearDias({ desde: fecha, hasta: fecha, nota }))
  }

  let titulo = ''
  if (vista === 'dia') {
    titulo = capitalizar(fmtFechaLarga(`${fecha}T12:00:00${AR_OFFSET}`))
  } else if (vista === 'semana') {
    const lunes = inicioSemana(fecha)
    const domingo = addDias(lunes, 6)
    const fin = new Intl.DateTimeFormat('es-AR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: AR_TZ,
    }).format(new Date(`${domingo}T12:00:00${AR_OFFSET}`))
    const ini =
      lunes.slice(0, 7) === domingo.slice(0, 7)
        ? String(Number(lunes.slice(8)))
        : new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', timeZone: AR_TZ }).format(
            new Date(`${lunes}T12:00:00${AR_OFFSET}`),
          )
    titulo = `${ini} – ${fin}`
  } else {
    titulo = capitalizar(fmtMesLargo(fecha))
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <HeaderAgenda
        vista={vista}
        titulo={titulo}
        onVista={setVista}
        onPrev={() => mover(-1)}
        onHoy={() => setFecha(arDateString(Date.now(), 0))}
        onNext={() => mover(1)}
      />

      {error && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-500/20">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-[var(--color-muted-foreground)]" />
        </div>
      ) : vista === 'dia' && dia ? (
        <VistaDia
          fecha={fecha}
          dia={dia}
          onSlotClick={(f, h) => setSlotElegido({ fecha: f, hora: h })}
          onTurnoClick={setTurnoElegido}
          onAccion={onAccion}
          onNuevoSobreturno={() => setSobreturnoOpen(true)}
          onBloquearDia={bloquearEsteDia}
        />
      ) : vista === 'semana' && semana ? (
        <VistaSemana
          semana={semana}
          onDiaClick={irADia}
          onSlotClick={(f, h) => setSlotElegido({ fecha: f, hora: h })}
          onTurnoClick={setTurnoElegido}
        />
      ) : vista === 'mes' && mesCont ? (
        <VistaMes
          anio={Number(fecha.slice(0, 4))}
          mes={Number(fecha.slice(5, 7))}
          contadores={mesCont}
          onDiaClick={irADia}
        />
      ) : null}

      {slotElegido && (
        <TurnoManualForm
          fecha={slotElegido.fecha}
          hora={slotElegido.hora}
          onClose={() => setSlotElegido(null)}
          onDone={() => {
            setSlotElegido(null)
            refetch()
          }}
        />
      )}
      {sobreturnoOpen && (
        <SobreturnoForm
          fecha={fecha}
          onClose={() => setSobreturnoOpen(false)}
          onDone={() => {
            setSobreturnoOpen(false)
            refetch()
          }}
        />
      )}
      {turnoElegido && <TurnoPopover item={turnoElegido} onClose={() => setTurnoElegido(null)} onAccion={onAccion} />}
    </div>
  )
}

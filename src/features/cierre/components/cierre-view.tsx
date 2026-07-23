'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { cerrarDia, getCierreDia, type CierreDia } from '@/actions/cierre'
import { hoyArgentina } from '@/shared/lib/fechas'
import { addDias } from '@/lib/consultorio/calendario'
import { MEDIOS_COBRO, MEDIO_LABELS } from '@/features/cobros/types/cobros'

const $ = (n: number) => `$${(Number(n) || 0).toLocaleString('es-AR')}`

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border p-5 space-y-3">
      <h2 className="font-semibold">{titulo}</h2>
      {children}
    </section>
  )
}

/** Rendición diaria: órdenes por OS, caja por medio, recetas y turnos vs. plata. */
export function CierreView() {
  const [fecha, setFecha] = useState(() => hoyArgentina())
  const [data, setData] = useState<CierreDia | null>(null)
  const [loading, setLoading] = useState(true)
  const [cerrando, setCerrando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    const r = await getCierreDia(fecha)
    if ('error' in r) setError(r.error)
    else setData(r)
    setLoading(false)
  }, [fecha])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function cerrar() {
    setCerrando(true)
    const r = await cerrarDia(fecha)
    setCerrando(false)
    if ('error' in r) setError(r.error)
    else cargar()
  }

  const esHoy = fecha === hoyArgentina()
  const r = data?.resumen

  return (
    <div className="px-4 py-6 md:px-8 md:py-10 max-w-4xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Cierre del día</h1>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
            La rendición diaria: órdenes, caja y turnos. La vista siempre se calcula en vivo; &quot;Cerrar día&quot;
            guarda la foto.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setFecha(addDias(fecha, -1))} className="rounded-lg border border-border p-2" aria-label="Día anterior">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium tabular-nums">{fecha}</span>
          <button
            onClick={() => setFecha(addDias(fecha, 1))}
            disabled={esHoy}
            className="rounded-lg border border-border p-2 disabled:opacity-40"
            aria-label="Día siguiente"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {!esHoy && (
            <button onClick={() => setFecha(hoyArgentina())} className="text-sm underline text-[var(--color-muted-foreground)]">
              Hoy
            </button>
          )}
        </div>
      </div>

      {data?.cierre && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 px-4 py-2.5 text-sm text-emerald-700 dark:text-emerald-400">
          {data.cierre.automatico
            ? '✓ Cierre automático (fin del día).'
            : `✓ Cerrado por ${data.cierre.cerradoPor}.`}{' '}
          La foto guardada se actualiza si volvés a cerrar.
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-2.5 text-sm text-red-600">{error}</div>
      )}

      {loading || !r ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-[var(--color-muted-foreground)]" />
        </div>
      ) : (
        <>
          <Tarjeta titulo={`Órdenes cargadas (${r.ordenes.total}) — ${$(r.ordenes.honorariosTotal)}`}>
            {r.ordenes.porOs.length === 0 ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">Sin órdenes cargadas este día.</p>
            ) : (
              <div className="space-y-1.5 text-sm">
                {r.ordenes.porOs.map((g) => (
                  <div key={g.os} className="flex items-center justify-between">
                    <span>{g.os}</span>
                    <span className="tabular-nums text-[var(--color-muted-foreground)]">
                      {g.cantidad} {g.cantidad === 1 ? 'orden' : 'órdenes'} · <strong className="text-[var(--color-foreground)]">{$(g.honorarios)}</strong>
                    </span>
                  </div>
                ))}
              </div>
            )}
            {r.ordenes.fueraDeFecha.length > 0 && (
              <p className="text-xs text-amber-600">
                ⚠ {r.ordenes.fueraDeFecha.length} cargadas hoy con atención de otro día:{' '}
                {r.ordenes.fueraDeFecha.map((o) => `${o.paciente} (${o.fechaAtencion})`).join(' · ')}
              </p>
            )}
            {r.ordenes.deRecetas.length > 0 && (
              <p className="text-xs text-amber-600">
                📄 {r.ordenes.deRecetas.length} provienen de recetas (no fueron atención):{' '}
                {r.ordenes.deRecetas.map((o) => o.paciente).join(' · ')}
              </p>
            )}
          </Tarjeta>

          <Tarjeta titulo={`Caja del día — ${$(r.caja.total)}`}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {MEDIOS_COBRO.map((m) => (
                <div key={m} className="rounded-xl border border-border p-3">
                  <p className="text-xs text-[var(--color-muted-foreground)]">{MEDIO_LABELS[m]}</p>
                  <p className="font-mono font-semibold">{$(r.caja.porMedio[m])}</p>
                </div>
              ))}
            </div>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Plus: <strong className="text-[var(--color-foreground)]">{$(r.caja.plusTotal)}</strong> · Consultas
              particulares: <strong className="text-[var(--color-foreground)]">{$(r.caja.particularTotal)}</strong>
              {r.caja.pendientesMp > 0 && (
                <span className="text-amber-600"> · Links MP sin pagar: {$(r.caja.pendientesMp)}</span>
              )}
            </p>
          </Tarjeta>

          <Tarjeta titulo="Recetas">
            <p className="text-sm">
              Cobradas por MercadoPago:{' '}
              <strong>
                {r.recetas.pagadasMp} ({$(r.recetas.pagadasMpMonto)})
              </strong>{' '}
              · Liberadas por orden de consulta: <strong>{r.recetas.liberadasOrden}</strong>
            </p>
          </Tarjeta>

          <Tarjeta titulo={`Turnos (${r.turnos.total})`}>
            <p className="text-sm">
              Atendidos: <strong>{r.turnos.atendidos}</strong> · No vinieron: <strong>{r.turnos.noVino}</strong> · Con
              check-in: <strong>{r.turnos.checkins}</strong>
            </p>
            {r.turnos.sinOrden.length > 0 && (
              <div className="rounded-xl border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm text-red-600">
                <p className="font-semibold">⚠ Atendidos sin orden ni cobro registrado:</p>
                <p>{r.turnos.sinOrden.map((t) => t.paciente).join(' · ')}</p>
              </div>
            )}
          </Tarjeta>

          <button
            onClick={cerrar}
            disabled={cerrando}
            className="w-full rounded-xl bg-[var(--color-primary)] text-white py-3 text-sm font-semibold disabled:opacity-50"
          >
            {cerrando ? 'Cerrando…' : data?.cierre ? 'Volver a cerrar el día (actualiza la foto)' : 'Cerrar día'}
          </button>
        </>
      )}
    </div>
  )
}

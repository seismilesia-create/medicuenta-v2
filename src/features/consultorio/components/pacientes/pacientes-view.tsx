'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { Loader2, Search, MessageCircle, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getPacientes, getFicha, type PacienteRow, type FichaPaciente } from '@/features/consultorio/services/panelService'
import { editarPaciente } from '@/actions/consultorio-pacientes'
import { estadoEfectivoTurno } from '@/lib/consultorio/asistencia'

export function PacientesView({ medicoId, puedeVerRecetas = true }: { medicoId: string; puedeVerRecetas?: boolean }) {
  const [q, setQ] = useState('')
  const [pacientes, setPacientes] = useState<PacienteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [ficha, setFicha] = useState<FichaPaciente | null>(null)
  const [editando, setEditando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)

  const refetch = useCallback(async () => {
    const id = ++seq.current
    const supabase = createClient()
    try {
      const data = await getPacientes(supabase, medicoId, q)
      if (id !== seq.current) return
      setPacientes(data)
      setError(null)
    } catch {
      if (id !== seq.current) return
      setError('No pude cargar los pacientes. Probá de nuevo.')
    }
    if (id !== seq.current) return
    setLoading(false)
  }, [medicoId, q])

  useEffect(() => {
    const t = setTimeout(refetch, 250) // debounce del buscador
    return () => clearTimeout(t)
  }, [refetch])

  async function abrirFicha(id: string) {
    const supabase = createClient()
    try {
      setFicha(await getFicha(supabase, medicoId, id))
    } catch {
      setError('No pude abrir la ficha. Probá de nuevo.')
      return
    }
    setEditando(false)
    setError(null)
  }

  async function guardarEdicion(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!ficha) return
    const fd = new FormData(e.currentTarget)
    const r = await editarPaciente({
      pacienteId: ficha.paciente.id,
      nombre: String(fd.get('nombre') ?? ''),
      apellido: String(fd.get('apellido') ?? ''),
      dni: String(fd.get('dni') ?? ''),
      obraSocial: String(fd.get('obraSocial') ?? ''),
    })
    if ('error' in r && r.error) {
      setError(r.error)
      return
    }
    await abrirFicha(ficha.paciente.id)
    refetch()
  }

  const vinoDe = ficha
    ? ficha.turnos.filter((t) => estadoEfectivoTurno(t, Date.now()) === 'atendido').length
    : 0
  const totalPasados = ficha
    ? ficha.turnos.filter((t) => ['atendido', 'no_vino'].includes(estadoEfectivoTurno(t, Date.now()))).length
    : 0

  const input = 'w-full rounded-lg border border-border bg-[var(--color-background)] px-3 py-2 text-sm'

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h1 className="text-xl font-semibold">Pacientes</h1>
      {error && !editando && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-500/20">
          {error}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[4fr_6fr]">
        <div className="rounded-2xl border border-border overflow-hidden">
          <div className="p-3 border-b border-border/60 flex items-center gap-2">
            <Search className="w-4 h-4 text-[var(--color-muted-foreground)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por apellido, nombre o DNI…"
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin" />
            </div>
          ) : pacientes.length === 0 ? (
            <p className="p-6 text-sm text-center text-[var(--color-muted-foreground)]">
              La base se arma sola con cada turno que entra. Todavía no hay pacientes{q ? ' para esa búsqueda' : ''}.
            </p>
          ) : (
            <div className="divide-y divide-border/50 max-h-[70dvh] overflow-y-auto">
              {pacientes.map((p) => (
                <button
                  key={p.id}
                  onClick={() => abrirFicha(p.id)}
                  className={`w-full text-left px-4 py-2.5 hover:bg-primary/5 transition ${
                    ficha?.paciente.id === p.id ? 'bg-primary/10' : ''
                  }`}
                >
                  <p className="text-sm font-medium">
                    {[p.apellido, p.nombre].filter(Boolean).join(', ') || '(sin nombre)'}
                    <span className="font-normal text-[var(--color-muted-foreground)]"> · DNI {p.dni}</span>
                  </p>
                  <p className="text-xs text-[var(--color-muted-foreground)]">{p.obra_social ?? 'sin OS'}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border p-5">
          {!ficha ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">Elegí un paciente para ver su ficha.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">
                    {[ficha.paciente.apellido, ficha.paciente.nombre].filter(Boolean).join(', ')}
                  </h2>
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    DNI {ficha.paciente.dni} · {ficha.paciente.obra_social ?? 'sin OS'} · 📱{' '}
                    {ficha.paciente.telefonos.join(' / ') || 'sin teléfono'}
                  </p>
                  {totalPasados > 0 && (
                    <span className="inline-block mt-1 text-xs rounded-full border border-emerald-500/40 text-emerald-600 px-2 py-0.5">
                      vino a {vinoDe} de {totalPasados} turnos
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  {ficha.conversacionId && (
                    <Link
                      href={`/conversaciones?id=${ficha.conversacionId}`}
                      className="text-xs flex items-center gap-1 rounded-lg border border-blue-500/40 text-blue-500 px-2 py-1"
                    >
                      <MessageCircle className="w-3 h-3" /> Conversación
                    </Link>
                  )}
                  <button
                    onClick={() => setEditando((v) => !v)}
                    className="text-xs flex items-center gap-1 rounded-lg border border-border px-2 py-1"
                  >
                    <Pencil className="w-3 h-3" /> Corregir datos
                  </button>
                </div>
              </div>

              {editando && (
                <form onSubmit={guardarEdicion} className="rounded-xl border border-border/60 p-3 space-y-2">
                  {error && (
                    <div className="p-2 rounded-lg text-xs bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-500/20">
                      {error}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <input name="nombre" defaultValue={ficha.paciente.nombre ?? ''} placeholder="Nombre" className={input} />
                    <input name="apellido" defaultValue={ficha.paciente.apellido ?? ''} placeholder="Apellido" className={input} />
                  </div>
                  <input name="dni" defaultValue={ficha.paciente.dni} placeholder="DNI" className={input} />
                  <input name="obraSocial" defaultValue={ficha.paciente.obra_social ?? ''} placeholder="Obra social" className={input} />
                  <p className="text-[11px] text-[var(--color-muted-foreground)]">
                    Ojo: cambiar el DNI re-identifica al paciente (es la llave que unifica).
                  </p>
                  <button className="rounded-xl bg-primary text-white px-4 py-2 text-sm font-medium">Guardar</button>
                </form>
              )}

              <div className="rounded-xl border border-border/60 p-3">
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-muted-foreground)] mb-2">
                  Turnos y sobreturnos
                </h3>
                <div className="space-y-1 max-h-56 overflow-y-auto text-sm">
                  {ficha.turnos.map((t) => {
                    const ef = estadoEfectivoTurno(t, Date.now())
                    return (
                      <p key={t.id} className="flex gap-2">
                        <span className="tabular-nums">{new Date(t.starts_at).toLocaleDateString('es-AR')}</span>
                        <span className="text-[var(--color-muted-foreground)] truncate flex-1">{t.notas ?? ''}</span>
                        <span className={ef === 'no_vino' ? 'text-red-500' : ef === 'cancelado' ? 'text-[var(--color-muted-foreground)] line-through' : ef === 'proximo' ? 'text-blue-500' : 'text-emerald-600'}>
                          {ef === 'no_vino' ? '✗ no vino' : ef === 'cancelado' ? 'cancelado' : ef === 'proximo' ? 'próximo' : '✓ atendida'}
                        </span>
                      </p>
                    )
                  })}
                  {ficha.sobreturnos.map((s) => (
                    <p key={s.id} className="flex gap-2">
                      <span className="tabular-nums">{s.fecha.split('-').reverse().join('/')}</span>
                      <span className="text-amber-600 flex-1">SOBRETURNO · {s.cobro === 'sin_cargo' ? 'sin cargo' : 'particular'}</span>
                      <span>{s.estado}</span>
                    </p>
                  ))}
                  {ficha.turnos.length === 0 && ficha.sobreturnos.length === 0 && (
                    <p className="text-[var(--color-muted-foreground)]">Sin movimientos todavía.</p>
                  )}
                </div>
              </div>

              {/* Recetas: SOLO el médico dueño (spec §7). Para la secretaria ni se dibuja
                  (además el RLS de `recetas` ya le devuelve vacío — doble candado). */}
              {puedeVerRecetas && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
                  <h3 className="text-[11px] font-bold uppercase tracking-wide text-amber-600 mb-2">🔒 Recetas (solo lo ve el médico)</h3>
                  <div className="space-y-1 text-sm">
                    {ficha.recetas.map((r) => (
                      <p key={r.id} className="flex gap-2">
                        <span className="tabular-nums">{new Date(r.created_at).toLocaleDateString('es-AR')}</span>
                        <span className="flex-1 truncate">{r.medicamento}</span>
                        <span className="text-[var(--color-muted-foreground)]">
                          {r.estado}
                          {r.monto != null ? ` · $${r.monto.toLocaleString('es-AR')}` : ''}
                        </span>
                      </p>
                    ))}
                    {ficha.recetas.length === 0 && <p className="text-[var(--color-muted-foreground)]">Sin recetas registradas.</p>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

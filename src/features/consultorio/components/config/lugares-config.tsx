'use client'

import { useState } from 'react'
import { Trash2, Pencil } from 'lucide-react'
import { agregarLugarAtencion, editarLugarAtencion, quitarLugarAtencion, type LugarInput } from '@/actions/consultorio-config'
import { formatearLugar, type LugarAtencion } from '@/lib/consultorio/lugaresAtencion'

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const VACIO = { nombre: '', direccion: '', consultorio: '', piso: '', dias: [] as number[] }
const input = 'w-full rounded-lg border border-border bg-[var(--color-background)] px-3 py-2 text-sm'

interface Props {
  lugares: LugarAtencion[]
  onAccion: (fn: () => Promise<{ error?: string } | { ok: true }>) => Promise<boolean>
}

export function LugaresConfig({ lugares, onAccion }: Props) {
  const [form, setForm] = useState<typeof VACIO | null>(null)
  /** id del lugar en edición; null = alta. */
  const [editando, setEditando] = useState<string | null>(null)

  function abrirAlta() {
    setEditando(null)
    setForm({ ...VACIO })
  }

  function abrirEdicion(l: LugarAtencion) {
    setEditando(l.id)
    setForm({
      nombre: l.nombre,
      direccion: l.direccion ?? '',
      consultorio: l.consultorio ?? '',
      piso: l.piso ?? '',
      dias: l.dias,
    })
  }

  async function guardar() {
    if (!form || !form.nombre.trim()) return
    const payload: LugarInput = { ...form }
    const ok = await onAccion(() => (editando ? editarLugarAtencion(editando, payload) : agregarLugarAtencion(payload)))
    if (ok) {
      setForm(null)
      setEditando(null)
    }
  }

  function toggleDia(wd: number) {
    setForm((f) => (f ? { ...f, dias: f.dias.includes(wd) ? f.dias.filter((d) => d !== wd) : [...f.dias, wd] } : f))
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-[var(--color-muted-foreground)]">
        Dónde atendés cada día. El asistente se lo informa al paciente cuando pregunta la dirección o cuando tiene que
        llevar la orden de consulta.
      </p>

      <div className="space-y-1 text-sm">
        {lugares.map((l) => (
          <p key={l.id} className="flex items-center gap-2">
            <span className="min-w-0">{formatearLugar(l)}</span>
            <span className="flex-1" />
            <button onClick={() => abrirEdicion(l)} aria-label={`Editar ${l.nombre}`}>
              <Pencil className="w-3.5 h-3.5 text-[var(--color-muted-foreground)]" />
            </button>
            <button onClick={() => onAccion(() => quitarLugarAtencion(l.id))} aria-label={`Borrar ${l.nombre}`}>
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
            </button>
          </p>
        ))}
        {!lugares.length && (
          <p className="text-[var(--color-muted-foreground)]">Todavía no cargaste ningún lugar de atención.</p>
        )}
      </div>

      {form ? (
        <div className="rounded-xl border border-border p-3 space-y-2">
          <input
            className={input}
            placeholder="Nombre del lugar (ej: Sanatorio Pasteur)"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
          />
          <input
            className={input}
            placeholder="Dirección (opcional, ej: República 764)"
            value={form.direccion}
            onChange={(e) => setForm({ ...form, direccion: e.target.value })}
          />
          <div className="flex gap-2">
            <input
              className={input}
              placeholder="Consultorio (ej: 54)"
              value={form.consultorio}
              onChange={(e) => setForm({ ...form, consultorio: e.target.value })}
            />
            <input
              className={input}
              placeholder="Piso (ej: 1er piso)"
              value={form.piso}
              onChange={(e) => setForm({ ...form, piso: e.target.value })}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DIAS.map((lbl, wd) => (
              <button
                key={wd}
                type="button"
                onClick={() => toggleDia(wd)}
                className={`rounded-lg border px-2.5 py-1 text-xs ${
                  form.dias.includes(wd) ? 'bg-primary text-primary-foreground border-primary' : 'border-border'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={guardar}
              disabled={!form.nombre.trim()}
              className="rounded-xl bg-primary text-primary-foreground px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {editando ? 'Guardar cambios' : 'Agregar lugar'}
            </button>
            <button
              onClick={() => {
                setForm(null)
                setEditando(null)
              }}
              className="rounded-xl border border-border px-3 py-1.5 text-sm"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button onClick={abrirAlta} className="rounded-xl border border-border px-3 py-1.5 text-sm">
          Agregar lugar
        </button>
      )}
    </div>
  )
}

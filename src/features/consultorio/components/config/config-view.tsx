'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Loader2, Trash2, CheckCircle2, XCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { parseMontoArs } from '@/lib/recetas/normalizar'
import { getConfig, type ConfigConsultorio } from '@/features/consultorio/services/panelService'
import {
  guardarDuracionConsulta,
  agregarOsSuspendida,
  quitarOsSuspendida,
  guardarAsistente,
} from '@/actions/consultorio-config'
import { desbloquearDias, bloquearDias } from '@/actions/consultorio-agenda'
import { invitarSecretaria, revocarSecretaria } from '@/actions/consultorio-secretaria'
import { HorariosEditor } from './horarios-editor'

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border p-5 space-y-3">
      <h2 className="font-semibold">{titulo}</h2>
      {children}
    </section>
  )
}

function Campo({ label, ayuda, children }: { label: string; ayuda: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-sm font-medium">{label}</span>
      {children}
      <span className="block text-[11px] text-[var(--color-muted-foreground)]">{ayuda}</span>
    </label>
  )
}

export function ConfigView({ medicoId }: { medicoId: string }) {
  const [cfg, setCfg] = useState<ConfigConsultorio | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [osNueva, setOsNueva] = useState({ nombre: '', nota: '' })
  const [bloqueo, setBloqueo] = useState({ desde: '', hasta: '', nota: '' })
  const [agenteSaving, setAgenteSaving] = useState(false)
  const [agenteOk, setAgenteOk] = useState(false)
  const [emailSec, setEmailSec] = useState('')

  const refetch = useCallback(async () => {
    const supabase = createClient()
    try {
      setCfg(await getConfig(supabase, medicoId))
    } catch {
      setError('No pude cargar la configuración. Recargá la página.')
    }
  }, [medicoId])

  useEffect(() => {
    refetch()
  }, [refetch])

  async function onAccion(fn: () => Promise<{ error?: string } | { ok: true }>): Promise<boolean> {
    const r = await fn()
    const fallo = 'error' in r && !!r.error
    setError(fallo ? (r as { error: string }).error : null)
    refetch()
    return !fallo
  }

  async function guardarAgente(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (agenteSaving) return
    setAgenteSaving(true)
    setAgenteOk(false)
    const fd = new FormData(e.currentTarget)
    const precio = String(fd.get('precio_receta') ?? '').trim()
    const ok = await onAccion(() =>
      guardarAsistente({
        nombre_medico: String(fd.get('nombre_medico') ?? ''),
        especialidad: String(fd.get('especialidad') ?? ''),
        tono: String(fd.get('tono') ?? ''),
        saludo: String(fd.get('saludo') ?? ''),
        faqs: cfg?.agente?.faqs ?? [], // edición de FAQs: v2 del panel — hoy se preservan
        precio_receta: precio ? parseMontoArs(precio) : null,
      }),
    )
    setAgenteSaving(false)
    setAgenteOk(ok)
    if (ok) setTimeout(() => setAgenteOk(false), 3000)
  }

  if (!cfg)
    return error ? (
      <div className="p-4 md:p-6 max-w-3xl">
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-500/20">{error}</div>
      </div>
    ) : (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin" />
      </div>
    )

  const input = 'w-full rounded-lg border border-border bg-[var(--color-background)] px-3 py-2 text-sm'

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl">
      <h1 className="text-xl font-semibold">Asistente de turnos</h1>
      {error && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-500/20">
          {error}
        </div>
      )}

      <Seccion titulo="Horarios de atención">
        <HorariosEditor inicial={cfg.horarios} onSaved={refetch} />
      </Seccion>

      <Seccion titulo="Duración de la consulta">
        {cfg.servicioId ? (
          <div className="flex items-center gap-2 text-sm">
            Turno cada
            <select
              defaultValue={cfg.duracionMin}
              onChange={(e) =>
                cfg.servicioId && onAccion(() => guardarDuracionConsulta(cfg.servicioId!, Number(e.target.value)))
              }
              className="rounded-lg border border-border bg-[var(--color-background)] px-2 py-1"
            >
              {[10, 15, 20, 30, 40, 60].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
            <span className="text-[var(--color-muted-foreground)]">— afecta solo turnos futuros</span>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-muted-foreground)]">Todavía no hay un servicio de consulta configurado — se crea con el alta del consultorio (seed).</p>
        )}
      </Seccion>

      <Seccion titulo="Días bloqueados">
        <div className="space-y-1 text-sm">
          {cfg.excepciones.map((ex) => (
            <p key={ex.id} className="flex items-center gap-2">
              <span className="tabular-nums">
                {ex.start_date === ex.end_date ? ex.start_date : `${ex.start_date} → ${ex.end_date}`}
              </span>
              <span className="text-[var(--color-muted-foreground)] flex-1">{ex.note ?? ''}</span>
              <button onClick={() => onAccion(() => desbloquearDias(ex.id))}>
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
              </button>
            </p>
          ))}
          {cfg.excepciones.length === 0 && (
            <p className="text-[var(--color-muted-foreground)]">Sin bloqueos próximos.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 items-center text-sm">
          <input
            type="date"
            className={input + ' !w-auto'}
            value={bloqueo.desde}
            onChange={(e) => setBloqueo({ ...bloqueo, desde: e.target.value })}
          />
          →
          <input
            type="date"
            className={input + ' !w-auto'}
            value={bloqueo.hasta}
            onChange={(e) => setBloqueo({ ...bloqueo, hasta: e.target.value })}
          />
          <input
            placeholder="Nota (congreso, vacaciones…)"
            className={input + ' !w-44'}
            value={bloqueo.nota}
            onChange={(e) => setBloqueo({ ...bloqueo, nota: e.target.value })}
          />
          <button
            onClick={() =>
              bloqueo.desde &&
              onAccion(() =>
                bloquearDias({ desde: bloqueo.desde, hasta: bloqueo.hasta || bloqueo.desde, nota: bloqueo.nota }),
              )
            }
            className="rounded-xl border border-border px-3 py-1.5"
          >
            Bloquear
          </button>
        </div>
      </Seccion>

      <Seccion titulo="Obras sociales suspendidas">
        <p className="text-[11px] text-[var(--color-muted-foreground)]">
          Fuente provisoria tuya — el día que exista la app del círculo, ellos serán la fuente oficial. El bot avisa
          al reservar (no bloquea).
        </p>
        <div className="space-y-1 text-sm">
          {cfg.osSuspendidas.map((os) => (
            <p key={os.id} className="flex items-center gap-2">
              <span className="font-medium">{os.nombre_os}</span>
              <span className="text-[var(--color-muted-foreground)] flex-1">{os.nota ?? ''}</span>
              <button onClick={() => onAccion(() => quitarOsSuspendida(os.id))}>
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
              </button>
            </p>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            placeholder="OSEP"
            className={input + ' !w-36'}
            value={osNueva.nombre}
            onChange={(e) => setOsNueva({ ...osNueva, nombre: e.target.value })}
          />
          <input
            placeholder="Nota (opcional)"
            className={input}
            value={osNueva.nota}
            onChange={(e) => setOsNueva({ ...osNueva, nota: e.target.value })}
          />
          <button
            onClick={() => {
              if (osNueva.nombre.trim()) {
                onAccion(() => agregarOsSuspendida(osNueva.nombre, osNueva.nota))
                setOsNueva({ nombre: '', nota: '' })
              }
            }}
            className="rounded-xl border border-border px-3"
          >
            Agregar
          </button>
        </div>
      </Seccion>

      <Seccion titulo="El asistente">
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Así se presenta y habla el asistente de WhatsApp con tus pacientes. Lo que cambies acá rige desde el
          próximo mensaje.
        </p>
        <form onSubmit={guardarAgente} className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Campo
              label="Nombre del médico"
              ayuda="Cómo se presenta el asistente: «el consultorio del Dr. Pérez»."
            >
              <input
                name="nombre_medico"
                defaultValue={cfg.agente?.nombre_medico ?? ''}
                placeholder="Dr. Juan Pérez"
                className={input}
              />
            </Campo>
            <Campo label="Especialidad" ayuda="La menciona al presentarse y al dar información del consultorio.">
              <input
                name="especialidad"
                defaultValue={cfg.agente?.especialidad ?? ''}
                placeholder="Clínica médica"
                className={input}
              />
            </Campo>
          </div>
          <Campo label="Tono de las respuestas" ayuda="Cómo les habla a los pacientes en cada mensaje.">
            <input
              name="tono"
              defaultValue={cfg.agente?.tono ?? ''}
              placeholder="cordial, claro y breve"
              className={input}
            />
          </Campo>
          <Campo
            label="Saludo inicial"
            ayuda="Lo primero que dice cuando un paciente escribe. Si lo dejás vacío, usa un saludo estándar."
          >
            <textarea
              name="saludo"
              rows={2}
              defaultValue={cfg.agente?.saludo ?? ''}
              placeholder="¡Hola! Soy el asistente del Dr. Pérez. ¿En qué te puedo ayudar?"
              className={input}
            />
          </Campo>
          <Campo
            label="Precio de la receta"
            ayuda="Monto en pesos que el asistente informa cuando un paciente pide una receta."
          >
            <input
              name="precio_receta"
              defaultValue={cfg.agente?.precio_receta_default ?? ''}
              placeholder="5.000"
              className={input + ' !w-36'}
            />
          </Campo>
          <p className="text-[11px] text-[var(--color-muted-foreground)]">
            Las preguntas frecuentes (FAQs) se editan por ahora con el equipo técnico.
          </p>
          <button
            disabled={agenteSaving}
            className="rounded-xl bg-primary text-white px-4 py-2 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {agenteSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            {agenteSaving ? 'Guardando…' : 'Guardar asistente'}
          </button>
          {agenteOk && <p className="text-sm text-emerald-600 font-medium">Guardado ✓</p>}
        </form>
      </Seccion>

      <Seccion titulo="Conexiones">
        <div className="flex gap-4 text-sm">
          <span className="flex items-center gap-1">
            {cfg.conexiones.whatsapp ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <XCircle className="w-4 h-4 text-red-500" />
            )}
            WhatsApp
          </span>
          <span className="flex items-center gap-1">
            {cfg.conexiones.mercadopago ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <XCircle className="w-4 h-4 text-red-500" />
            )}
            MercadoPago
          </span>
          <span className="flex items-center gap-1 opacity-50">
            <XCircle className="w-4 h-4" /> Google Calendar (llega en 3C)
          </span>
        </div>
      </Seccion>

      <Seccion titulo="Secretaria">
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Invitá a tu secretaria con su email. Solo verá la agenda, las conversaciones y los pacientes —
          nunca tu facturación ni las recetas. Si todavía no tiene cuenta, queda «pendiente» y se activa
          cuando se registre con ese email. <strong>Revocar corta el acceso al instante.</strong>
        </p>
        <div className="space-y-1 text-sm">
          {cfg.secretarias.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <span className="flex-1 truncate">{s.email}</span>
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full border ${
                  s.estado === 'activa'
                    ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                }`}
              >
                {s.estado === 'activa' ? 'activa' : 'pendiente'}
              </span>
              <button
                className="text-xs underline text-red-500"
                onClick={() => {
                  if (window.confirm(`¿Revocar el acceso de ${s.email}? El corte es inmediato.`)) {
                    onAccion(() => revocarSecretaria(s.id))
                  }
                }}
              >
                Revocar
              </button>
            </div>
          ))}
          {cfg.secretarias.length === 0 && (
            <p className="text-[var(--color-muted-foreground)]">Todavía no invitaste a nadie.</p>
          )}
        </div>
        <div className="flex gap-2">
          <input
            type="email"
            placeholder="email@de-tu-secretaria.com"
            className={input}
            value={emailSec}
            onChange={(e) => setEmailSec(e.target.value)}
          />
          <button
            onClick={async () => {
              if (!emailSec.trim()) return
              const ok = await onAccion(() => invitarSecretaria(emailSec))
              if (ok) setEmailSec('')
            }}
            className="rounded-xl border border-border px-4 whitespace-nowrap"
          >
            Invitar
          </button>
        </div>
      </Seccion>
    </div>
  )
}

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
  agregarDiaSemanalParticular,
  agregarFechaParticular,
  quitarDiaParticular,
} from '@/actions/consultorio-config'
import { desbloquearDias, bloquearDias } from '@/actions/consultorio-agenda'
import { invitarSecretaria, revocarSecretaria } from '@/actions/consultorio-secretaria'
import { HorariosEditor } from './horarios-editor'
import { ActividadAsistente } from './actividad-asistente'

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

// Definido a nivel de módulo (no anidado dentro de ConfigView) para no crear un tipo de
// componente nuevo en cada render — eso remontaría los <input> y les haría perder foco al tipear.
function BloqueOs(props: {
  titulo: string
  ayuda: string
  motivo: 'suspendida' | 'no_atiende'
  estado: { nombre: string; nota: string }
  setEstado: (v: { nombre: string; nota: string }) => void
  cfg: ConfigConsultorio
  input: string
  onAccion: (fn: () => Promise<{ error?: string } | { ok: true }>) => Promise<boolean>
}) {
  const items = props.cfg.osSuspendidas.filter((o) => o.motivo === props.motivo)
  return (
    <Seccion titulo={props.titulo}>
      <p className="text-[11px] text-[var(--color-muted-foreground)]">{props.ayuda}</p>
      <div className="space-y-1 text-sm">
        {items.map((os) => (
          <p key={os.id} className="flex items-center gap-2">
            <span className="font-medium">{os.nombre_os}</span>
            <span className="text-[var(--color-muted-foreground)] flex-1">{os.nota ?? ''}</span>
            <button onClick={() => props.onAccion(() => quitarOsSuspendida(os.id))}>
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
            </button>
          </p>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          placeholder="OSEP"
          className={props.input + ' !w-36'}
          value={props.estado.nombre}
          onChange={(e) => props.setEstado({ ...props.estado, nombre: e.target.value })}
        />
        <input
          placeholder="Nota (opcional)"
          className={props.input}
          value={props.estado.nota}
          onChange={(e) => props.setEstado({ ...props.estado, nota: e.target.value })}
        />
        <button
          onClick={() => {
            if (props.estado.nombre.trim()) {
              props.onAccion(() => agregarOsSuspendida(props.estado.nombre, props.estado.nota, props.motivo))
              props.setEstado({ nombre: '', nota: '' })
            }
          }}
          className="rounded-xl border border-border px-3"
        >
          Agregar
        </button>
      </div>
    </Seccion>
  )
}

export function ConfigView({ medicoId }: { medicoId: string }) {
  const [cfg, setCfg] = useState<ConfigConsultorio | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [osSusp, setOsSusp] = useState({ nombre: '', nota: '' })
  const [osNoAt, setOsNoAt] = useState({ nombre: '', nota: '' })
  const [bloqueo, setBloqueo] = useState({ desde: '', hasta: '', nota: '' })
  const [fechaPart, setFechaPart] = useState('')
  const [agenteSaving, setAgenteSaving] = useState(false)
  const [agenteOk, setAgenteOk] = useState(false)
  const [emailSec, setEmailSec] = useState('')
  const [secretariaUrl, setSecretariaUrl] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

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

  // No usa onAccion: necesitamos leer `url` de la rama 'pendiente' de la respuesta,
  // no solo si hubo error (onAccion normaliza todo a boolean).
  async function invitarSecretariaSubmit() {
    const email = emailSec.trim()
    if (!email) return
    const r = await invitarSecretaria(email)
    if ('error' in r) {
      setError(r.error)
    } else {
      setError(null)
      setEmailSec('')
      setSecretariaUrl(r.estado === 'pendiente' ? r.url : null)
    }
    refetch()
  }

  async function copiarEnlace(id: string, url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(id)
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000)
    } catch {
      setError('No se pudo copiar el enlace. Copialo manualmente.')
    }
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

      <Seccion titulo="Días particulares">
        <p className="text-[11px] text-[var(--color-muted-foreground)]">
          Días en que atendés todo particular. El bot le avisa al paciente al reservar (no bloquea).
        </p>
        {/* Recurrentes por día de la semana */}
        <div className="flex flex-wrap gap-1.5">
          {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((lbl, wd) => {
            const fila = cfg.diasParticulares.find((d) => d.tipo === 'semanal' && d.dia_semana === wd)
            const activo = !!fila
            return (
              <button
                key={wd}
                onClick={() =>
                  onAccion(() => (activo ? quitarDiaParticular(fila!.id) : agregarDiaSemanalParticular(wd)))
                }
                className={`rounded-lg border px-2.5 py-1 text-xs ${
                  activo ? 'bg-primary text-primary-foreground border-primary' : 'border-border'
                }`}
              >
                {lbl}
              </button>
            )
          })}
        </div>
        {/* Fechas puntuales */}
        <div className="space-y-1 text-sm">
          {cfg.diasParticulares
            .filter((d) => d.tipo === 'fecha')
            .map((d) => (
              <p key={d.id} className="flex items-center gap-2">
                <span className="tabular-nums">{d.fecha}</span>
                <span className="flex-1" />
                <button onClick={() => onAccion(() => quitarDiaParticular(d.id))}>
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </button>
              </p>
            ))}
        </div>
        <div className="flex flex-wrap gap-2 items-center text-sm">
          <input
            type="date"
            className={input + ' !w-auto'}
            value={fechaPart}
            onChange={(e) => setFechaPart(e.target.value)}
          />
          <button
            onClick={() => {
              if (fechaPart) {
                onAccion(() => agregarFechaParticular(fechaPart))
                setFechaPart('')
              }
            }}
            className="rounded-xl border border-border px-3 py-1.5"
          >
            Agregar fecha
          </button>
        </div>
      </Seccion>

      <BloqueOs
        titulo="Suspendidas por el Círculo (este mes)"
        ayuda="Las que el Círculo suspendió temporalmente. El bot avisa que es particular (no bloquea)."
        motivo="suspendida"
        estado={osSusp}
        setEstado={setOsSusp}
        cfg={cfg}
        input={input}
        onAccion={onAccion}
      />
      <BloqueOs
        titulo="Obras sociales que no atiendo"
        ayuda="Las que decidiste no tomar. El bot las trata igual: avisa que es particular."
        motivo="no_atiende"
        estado={osNoAt}
        setEstado={setOsNoAt}
        cfg={cfg}
        input={input}
        onAccion={onAccion}
      />

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
              {s.estado === 'pendiente' && s.url && (
                <button className="text-xs underline" onClick={() => copiarEnlace(s.id, s.url as string)}>
                  {copiedId === s.id ? '¡Copiado!' : 'Copiar enlace'}
                </button>
              )}
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
          <button onClick={invitarSecretariaSubmit} className="rounded-xl border border-border px-4 whitespace-nowrap">
            Invitar
          </button>
        </div>
        {secretariaUrl && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-sm break-all">
              <a href={secretariaUrl} className="text-primary underline">
                {secretariaUrl}
              </a>
            </p>
            <button
              onClick={() => copiarEnlace('nueva', secretariaUrl)}
              className="rounded-lg border border-border px-3 py-1 text-xs"
            >
              {copiedId === 'nueva' ? '¡Copiado!' : 'Copiar enlace'}
            </button>
            <p className="text-[11px] text-[var(--color-muted-foreground)]">
              Mandale este enlace a tu secretaria por WhatsApp. Vence en 72 hs.
            </p>
          </div>
        )}
      </Seccion>

      <Seccion titulo="Actividad del asistente">
        <ActividadAsistente medicoId={medicoId} />
      </Seccion>
    </div>
  )
}

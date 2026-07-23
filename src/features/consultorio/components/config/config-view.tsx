'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Loader2, Trash2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { ConfirmDialog } from '@/shared/components/ui'
import { parseMontoArs } from '@/lib/recetas/normalizar'
import { normalizarWhatsappAr, nacionalDeWhatsappAr } from '@/lib/whatsapp/numeroAr'
import { WhatsappInput } from '@/shared/components/WhatsappInput'
import {
  guardarDuracionConsulta,
  agregarOsSuspendida,
  quitarOsSuspendida,
  guardarAsistente,
  guardarPrecioReceta,
  guardarMontoPlus,
  agregarDiaSemanalParticular,
  agregarFechaParticular,
  quitarDiaParticular,
  desconectarMercadoPago,
  guardarNumeroWhatsapp,
  cargarConfigConsultorio,
  type ConfigVista,
} from '@/actions/consultorio-config'
import { desbloquearDias, bloquearDias } from '@/actions/consultorio-agenda'
import { invitarSecretaria, revocarSecretaria } from '@/actions/consultorio-secretaria'
import { getCatalogoOs } from '@/actions/catalogo'
import { OsAutocomplete } from '@/features/catalogo/components/OsAutocomplete'
import type { OsCatalogoItem } from '@/lib/catalogo/obras-sociales'
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

/** Fila de la sección Conexiones: las tres se ven igual (nombre + ayuda | estado + acción). */
function FilaConexion(props: {
  icono: React.ReactNode
  nombre: string
  ayuda?: string
  estado: string
  accion?: React.ReactNode
  atenuada?: boolean
}) {
  return (
    <div className={'flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3 p-3' + (props.atenuada ? ' opacity-50' : '')}>
      <div className="space-y-0.5 min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          {props.icono}
          {props.nombre}
        </p>
        {props.ayuda && <p className="text-[11px] text-[var(--color-muted-foreground)]">{props.ayuda}</p>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-[var(--color-muted-foreground)]">{props.estado}</span>
        {props.accion}
      </div>
    </div>
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
  cfg: ConfigVista
  catalogo: OsCatalogoItem[]
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
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Autocomplete contra el catálogo canónico (aranceles_os) en vez de texto libre:
            el médico elige una OS real → el nombre normalizado que se guarda matchea el del
            paciente. La `key` remonta el autocomplete tras agregar/quitar para limpiar su input. */}
        <div className="w-full sm:w-44 sm:shrink-0">
          <OsAutocomplete
            key={`${props.motivo}-${items.length}`}
            catalogo={props.catalogo}
            valor={props.estado.nombre}
            onSelect={(sel) => props.setEstado({ ...props.estado, nombre: sel.nombre_os })}
            inputClassName={props.input}
          />
        </div>
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

export function ConfigView({ esDueño }: { esDueño: boolean }) {
  const [cfg, setCfg] = useState<ConfigVista | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [osSusp, setOsSusp] = useState({ nombre: '', nota: '' })
  const [osNoAt, setOsNoAt] = useState({ nombre: '', nota: '' })
  const [bloqueo, setBloqueo] = useState({ desde: '', hasta: '', nota: '' })
  const [fechaPart, setFechaPart] = useState('')
  const [agenteSaving, setAgenteSaving] = useState(false)
  const [agenteOk, setAgenteOk] = useState(false)
  const [precioOk, setPrecioOk] = useState(false)
  const [plusOk, setPlusOk] = useState(false)
  const [emailSec, setEmailSec] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [catalogoOs, setCatalogoOs] = useState<OsCatalogoItem[]>([])
  const [mpAviso, setMpAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [editandoWa, setEditandoWa] = useState(false)
  // Aviso local del cambio de número, igual que mpAviso: el banner de `error` vive al tope de
  // la página y Conexiones está fuera de pantalla, así que ahí el mensaje se pierde.
  const [waAviso, setWaAviso] = useState<string | null>(null)
  // Confirmación de acciones destructivas (in-app, no window.confirm).
  const [confirmar, setConfirmar] = useState<{
    titulo: string
    mensaje: string
    confirmLabel: string
    /** Default true: las que la usan son destructivas. El cambio de número no lo es. */
    peligroso?: boolean
    accion: () => Promise<{ error?: string } | { ok: true }>
  } | null>(null)

  useEffect(() => {
    getCatalogoOs().then(setCatalogoOs).catch(() => {})
  }, [])

  // Resultado de la vuelta del OAuth de MercadoPago (?mp=ok | ?mp=error&motivo=…).
  // Se lee de la URL y se limpia, para que no reaparezca al recargar. Sin useSearchParams:
  // obligaría a envolver la página en un <Suspense>.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const mp = params.get('mp')
    if (!mp) return

    const motivos: Record<string, string> = {
      denegado: 'Cancelaste la conexión con MercadoPago.',
      state: 'El enlace de conexión venció. Probá de nuevo.',
      canje: 'MercadoPago rechazó la conexión. Probá de nuevo en unos minutos.',
      guardado: 'No pude guardar la conexión. Probá de nuevo.',
      config: 'Falta terminar de configurar MercadoPago. Avisale al equipo de MediCuenta.',
      no_dueno: 'Solo el médico titular puede conectar la cuenta de cobro.',
    }
    setMpAviso(
      mp === 'ok'
        ? { ok: true, texto: '¡Listo! Tu cuenta de MercadoPago quedó conectada.' }
        : { ok: false, texto: motivos[params.get('motivo') ?? ''] ?? 'No pude conectar MercadoPago.' },
    )
    window.history.replaceState({}, '', window.location.pathname)
  }, [])

  const refetch = useCallback(async () => {
    try {
      const r = await cargarConfigConsultorio()
      if ('error' in r) { setError('No pude cargar la configuración. Recargá la página.'); return }
      setCfg(r)
    } catch {
      // Un error TIRADO por la server action (red, etc.) — no un { error } manejado.
      setError('No pude cargar la configuración. Recargá la página.')
    }
  }, [])

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

  async function invitarSecretariaSubmit() {
    const email = emailSec.trim()
    if (!email) return
    const r = await invitarSecretaria(email)
    if ('error' in r) setError(r.error)
    else { setError(null); setEmailSec('') }
    // refetch: la nueva invitación aparece en la lista con su enlace persistente (s.url).
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
    const ok = await onAccion(() =>
      guardarAsistente({
        nombre_medico: String(fd.get('nombre_medico') ?? ''),
        especialidad: String(fd.get('especialidad') ?? ''),
        tono: String(fd.get('tono') ?? ''),
        saludo: String(fd.get('saludo') ?? ''),
        faqs: cfg?.agente?.faqs ?? [], // edición de FAQs: v2 del panel — hoy se preservan
      }),
    )
    setAgenteSaving(false)
    setAgenteOk(ok)
    if (ok) setTimeout(() => setAgenteOk(false), 3000)
  }

  /** Cambio del número que el bot usa para reconocer al médico. Normaliza en el cliente para
   *  poder mostrarle el número canónico y que confirme: es la red contra el dedazo (un dígito
   *  mal apunta la ficha a un tercero hasta que el médico nota que el bot dejó de reconocerlo). */
  function cambiarNumeroWa(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const canonico = normalizarWhatsappAr(String(fd.get('numeroWhatsapp') ?? ''))
    if (!canonico) {
      setWaAviso('Número de WhatsApp inválido (ej: 383 4222049)')
      return
    }
    if (canonico === cfg?.conexiones?.whatsapp?.numero) {
      setEditandoWa(false)
      setWaAviso(null)
      return
    }
    setConfirmar({
      titulo: 'Cambiar tu número de WhatsApp',
      mensaje:
        `El asistente va a reconocerte solo desde el +54 ${nacionalDeWhatsappAr(canonico)}, ` +
        'y ahí te van a llegar los avisos de MercadoPago. Revisá que sea correcto.',
      confirmLabel: 'Cambiar número',
      peligroso: false,
      accion: async () => {
        const r = await guardarNumeroWhatsapp(canonico)
        const fallo = 'error' in r && !!r.error
        setWaAviso(fallo ? (r as { error: string }).error : null)
        if (!fallo) setEditandoWa(false)
        // Devolvemos ok aunque haya fallado: el aviso ya se muestra pegado al form (arriba),
        // y onAccion lo repetiría en el banner global, que acá queda fuera de pantalla.
        return { ok: true as const }
      },
    })
  }

  async function guardarPrecio(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const raw = String(fd.get('precio_receta') ?? '').trim()
    const ok = await onAccion(() => guardarPrecioReceta(raw ? parseMontoArs(raw) : null))
    setPrecioOk(ok)
    if (ok) setTimeout(() => setPrecioOk(false), 3000)
  }

  async function guardarPlus(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const raw = String(fd.get('monto_plus') ?? '').trim()
    const ok = await onAccion(() => guardarMontoPlus(raw ? parseMontoArs(raw) : null))
    setPlusOk(ok)
    if (ok) setTimeout(() => setPlusOk(false), 3000)
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
  // null también cuando el que mira es la secretaria: cargarConfigConsultorio no le manda conexiones.
  const mp = cfg.conexiones?.mercadopago ?? null

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
        catalogo={catalogoOs}
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
        catalogo={catalogoOs}
        input={input}
        onAccion={onAccion}
      />

      <Seccion titulo="Precio de la receta">
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Monto que el asistente informa cuando un paciente pide una receta. Dejalo vacío si no cobrás la gestión.
        </p>
        <form onSubmit={guardarPrecio} className="flex items-end gap-2">
          <Campo label="Monto en pesos" ayuda="Ej: 5.000">
            <input name="precio_receta" defaultValue={cfg.precioReceta ?? ''} placeholder="5.000" className={input + ' !w-36'} />
          </Campo>
          <button className="rounded-xl bg-primary text-white px-4 py-2 text-sm font-medium">Guardar precio</button>
        </form>
        {precioOk && <p className="text-sm text-emerald-600 font-medium">Guardado ✓</p>}
      </Seccion>

      <Seccion titulo="Plus de la consulta (cobro al llegar)">
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Cuando el paciente le escribe &quot;llegué&quot; al asistente el día del turno, le cobra este plus con un link
          de MercadoPago (y la consulta particular usa el precio del servicio). Dejalo vacío para que el pago se maneje
          solo en el mostrador. Es estrictamente privado.
        </p>
        <form onSubmit={guardarPlus} className="flex items-end gap-2">
          <Campo label="Monto en pesos" ayuda="Ej: 8.000">
            <input name="monto_plus" defaultValue={cfg.montoPlus ?? ''} placeholder="8.000" className={input + ' !w-36'} />
          </Campo>
          <button className="rounded-xl bg-primary text-white px-4 py-2 text-sm font-medium">Guardar plus</button>
        </form>
        {plusOk && <p className="text-sm text-emerald-600 font-medium">Guardado ✓</p>}
      </Seccion>

      {esDueño && (
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
      )}

      {/* Conexiones = solo el médico dueño (#13). La secretaria ni siquiera recibe los datos:
          cargarConfigConsultorio le manda conexiones: null. */}
      {esDueño && (
        <Seccion titulo="Conexiones">
        {mpAviso && (
          <p className={`text-sm font-medium ${mpAviso.ok ? 'text-emerald-600' : 'text-red-500'}`}>
            {mpAviso.texto}
          </p>
        )}

        <div className="rounded-xl border border-border divide-y divide-border">
          {/* El estado sale de la ficha que usa el ruteo del bot (wa_asignaciones, con fallback
              legacy a wa_canales). "Sin activar" = el cableado no quedó hecho: el médico no
              puede resolverlo solo, así que la ayuda le dice a quién escribirle en vez de
              ofrecerle un botón que no haría nada. */}
          {cfg.conexiones?.whatsapp ? (
            <FilaConexion
              icono={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
              nombre="WhatsApp"
              ayuda={`Tu asistente te reconoce cuando le escribís desde el +54 ${nacionalDeWhatsappAr(cfg.conexiones.whatsapp.numero)}. Si cambiaste de celular, actualizalo acá.`}
              estado="conectado"
              accion={
                !editandoWa && (
                  <button
                    onClick={() => { setEditandoWa(true); setWaAviso(null) }}
                    className="text-sm font-medium text-primary whitespace-nowrap"
                  >
                    Cambiar número
                  </button>
                )
              }
            />
          ) : (
            <FilaConexion
              icono={<XCircle className="w-4 h-4 text-red-500" />}
              nombre="WhatsApp"
              ayuda="Todavía no activamos tu asistente. Escribinos y lo dejamos andando."
              estado="sin activar"
            />
          )}

          {editandoWa && cfg.conexiones?.whatsapp && (
            <form onSubmit={cambiarNumeroWa} className="p-3 space-y-2">
              <WhatsappInput defaultValue={cfg.conexiones.whatsapp.numero} required />
              {waAviso && <p className="text-sm font-medium text-red-500">{waAviso}</p>}
              <div className="flex gap-2">
                <button type="submit" className="rounded-xl bg-primary text-white px-4 py-2 text-sm font-medium">
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => { setEditandoWa(false); setWaAviso(null) }}
                  className="rounded-xl border border-border px-4 py-2 text-sm font-medium"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {mp === null && (
            <FilaConexion
              icono={<XCircle className="w-4 h-4 text-red-500" />}
              nombre="MercadoPago"
              ayuda="Conectá tu cuenta para que el asistente pueda cobrar las recetas. El dinero entra directo a tu cuenta: MediCuenta no toca la plata."
              estado="sin conectar"
              accion={
                <a
                  href="/api/mercadopago/oauth"
                  className="inline-flex rounded-xl bg-primary text-white px-4 py-2 text-sm font-medium"
                >
                  Conectar
                </a>
              }
            />
          )}

          {mp?.estado === 'conectado' && (
            <FilaConexion
              icono={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
              nombre="MercadoPago"
              ayuda="Los pagos de las recetas entran a tu cuenta."
              estado="conectado"
              accion={
                <button
                  onClick={() =>
                    setConfirmar({
                      titulo: 'Desconectar MercadoPago',
                      mensaje:
                        'El asistente va a dejar de cobrar las recetas hasta que vuelvas a conectar tu cuenta. Podés reconectarla cuando quieras.',
                      confirmLabel: 'Desconectar',
                      accion: desconectarMercadoPago,
                    })
                  }
                  className="text-sm font-medium text-red-500"
                >
                  Desconectar
                </button>
              }
            />
          )}

          {mp?.estado === 'reconectar' && (
            <FilaConexion
              icono={<AlertTriangle className="w-4 h-4 text-amber-500" />}
              nombre="MercadoPago"
              ayuda="Se venció el permiso de tu cuenta y el cobro de recetas está pausado. Reconectá para que el asistente vuelva a cobrar."
              estado="hay que reconectar"
              accion={
                <a
                  href="/api/mercadopago/oauth"
                  className="inline-flex rounded-xl bg-primary text-white px-4 py-2 text-sm font-medium"
                >
                  Reconectar
                </a>
              }
            />
          )}

          <FilaConexion
            icono={<XCircle className="w-4 h-4" />}
            nombre="Google Calendar"
            estado="llega en 3C"
            atenuada
          />
        </div>
        </Seccion>
      )}

      {esDueño && (
        <Seccion titulo="Secretaria">
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Invitá a tu secretaria con su email. Solo verá la agenda, las conversaciones y los pacientes —
          nunca tu facturación ni las recetas. Si todavía no tiene cuenta, queda «pendiente» y se activa
          cuando se registre con ese email. <strong>Revocar corta el acceso al instante.</strong>
        </p>
        <div className="space-y-2 text-sm">
          {(cfg.secretarias ?? []).map((s) => (
            <div key={s.id} className="space-y-1.5">
              <div className="flex items-center gap-2">
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
                  onClick={() =>
                    setConfirmar({
                      titulo: 'Revocar acceso',
                      mensaje: `${s.email} va a perder el acceso al consultorio de inmediato.`,
                      confirmLabel: 'Revocar',
                      accion: () => revocarSecretaria(s.id),
                    })
                  }
                >
                  Revocar
                </button>
              </div>
              {/* Enlace persistente de la invitación pendiente: sobrevive al recargar (viene de
                  s.url en getConfig), así la médica lo re-copia cuando quiera. */}
              {s.estado === 'pendiente' && s.url && (
                <div className="space-y-2 rounded-lg border border-border p-3">
                  <p className="break-all">
                    <a href={s.url} className="text-primary underline">{s.url}</a>
                  </p>
                  <button
                    onClick={() => copiarEnlace(s.id, s.url as string)}
                    className="rounded-lg border border-border px-3 py-1 text-xs"
                  >
                    {copiedId === s.id ? '¡Copiado!' : 'Copiar enlace'}
                  </button>
                  <p className="text-[11px] text-[var(--color-muted-foreground)]">
                    Mandale este enlace a tu secretaria por WhatsApp. Vence en 72 hs.
                  </p>
                </div>
              )}
            </div>
          ))}
          {(cfg.secretarias ?? []).length === 0 && (
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
        </Seccion>
      )}

      <Seccion titulo="Actividad del asistente">
        <ActividadAsistente medicoId={cfg.medicoId} />
      </Seccion>

      {confirmar && (
        <ConfirmDialog
          titulo={confirmar.titulo}
          mensaje={confirmar.mensaje}
          confirmLabel={confirmar.confirmLabel}
          peligroso={confirmar.peligroso ?? true}
          onCancel={() => setConfirmar(null)}
          onConfirm={() => {
            const accion = confirmar.accion
            setConfirmar(null)
            onAccion(accion)
          }}
        />
      )}
    </div>
  )
}

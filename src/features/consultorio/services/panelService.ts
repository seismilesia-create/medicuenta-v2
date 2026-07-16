import type { SupabaseClient } from '@supabase/supabase-js'
import { arDateString, AR_OFFSET, weekdayOf } from '@/lib/turnos/slots'
import { addDias, diasDesdeHoy, gridMes, minutosAR, minutosDeHora } from '@/lib/consultorio/calendario'
import { getServiciosActivos, getDisponibilidad } from '@/features/whatsapp/services/turnosService'
import { armarDia, type ItemDia, type TurnoDia, type SlotLibre } from '@/lib/consultorio/armarDia'
import { semaforoConversacion, msRestantesVentana, type Semaforo } from '@/lib/consultorio/semaforo'
import { esDiaParticular, type DiaParticular } from '@/lib/consultorio/diasParticulares'
import { siteUrl } from '@/lib/site-url'

/** supabase-js devuelve errores en vez de lanzarlos: acá los convertimos en throw
 *  para que las pantallas muestren su banner de error en vez de un vacío convincente. */
function ok<T extends { data: unknown; error: { message: string } | null }>(res: T): T {
  if (res.error) throw new Error(res.error.message)
  return res
}

// ── Agenda ────────────────────────────────────────────────────────────────────

export interface SobreturnoRow {
  id: string
  fecha: string
  paciente_nombre: string
  paciente_apellido: string
  paciente_dni: string | null
  paciente_obra_social: string | null
  cobro: 'particular' | 'sin_cargo'
  estado: string
  notas: string | null
}

const COLS_TURNO =
  'id, starts_at, ends_at, estado, paciente_nombre, paciente_apellido, paciente_dni, paciente_obra_social, paciente_telefono, notas, origen'

export interface JornadaDia {
  desdeMin: number // minutos desde medianoche AR
  hastaMin: number
}

/** Rango del timeline: min(open)–max(close) de los bloques, extendido por turnos fuera de horario. */
function calcularJornada(
  bloques: { open_time: string; close_time: string }[],
  turnos: TurnoDia[],
): JornadaDia | null {
  let desde = Infinity
  let hasta = -Infinity
  for (const b of bloques) {
    desde = Math.min(desde, minutosDeHora(b.open_time))
    hasta = Math.max(hasta, minutosDeHora(b.close_time))
  }
  for (const t of turnos) {
    if (t.estado === 'cancelado') continue
    desde = Math.min(desde, minutosAR(t.starts_at))
    hasta = Math.max(hasta, minutosAR(t.ends_at))
  }
  if (!Number.isFinite(desde)) return null
  return { desdeMin: desde, hastaMin: Math.max(hasta, desde + 60) }
}

export interface DiaAgenda {
  items: ItemDia[]
  sobreturnos: SobreturnoRow[]
  /** Sin horario de atención ese día de la semana (estructural, NO derivado de la
   *  disponibilidad: el pasado y el horizonte lejano no tienen slots pero no están "cerrados"). */
  cerrado: boolean
  /** Excepción (vacaciones/congreso) que cubre la fecha, si existe. */
  bloqueado: { id: string; nota: string | null } | null
  /** Día particular (config del médico: por fecha puntual o por día de semana recurrente). */
  particular: boolean
  jornada: JornadaDia | null
  duracionMin: number
}

/** El día completo: turnos (todas las identidades) + huecos libres + sobreturnos. */
export async function getDia(db: SupabaseClient, medicoId: string, fecha: string): Promise<DiaAgenda> {
  const desdeIso = new Date(`${fecha}T00:00:00${AR_OFFSET}`).toISOString()
  const hastaIso = new Date(new Date(desdeIso).getTime() + 86_400_000).toISOString()
  const [turnosRes, sobresRes, horariosRes, excepcionRes, diasPartRes, servicios] = await Promise.all([
    db
      .from('wa_turnos')
      .select(COLS_TURNO)
      .eq('medico_id', medicoId)
      .gte('starts_at', desdeIso)
      .lt('starts_at', hastaIso)
      .order('starts_at')
      .then(ok),
    db
      .from('wa_sobreturnos')
      .select('id, fecha, paciente_nombre, paciente_apellido, paciente_dni, paciente_obra_social, cobro, estado, notas')
      .eq('medico_id', medicoId)
      .eq('fecha', fecha)
      .neq('estado', 'cancelado')
      .order('created_at')
      .then(ok),
    db
      .from('wa_horarios')
      .select('open_time, close_time')
      .eq('medico_id', medicoId)
      .eq('weekday', weekdayOf(fecha))
      .then(ok),
    db
      .from('wa_excepciones')
      .select('id, note')
      .eq('medico_id', medicoId)
      .lte('start_date', fecha)
      .gte('end_date', fecha)
      .limit(1)
      .maybeSingle()
      .then(ok),
    db
      .from('wa_dias_particulares')
      .select('tipo, dia_semana, fecha')
      .eq('medico_id', medicoId)
      .then(ok),
    getServiciosActivos(db, medicoId),
  ])
  const turnos = (turnosRes.data as TurnoDia[] | null) ?? []
  const bloquesDia = (horariosRes.data as { open_time: string; close_time: string }[] | null) ?? []
  const excepcion = excepcionRes.data as { id: string; note: string | null } | null
  const diasParticulares = (diasPartRes.data as DiaParticular[] | null) ?? []
  // Huecos libres SOLO del día pedido (getDisponibilidad ya excluye pasados y ocupados).
  let libres: SlotLibre[] = []
  if (servicios.length > 0) {
    const horizonte = Math.min(Math.max(diasDesdeHoy(fecha) + 1, 1), 90)
    const dias = await getDisponibilidad(db, medicoId, servicios[0], horizonte)
    libres = dias.find((d) => d.date === fecha)?.slots ?? []
  }
  return {
    items: armarDia(turnos, libres, Date.now()),
    sobreturnos: (sobresRes.data as SobreturnoRow[] | null) ?? [],
    cerrado: bloquesDia.length === 0,
    bloqueado: excepcion ? { id: excepcion.id, nota: excepcion.note } : null,
    particular: esDiaParticular(diasParticulares, fecha),
    jornada: calcularJornada(bloquesDia, turnos),
    duracionMin: servicios[0]?.duracion_min ?? 30,
  }
}

export interface DiaAgendaSemana {
  fecha: string
  items: ItemDia[]
  sobreturnos: number
  bloqueado: boolean
  particular: boolean
  cerrado: boolean // sin horario de atención ese día de la semana
}

export interface AgendaSemana {
  dias: DiaAgendaSemana[]
  jornada: JornadaDia | null // escala compartida del timeline de la semana
  duracionMin: number
}

/** La semana L→D completa para la vista grilla: turnos + huecos + contadores por día. */
export async function getAgendaSemana(db: SupabaseClient, medicoId: string, lunes: string): Promise<AgendaSemana> {
  const domingo = addDias(lunes, 6)
  const desdeIso = new Date(`${lunes}T00:00:00${AR_OFFSET}`).toISOString()
  const hastaIso = new Date(`${addDias(lunes, 7)}T00:00:00${AR_OFFSET}`).toISOString()
  const [turnosRes, sobresRes, horariosRes, excepcionesRes, diasPartRes, servicios] = await Promise.all([
    db
      .from('wa_turnos')
      .select(COLS_TURNO)
      .eq('medico_id', medicoId)
      .gte('starts_at', desdeIso)
      .lt('starts_at', hastaIso)
      .order('starts_at')
      .then(ok),
    db
      .from('wa_sobreturnos')
      .select('fecha')
      .eq('medico_id', medicoId)
      .gte('fecha', lunes)
      .lte('fecha', domingo)
      .neq('estado', 'cancelado')
      .then(ok),
    db.from('wa_horarios').select('weekday, open_time, close_time').eq('medico_id', medicoId).then(ok),
    db
      .from('wa_excepciones')
      .select('start_date, end_date')
      .eq('medico_id', medicoId)
      .lte('start_date', domingo)
      .gte('end_date', lunes)
      .then(ok),
    db
      .from('wa_dias_particulares')
      .select('tipo, dia_semana, fecha')
      .eq('medico_id', medicoId)
      .then(ok),
    getServiciosActivos(db, medicoId),
  ])
  const turnos = (turnosRes.data as TurnoDia[] | null) ?? []
  const sobres = (sobresRes.data as { fecha: string }[] | null) ?? []
  const horarios = (horariosRes.data as { weekday: number; open_time: string; close_time: string }[] | null) ?? []
  const excepciones = (excepcionesRes.data as { start_date: string; end_date: string }[] | null) ?? []
  const diasParticulares = (diasPartRes.data as DiaParticular[] | null) ?? []

  // Huecos ofrecibles: UNA llamada con horizonte hasta el domingo visible (cap 90 días).
  const libresPorFecha = new Map<string, SlotLibre[]>()
  const horizonte = diasDesdeHoy(domingo)
  if (servicios.length > 0 && horizonte >= 0) {
    const dias = await getDisponibilidad(db, medicoId, servicios[0], Math.min(horizonte + 1, 90))
    for (const d of dias) if (d.date >= lunes && d.date <= domingo) libresPorFecha.set(d.date, d.slots)
  }

  const weekdaysConHorario = new Set(horarios.map((h) => h.weekday))
  const nowMs = Date.now()
  const dias: DiaAgendaSemana[] = []
  for (let i = 0; i < 7; i++) {
    const fecha = addDias(lunes, i)
    const turnosDia = turnos.filter((t) => arDateString(new Date(t.starts_at).getTime(), 0) === fecha)
    dias.push({
      fecha,
      items: armarDia(turnosDia, libresPorFecha.get(fecha) ?? [], nowMs),
      sobreturnos: sobres.filter((s) => s.fecha === fecha).length,
      bloqueado: excepciones.some((ex) => ex.start_date <= fecha && fecha <= ex.end_date),
      particular: esDiaParticular(diasParticulares, fecha),
      cerrado: !weekdaysConHorario.has(weekdayOf(fecha)),
    })
  }
  return {
    dias,
    jornada: calcularJornada(horarios, turnos),
    duracionMin: servicios[0]?.duracion_min ?? 30,
  }
}

export interface DiaMesContador {
  fecha: string
  turnos: number
  sobreturnos: number
  bloqueado: boolean
  particular: boolean
}

/** Contadores por día para la grilla mensual (incluye el relleno de meses vecinos). */
export async function getMesContadores(
  db: SupabaseClient,
  medicoId: string,
  anio: number,
  mes: number,
): Promise<DiaMesContador[]> {
  const grid = gridMes(anio, mes)
  const primera = grid[0][0]
  const ultima = grid[grid.length - 1][6]
  const desdeIso = new Date(`${primera}T00:00:00${AR_OFFSET}`).toISOString()
  const hastaIso = new Date(`${addDias(ultima, 1)}T00:00:00${AR_OFFSET}`).toISOString()
  const [turnosRes, sobresRes, excepcionesRes, diasPartRes] = await Promise.all([
    db
      .from('wa_turnos')
      .select('starts_at')
      .eq('medico_id', medicoId)
      .neq('estado', 'cancelado')
      .gte('starts_at', desdeIso)
      .lt('starts_at', hastaIso)
      .then(ok),
    db
      .from('wa_sobreturnos')
      .select('fecha')
      .eq('medico_id', medicoId)
      .gte('fecha', primera)
      .lte('fecha', ultima)
      .neq('estado', 'cancelado')
      .then(ok),
    db
      .from('wa_excepciones')
      .select('start_date, end_date')
      .eq('medico_id', medicoId)
      .lte('start_date', ultima)
      .gte('end_date', primera)
      .then(ok),
    db
      .from('wa_dias_particulares')
      .select('tipo, dia_semana, fecha')
      .eq('medico_id', medicoId)
      .then(ok),
  ])
  const turnos = ((turnosRes.data as { starts_at: string }[] | null) ?? []).map((t) =>
    arDateString(new Date(t.starts_at).getTime(), 0),
  )
  const sobres = (sobresRes.data as { fecha: string }[] | null) ?? []
  const excepciones = (excepcionesRes.data as { start_date: string; end_date: string }[] | null) ?? []
  const diasParticulares = (diasPartRes.data as DiaParticular[] | null) ?? []
  return grid.flat().map((fecha) => ({
    fecha,
    turnos: turnos.filter((f) => f === fecha).length,
    sobreturnos: sobres.filter((s) => s.fecha === fecha).length,
    bloqueado: excepciones.some((ex) => ex.start_date <= fecha && fecha <= ex.end_date),
    particular: esDiaParticular(diasParticulares, fecha),
  }))
}

// ── Conversaciones ────────────────────────────────────────────────────────────

export interface ConversacionItem {
  id: string
  contactoNombre: string | null
  contactoTelefono: string
  semaforo: Semaforo
  botPausado: boolean
  ultimoMensaje: string
  lastMessageAt: string
  msVentana: number
}

export async function getBandeja(db: SupabaseClient, medicoId: string): Promise<ConversacionItem[]> {
  const { data: convs } = ok(await db
    .from('wa_conversaciones')
    .select('id, bot_pausado, necesita_humano, last_message_at, last_paciente_at, contacto:wa_contactos(nombre, telefono)')
    .eq('medico_id', medicoId)
    .eq('es_medico', false)
    .order('last_message_at', { ascending: false })
    .limit(50))
  const rows =
    (convs as unknown as
      | {
          id: string
          bot_pausado: boolean
          necesita_humano: boolean
          last_message_at: string
          last_paciente_at: string | null
          contacto: { nombre: string | null; telefono: string } | { nombre: string | null; telefono: string }[] | null
        }[]
      | null) ?? []
  if (rows.length === 0) return []
  // Preview del último mensaje de cada conversación en UNA query.
  const { data: msgs } = ok(await db
    .from('wa_mensajes')
    .select('conversacion_id, contenido, created_at')
    .eq('medico_id', medicoId)
    .in('conversacion_id', rows.map((r) => r.id))
    .order('created_at', { ascending: false })
    .limit(300))
  const preview = new Map<string, string>()
  for (const m of (msgs as { conversacion_id: string; contenido: string }[] | null) ?? []) {
    if (!preview.has(m.conversacion_id)) preview.set(m.conversacion_id, m.contenido)
  }
  const now = Date.now()
  const items = rows.map((r) => {
    const contacto = Array.isArray(r.contacto) ? r.contacto[0] : r.contacto
    return {
      id: r.id,
      contactoNombre: contacto?.nombre ?? null,
      contactoTelefono: contacto?.telefono ?? '',
      semaforo: semaforoConversacion(r, now),
      botPausado: r.bot_pausado,
      ultimoMensaje: preview.get(r.id) ?? '',
      lastMessageAt: r.last_message_at,
      msVentana: msRestantesVentana(r.last_paciente_at, now),
    }
  })
  // Las que necesitan atención SIEMPRE arriba (spec D13).
  return items.sort((a, b) => (a.semaforo === 'alerta' ? -1 : 0) - (b.semaforo === 'alerta' ? -1 : 0))
}

export interface MensajeHilo {
  id: string
  direccion: 'entrante' | 'saliente'
  origen: 'ia' | 'humano' | 'paciente' | 'medico'
  contenido: string
  created_at: string
}

export interface Hilo {
  conversacionId: string
  contactoNombre: string | null
  contactoTelefono: string
  botPausado: boolean
  necesitaHumano: boolean
  msVentana: number
  mensajes: MensajeHilo[]
}

export async function getHilo(db: SupabaseClient, medicoId: string, conversacionId: string): Promise<Hilo | null> {
  const [convRes, msgsRes] = await Promise.all([
    db
      .from('wa_conversaciones')
      .select('id, bot_pausado, necesita_humano, last_paciente_at, contacto:wa_contactos(nombre, telefono)')
      .eq('medico_id', medicoId)
      .eq('id', conversacionId)
      .maybeSingle()
      .then(ok),
    db
      .from('wa_mensajes')
      .select('id, direccion, origen, contenido, created_at')
      .eq('medico_id', medicoId)
      .eq('conversacion_id', conversacionId)
      .order('created_at', { ascending: false })
      .limit(200)
      .then(ok),
  ])
  if (!convRes.data) return null
  const c = convRes.data as unknown as {
    id: string
    bot_pausado: boolean
    necesita_humano: boolean
    last_paciente_at: string | null
    contacto: { nombre: string | null; telefono: string } | { nombre: string | null; telefono: string }[] | null
  }
  const contacto = Array.isArray(c.contacto) ? c.contacto[0] : c.contacto
  return {
    conversacionId: c.id,
    contactoNombre: contacto?.nombre ?? null,
    contactoTelefono: contacto?.telefono ?? '',
    botPausado: c.bot_pausado,
    necesitaHumano: c.necesita_humano,
    msVentana: msRestantesVentana(c.last_paciente_at, Date.now()),
    // Los 200 MÁS RECIENTES, en orden cronológico para el hilo.
    mensajes: ((msgsRes.data as MensajeHilo[] | null) ?? []).reverse(),
  }
}

// ── Pacientes ─────────────────────────────────────────────────────────────────

export interface PacienteRow {
  id: string
  dni: string
  nombre: string | null
  apellido: string | null
  obra_social: string | null
  telefonos: string[]
  updated_at: string
}

export async function getPacientes(db: SupabaseClient, medicoId: string, q: string): Promise<PacienteRow[]> {
  let query = db
    .from('wa_pacientes')
    .select('id, dni, nombre, apellido, obra_social, telefonos, updated_at')
    .eq('medico_id', medicoId)
    .order('apellido')
    .limit(100)
  const term = q.trim()
  if (term) {
    // PostgREST trata , ( ) como sintaxis del filtro .or(): los sacamos del término.
    const safe = term.replace(/[,()"]/g, ' ').replace(/\s+/g, ' ').trim()
    // Si después de sanitizar el término queda vacío, devolvemos la lista sin filtrar.
    if (safe) {
      const safeDni = safe.replace(/\D/g, '') || safe
      // Apellido, nombre o DNI (el teléfono se busca client-side: jsonb).
      query = query.or(`apellido.ilike.%${safe}%,nombre.ilike.%${safe}%,dni.like.%${safeDni}%`)
    }
  }
  const { data } = ok(await query)
  return ((data as (Omit<PacienteRow, 'telefonos'> & { telefonos: unknown })[] | null) ?? []).map((p) => ({
    ...p,
    telefonos: Array.isArray(p.telefonos) ? (p.telefonos as string[]) : [],
  }))
}

export interface FichaPaciente {
  paciente: PacienteRow
  turnos: { id: string; starts_at: string; estado: string; notas: string | null; origen: string }[]
  sobreturnos: SobreturnoRow[]
  conversacionId: string | null
  recetas: { id: string; estado: string; monto: number | null; created_at: string; medicamento: string }[]
}

export async function getFicha(db: SupabaseClient, medicoId: string, pacienteId: string): Promise<FichaPaciente | null> {
  const { data: pacienteData } = ok(await db
    .from('wa_pacientes')
    .select('id, dni, nombre, apellido, obra_social, telefonos, updated_at')
    .eq('medico_id', medicoId)
    .eq('id', pacienteId)
    .maybeSingle())
  if (!pacienteData) return null
  const p = pacienteData as Omit<PacienteRow, 'telefonos'> & { telefonos: unknown }
  const telefonos = Array.isArray(p.telefonos) ? (p.telefonos as string[]) : []

  // wa_contactos guarda el formato crudo de Meta (549...); wa_pacientes el normalizado (54...).
  // Buscamos ambas variantes para que el link a la conversación funcione.
  const variantes = telefonos.flatMap((t) =>
    t.startsWith('54') && !t.startsWith('549') ? [t, `549${t.slice(2)}`] : [t],
  )

  const [turnosRes, sobresRes, contactoRes, recetasRes] = await Promise.all([
    db
      .from('wa_turnos')
      .select('id, starts_at, estado, notas, origen')
      .eq('medico_id', medicoId)
      .eq('paciente_dni', p.dni)
      .order('starts_at', { ascending: false })
      .limit(50)
      .then(ok),
    db
      .from('wa_sobreturnos')
      .select('id, fecha, paciente_nombre, paciente_apellido, paciente_dni, paciente_obra_social, cobro, estado, notas')
      .eq('medico_id', medicoId)
      .eq('paciente_dni', p.dni)
      .order('fecha', { ascending: false })
      .limit(20)
      .then(ok),
    variantes.length
      ? db
          .from('wa_contactos')
          .select('id, conversaciones:wa_conversaciones(id)')
          .eq('medico_id', medicoId)
          .in('telefono', variantes)
          .limit(1)
          .maybeSingle()
          .then(ok)
      : Promise.resolve({ data: null, error: null }),
    // Recetas del DNI — el panel es médico-only hasta 3B; en 3B este bloque se gatea por rol.
    db
      .from('recetas')
      .select('id, estado, monto, created_at, datos_ocr')
      .eq('medico_id', medicoId)
      .eq('paciente_dni', p.dni)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(ok),
  ])

  const contacto = contactoRes.data as unknown as { conversaciones: { id: string }[] | { id: string } | null } | null
  const convs = contacto?.conversaciones
  const conversacionId = Array.isArray(convs) ? (convs[0]?.id ?? null) : (convs?.id ?? null)

  return {
    paciente: { ...p, telefonos },
    turnos: (turnosRes.data as FichaPaciente['turnos'] | null) ?? [],
    sobreturnos: (sobresRes.data as SobreturnoRow[] | null) ?? [],
    conversacionId,
    recetas: (((recetasRes.data as { id: string; estado: string; monto: number | null; created_at: string; datos_ocr: unknown }[] | null) ?? []).map(
      (r) => ({
        id: r.id,
        estado: r.estado,
        monto: r.monto != null ? Number(r.monto) : null,
        created_at: r.created_at,
        medicamento:
          ((r.datos_ocr as { medicamentos?: { droga?: string }[] } | null)?.medicamentos?.[0]?.droga ?? 'receta'),
      }),
    )),
  }
}

// ── Config ────────────────────────────────────────────────────────────────────

export interface ConfigConsultorio {
  horarios: { id: string; weekday: number; open_time: string; close_time: string }[]
  duracionMin: number
  servicioId: string | null
  excepciones: { id: string; start_date: string; end_date: string; kind: string; note: string | null }[]
  osSuspendidas: { id: string; nombre_os: string; nota: string | null; motivo: 'suspendida' | 'no_atiende' }[]
  diasParticulares: { id: string; tipo: 'semanal' | 'fecha'; dia_semana: number | null; fecha: string | null }[]
  agente: {
    nombre_medico: string | null
    especialidad: string | null
    tono: string | null
    saludo: string | null
    faqs: { pregunta: string; respuesta: string }[]
    precio_receta_default: number | null
  } | null
  // MercadoPago no es un booleano: 'reconectar' (se venció el permiso, el cobro está pausado)
  // se vería igual que "nunca conectó" y el médico no entendería por qué dejó de cobrar.
  conexiones: {
    whatsapp: boolean
    mercadopago: { estado: 'conectado' | 'reconectar' } | null
  }
  secretarias: {
    id: string
    email: string
    estado: 'pendiente' | 'activa' | 'revocada'
    invited_at: string
    /** Enlace de alta (`/alta-secretaria/[token]`) — solo para 'pendiente' con token vigente. */
    url?: string | null
  }[]
}

export async function getConfig(db: SupabaseClient, medicoId: string): Promise<ConfigConsultorio> {
  const hoy = arDateString(Date.now(), 0)
  const [horariosRes, serviciosRes, excepcionesRes, osRes, agenteRes, canalRes, mpRes, secretariasRes, diasPartRes] = await Promise.all([
    db.from('wa_horarios').select('id, weekday, open_time, close_time').eq('medico_id', medicoId).order('weekday').then(ok),
    db.from('wa_servicios').select('id, duracion_min').eq('medico_id', medicoId).eq('activo', true).limit(1).then(ok),
    db
      .from('wa_excepciones')
      .select('id, start_date, end_date, kind, note')
      .eq('medico_id', medicoId)
      .gte('end_date', hoy)
      .order('start_date')
      .then(ok),
    db.from('wa_os_suspendidas').select('id, nombre_os, nota, motivo').eq('medico_id', medicoId).order('nombre_os').then(ok),
    db
      .from('wa_config_agente')
      .select('nombre_medico, especialidad, tono, saludo, faqs, precio_receta_default')
      .eq('medico_id', medicoId)
      .maybeSingle()
      .then(ok),
    db.from('wa_canales').select('id').eq('medico_id', medicoId).eq('estado', 'conectado').maybeSingle().then(ok),
    // Sin filtrar por estado: necesitamos distinguir 'reconectar' de "sin conexión".
    db.from('mp_conexiones').select('estado').eq('medico_id', medicoId).maybeSingle().then(ok),
    db
      .from('equipo_consultorio')
      .select('id, secretaria_email, estado, invited_at, token')
      .eq('medico_id', medicoId)
      .neq('estado', 'revocada')
      .order('invited_at')
      .then(ok),
    db.from('wa_dias_particulares').select('id, tipo, dia_semana, fecha').eq('medico_id', medicoId).then(ok),
  ])
  const servicio = ((serviciosRes.data as { id: string; duracion_min: number }[] | null) ?? [])[0] ?? null
  const agente = agenteRes.data as ConfigConsultorio['agente'] & { precio_receta_default: unknown } | null
  return {
    horarios: (horariosRes.data as ConfigConsultorio['horarios'] | null) ?? [],
    duracionMin: servicio?.duracion_min ?? 30,
    servicioId: servicio?.id ?? null,
    excepciones: (excepcionesRes.data as ConfigConsultorio['excepciones'] | null) ?? [],
    osSuspendidas: (osRes.data as ConfigConsultorio['osSuspendidas'] | null) ?? [],
    diasParticulares: (diasPartRes.data as ConfigConsultorio['diasParticulares'] | null) ?? [],
    agente: agente
      ? { ...agente, precio_receta_default: agente.precio_receta_default != null ? Number(agente.precio_receta_default) : null }
      : null,
    conexiones: {
      whatsapp: !!canalRes.data,
      mercadopago: (() => {
        const mp = mpRes.data as { estado: string } | null
        if (!mp) return null
        return { estado: mp.estado === 'reconectar' ? ('reconectar' as const) : ('conectado' as const) }
      })(),
    },
    secretarias: (
      (secretariasRes.data as
        | { id: string; secretaria_email: string; estado: 'pendiente' | 'activa' | 'revocada'; invited_at: string; token: string | null }[]
        | null) ?? []
    ).map((s) => ({
      id: s.id,
      email: s.secretaria_email,
      estado: s.estado,
      invited_at: s.invited_at,
      url: s.estado === 'pendiente' && s.token ? `${siteUrl()}/alta-secretaria/${s.token}` : null,
    })),
  }
}

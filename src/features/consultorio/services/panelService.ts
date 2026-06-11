import type { SupabaseClient } from '@supabase/supabase-js'
import { arDateString, AR_OFFSET } from '@/lib/turnos/slots'
import { getServiciosActivos, getDisponibilidad } from '@/features/whatsapp/services/turnosService'
import { armarDia, type ItemDia, type TurnoDia, type SlotLibre } from '@/lib/consultorio/armarDia'
import { semaforoConversacion, msRestantesVentana, type Semaforo } from '@/lib/consultorio/semaforo'

/** supabase-js devuelve errores en vez de lanzarlos: acá los convertimos en throw
 *  para que las pantallas muestren su banner de error en vez de un vacío convincente. */
function ok<T extends { data: unknown; error: { message: string } | null }>(res: T): T {
  if (res.error) throw new Error(res.error.message)
  return res
}

// ── Agenda ────────────────────────────────────────────────────────────────────

export interface DiaSemana {
  fecha: string // YYYY-MM-DD
  turnos: number
  sobreturnos: number
}

/** Tira semanal: contadores de los próximos 7 días (hoy incluido). */
export async function getSemana(db: SupabaseClient, medicoId: string): Promise<DiaSemana[]> {
  const desde = arDateString(Date.now(), 0)
  const hasta = arDateString(Date.now(), 7)
  const desdeIso = new Date(`${desde}T00:00:00${AR_OFFSET}`).toISOString()
  const hastaIso = new Date(`${hasta}T00:00:00${AR_OFFSET}`).toISOString()
  const [turnosRes, sobresRes] = await Promise.all([
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
      .neq('estado', 'cancelado')
      .gte('fecha', desde)
      .lt('fecha', hasta)
      .then(ok),
  ])
  const dias: DiaSemana[] = []
  for (let i = 0; i < 7; i++) {
    const fecha = arDateString(Date.now(), i)
    dias.push({
      fecha,
      turnos: ((turnosRes.data as { starts_at: string }[] | null) ?? []).filter(
        (t) => arDateString(new Date(t.starts_at).getTime(), 0) === fecha,
      ).length,
      sobreturnos: ((sobresRes.data as { fecha: string }[] | null) ?? []).filter((s) => s.fecha === fecha).length,
    })
  }
  return dias
}

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

export interface DiaAgenda {
  items: ItemDia[]
  sobreturnos: SobreturnoRow[]
  cerrado: boolean
}

/** El día completo: turnos (todas las identidades) + huecos libres + sobreturnos. */
export async function getDia(db: SupabaseClient, medicoId: string, fecha: string): Promise<DiaAgenda> {
  const desdeIso = new Date(`${fecha}T00:00:00${AR_OFFSET}`).toISOString()
  const hastaIso = new Date(new Date(desdeIso).getTime() + 86_400_000).toISOString()
  const [turnosRes, sobresRes, servicios] = await Promise.all([
    db
      .from('wa_turnos')
      .select(
        'id, starts_at, ends_at, estado, paciente_nombre, paciente_apellido, paciente_dni, paciente_obra_social, paciente_telefono, notas, origen',
      )
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
    getServiciosActivos(db, medicoId),
  ])
  const turnos = (turnosRes.data as TurnoDia[] | null) ?? []
  // Huecos libres SOLO del día pedido (getDisponibilidad ya excluye pasados y ocupados).
  let libres: SlotLibre[] = []
  let cerrado = false
  if (servicios.length > 0) {
    const dias = await getDisponibilidad(db, medicoId, servicios[0])
    const delDia = dias.find((d) => d.date === fecha)
    libres = delDia ? delDia.slots : []
    cerrado = !delDia && turnos.length === 0
  }
  return {
    items: armarDia(turnos, libres, Date.now()),
    sobreturnos: (sobresRes.data as SobreturnoRow[] | null) ?? [],
    cerrado,
  }
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
  osSuspendidas: { id: string; nombre_os: string; nota: string | null }[]
  agente: {
    nombre_medico: string | null
    especialidad: string | null
    tono: string | null
    saludo: string | null
    faqs: { pregunta: string; respuesta: string }[]
    precio_receta_default: number | null
  } | null
  conexiones: { whatsapp: boolean; mercadopago: boolean }
}

export async function getConfig(db: SupabaseClient, medicoId: string): Promise<ConfigConsultorio> {
  const hoy = arDateString(Date.now(), 0)
  const [horariosRes, serviciosRes, excepcionesRes, osRes, agenteRes, canalRes, mpRes] = await Promise.all([
    db.from('wa_horarios').select('id, weekday, open_time, close_time').eq('medico_id', medicoId).order('weekday').then(ok),
    db.from('wa_servicios').select('id, duracion_min').eq('medico_id', medicoId).eq('activo', true).limit(1).then(ok),
    db
      .from('wa_excepciones')
      .select('id, start_date, end_date, kind, note')
      .eq('medico_id', medicoId)
      .gte('end_date', hoy)
      .order('start_date')
      .then(ok),
    db.from('wa_os_suspendidas').select('id, nombre_os, nota').eq('medico_id', medicoId).order('nombre_os').then(ok),
    db
      .from('wa_config_agente')
      .select('nombre_medico, especialidad, tono, saludo, faqs, precio_receta_default')
      .eq('medico_id', medicoId)
      .maybeSingle()
      .then(ok),
    db.from('wa_canales').select('id').eq('medico_id', medicoId).eq('estado', 'conectado').maybeSingle().then(ok),
    db.from('mp_conexiones').select('id').eq('medico_id', medicoId).eq('estado', 'conectado').maybeSingle().then(ok),
  ])
  const servicio = ((serviciosRes.data as { id: string; duracion_min: number }[] | null) ?? [])[0] ?? null
  const agente = agenteRes.data as ConfigConsultorio['agente'] & { precio_receta_default: unknown } | null
  return {
    horarios: (horariosRes.data as ConfigConsultorio['horarios'] | null) ?? [],
    duracionMin: servicio?.duracion_min ?? 30,
    servicioId: servicio?.id ?? null,
    excepciones: (excepcionesRes.data as ConfigConsultorio['excepciones'] | null) ?? [],
    osSuspendidas: (osRes.data as ConfigConsultorio['osSuspendidas'] | null) ?? [],
    agente: agente
      ? { ...agente, precio_receta_default: agente.precio_receta_default != null ? Number(agente.precio_receta_default) : null }
      : null,
    conexiones: { whatsapp: !!canalRes.data, mercadopago: !!mpRes.data },
  }
}

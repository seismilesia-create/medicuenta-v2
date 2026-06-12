# Fase 3A · Parte 2 — Panel del consultorio (4 pantallas + motor de sesión) · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El médico abre la app en la compu y tiene su consultorio: `/agenda` (día protagonista + sobreturnos + asistencia + turno manual), `/conversaciones` (bandeja semáforo + intervención humana real por WhatsApp), `/pacientes` (lista + ficha auto-armada) y `/consultorio/config` (horarios, duración, OS suspendidas, asistente) — todo sobre el motor probado en parte 1, sin tocar ninguna policy RLS.

**Architecture:** Spec `docs/superpowers/specs/2026-06-11-fase3-panel-consultorio-design.md` §5–§8 + notas de parte 1 (`2026-06-11-fase3a-parte1-motor-consultorio.md`, sección "Notas del review"). Patrón de la casa mapeado del código real: **server actions** con Zod en `src/actions/` que devuelven `{ error?: string }`, páginas con wrapper server (`createClient()` + `getUser()` + redirect) y componentes cliente estilo `OrdenesTable` (browser client + `useCallback`/`useEffect`), errores inline (sin toasts), kebab-case, CSS vars (`--color-primary/background/border`), `rounded-xl/2xl`. El panel entra por sesión → el RLS existente (`auth.uid() = medico_id`) protege solo; el cifrado del token de Meta se resuelve server-side en la action de responder.

**Tech Stack:** Next.js 16 App Router (server actions + client components) · Supabase JS (browser + server clients) · Zod · vitest (solo libs puras) · lucide-react (iconos, ya en uso).

---

## Decisiones de implementación (concretan el spec — anotar si se discute)

- **Mutaciones = server actions** (patrón de la casa, `src/actions/`): el panel no agrega route handlers. La única lógica que EXIGE servidor (descifrar token Meta con `ENCRYPTION_KEY` + llamar a la API de Meta) vive en la action `responderComoHumano`.
- **Lecturas = componentes cliente con browser client** (patrón `OrdenesTable`), envueltos por page server con guard de auth (patrón `dashboard/page.tsx`). Agenda y bandeja **refrescan por polling de 15 s** (`setInterval` + refetch) — no hay Realtime en la casa y el spec lo dejó a decisión del plan; subir a Realtime es upgrade futuro.
- **Mensaje humano que falla NO se persiste**: la action devuelve `{ error }` y el composer lo muestra inline (idioma de feedback de la casa). Satisface "nada falla en silencio" (§10) sin agregar una columna de estado a `wa_mensajes`. *Desviación consciente del detalle "marcado no enviado" del spec §6 — anotada acá.*
- **Responder como humano APAGA la alarma** (responder ES atender el aviso) + botón "Resolver" manual para apagarla sin responder. Pausar/reanudar el bot es independiente de la alarma.
- **El bottom-nav móvil NO se toca** (D1: el celular es para carga de facturación). El consultorio entra por la **sidebar** (grupo nuevo "Consultorio") — desktop directo, mobile vía hamburguesa. El pulido desktop completo sigue siendo 3C.
- **Turno manual del panel**: la action reusa `crearTurno` (un solo camino de escritura, hook de pacientes incluido) con `origen: 'panel'` + `creadoPor` + valida `esSlotOfrecido` igual que el bot. **Los candados anti-acaparamiento NO aplican al panel** (criterio humano, spec §5.2); el EXCLUDE de la DB sigue atajando carreras.
- **DNI opcional en turno manual y sobreturno** (spec §5.2): sin DNI no alimenta `wa_pacientes` (el hook ya lo maneja: `if (!p.dni) return`).
- **Deudas de parte 1 que este plan paga** (Task 1–2): `crearTurno` parametrizado (`origen`/`creadoPor`/`conversacionId`), guard del 23P01 con teléfono null, evento de bitácora renombrado a sufijo `_error`, fallback anti-mudez para `avisar_consultorio`.
- **Sin tests unitarios de componentes UI** (la casa no tiene ninguno y no hay harness de React testing): TDD solo en la lib pura nueva (`armarDia`); las pantallas se verifican con typecheck + build + prueba en vivo en browser (Task 13).
- **Config normaliza `nombre_os` al insertar** (nota del review final: el UNIQUE es case-sensible, el match no).

## Prerrequisitos

- Parte 1 mergeada y migración aplicada (ya hecho, validado E2E 2026-06-11).
- Para la prueba en vivo (Task 13): dev server corriendo; no hace falta túnel salvo para probar `responderComoHumano` end-to-end (necesita mandar un WhatsApp real → el paciente de prueba debe tener ventana abierta: que escriba algo primero).

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/features/whatsapp/services/turnosService.ts` | Modificar | `crearTurno` gana `origen`/`creadoPor`/`conversacionId` opcionales + guard 23P01 tel-null + evento `_error` |
| `src/features/whatsapp/agent/toolsTurnos.ts` | Modificar | Pasa `conversacionId` al hook vía `crearTurno` |
| `src/features/whatsapp/agent/runAgentTurn.ts` | Modificar | Fallback anti-mudez para `avisar_consultorio` |
| `src/lib/consultorio/armarDia.ts` (+test) | Crear | Puro: merge cronológico de turnos del día + huecos libres |
| `src/features/consultorio/services/panelService.ts` | Crear | TODAS las lecturas del panel (agenda, bandeja, hilo, pacientes, ficha, config) — client inyectado |
| `src/actions/consultorio-agenda.ts` | Crear | turnoManual · cancelarTurnoPanel · marcarAsistencia · crearSobreturno · setEstadoSobreturno · bloquearDia · desbloquearDia |
| `src/actions/consultorio-conversaciones.ts` | Crear | responderComoHumano · setBotPausado · resolverAlarma |
| `src/actions/consultorio-pacientes.ts` | Crear | editarPaciente |
| `src/actions/consultorio-config.ts` | Crear | guardarHorarios · guardarDuracionConsulta · agregarOsSuspendida · quitarOsSuspendida · guardarAsistente |
| `src/app/(main)/layout.tsx` | Modificar | Grupo "Consultorio" en el objeto `navigation` |
| `src/app/(main)/agenda/page.tsx` + `src/features/consultorio/components/agenda/` | Crear | Pantalla agenda (día protagonista) |
| `src/app/(main)/conversaciones/page.tsx` + `src/features/consultorio/components/conversaciones/` | Crear | Bandeja + hilo + composer |
| `src/app/(main)/pacientes/page.tsx` + `src/features/consultorio/components/pacientes/` | Crear | Lista + ficha |
| `src/app/(main)/consultorio/config/page.tsx` + `src/features/consultorio/components/config/` | Crear | Config del consultorio (médico-only) |

---

## Task 1: Motor — `crearTurno` parametrizado + deudas de parte 1

**Files:**
- Modify: `src/features/whatsapp/services/turnosService.ts`
- Modify: `src/features/whatsapp/agent/toolsTurnos.ts`

- [ ] **Step 1: Parametrizar `CrearTurnoInput`.** En `turnosService.ts`, agregar al FINAL de la interface `CrearTurnoInput` (después de `contactoId: string | null`):

```ts
  /** 'bot' (default) o 'panel'. El panel además manda creadoPor (spec D2). */
  origen?: 'bot' | 'panel'
  creadoPor?: string | null
  /** Hilo de WhatsApp para linkear eventos de bitácora (null en turno manual). */
  conversacionId?: string | null
```

- [ ] **Step 2: Usarlos en el insert.** En `crearTurno`, el objeto del insert gana dos campos (después de `estado: 'reservado',`):

```ts
    origen: input.origen ?? 'bot',
    creado_por: input.creadoPor ?? null,
```

- [ ] **Step 3: Guard del 23P01 con teléfono null.** Dentro del branch `if (error.code === '23P01')`, la query de "¿es el mismo paciente?" hoy filtra `.eq('paciente_telefono', input.pacienteTelefono)`. Envolverla: si `input.pacienteTelefono` es null/vacío, NO correr esa query (PostgREST `eq.null` no matchea nada) y devolver directo el error genérico. El bloque queda:

```ts
    if (error.code === '23P01') {
      // ¿El que ya ocupa el slot es ESTE MISMO paciente? Solo determinable por
      // teléfono (camino bot); un turno manual sin teléfono no tiene cómo matchear.
      if (input.pacienteTelefono) {
        const { data: propio } = await db
          .from('wa_turnos')
          .select('id, starts_at')
          .eq('medico_id', medicoId)
          .eq('paciente_telefono', input.pacienteTelefono)
          .neq('estado', 'cancelado')
          .lt('starts_at', endsAt)
          .gt('ends_at', input.startsAt)
          .limit(1)
        if (propio && propio.length > 0) {
          return { ok: true, yaExistia: (propio[0] as { starts_at: string }).starts_at }
        }
      }
      return { ok: false, error: 'Ese horario ya fue tomado. Probá con otro.' }
    }
```

- [ ] **Step 4: Hook de pacientes — evento `_error` + origen dinámico + conversacionId.** El catch del hook de pacientes en `crearTurno` pasa a:

```ts
  } catch (e) {
    await registrarEvento(db, {
      medicoId,
      origen: input.origen === 'panel' ? 'panel' : 'agente',
      nivel: 'error',
      evento: 'upsert_paciente_error',
      detalle: { error: String(e), dni: input.pacienteDni },
      conversacionId: input.conversacionId ?? null,
    })
  }
```

- [ ] **Step 5: El bot pasa `conversacionId`.** En `toolsTurnos.ts`, en la llamada a `crearTurno` dentro de `reservar_turno`, agregar al objeto input (después de `contactoId: ctx.contactoId,`):

```ts
          conversacionId: ctx.conversacionId,
```

- [ ] **Step 6: Verificar** — `cd /Users/hector/proyectos/Medicuenta-V2.0 && npm run typecheck` → limpio; `npm test` → 133 verdes.
- [ ] **Step 7: Commit**

```bash
cd /Users/hector/proyectos/Medicuenta-V2.0 && git add src/features/whatsapp/services/turnosService.ts src/features/whatsapp/agent/toolsTurnos.ts && git commit -m "feat(consultorio): crearTurno parametrizado origen/creadoPor + guard 23P01 tel-null + evento _error (deudas parte 1)"
```

---

## Task 2: Motor — fallback anti-mudez para `avisar_consultorio`

**Files:**
- Modify: `src/features/whatsapp/agent/runAgentTurn.ts` (leerlo primero: el fallback existente cubre `reservar_turno`/`cancelar_turno` cerca de las líneas 43-47)

- [ ] **Step 1:** Localizar en `runAgentTurn.ts` el bloque de fallback que arma texto cuando el modelo terminó en tool-call sin componer respuesta (busca los literales `reservar_turno` / `cancelar_turno`). Agregar la rama para `avisar_consultorio` siguiendo EXACTAMENTE la forma del bloque existente (mismo patrón de acceso al resultado de la tool), con este texto para el paciente:

```ts
// avisar_consultorio sin texto del modelo → confirmación propia (anti-mudez):
'Listo, ya avisé al consultorio: te van a responder por este mismo chat. 🙏'
```

NOTA al implementador: el shape exacto del bloque existente manda — copiá su estructura (cómo detecta la tool y cómo devuelve el texto). Si el bloque real difiere de lo descripto, reportá NEEDS_CONTEXT con el código que encontraste.

- [ ] **Step 2: Verificar** — typecheck limpio, 133 tests verdes.
- [ ] **Step 3: Commit**

```bash
cd /Users/hector/proyectos/Medicuenta-V2.0 && git add src/features/whatsapp/agent/runAgentTurn.ts && git commit -m "fix(agente): fallback anti-mudez para avisar_consultorio"
```

---

## Task 3: Lib pura — `armarDia` (TDD)

El corazón visual de la agenda: mezcla cronológicamente los turnos del día con los huecos libres que ofrece el motor de slots.

**Files:**
- Create: `src/lib/consultorio/armarDia.ts`
- Test: `src/lib/consultorio/armarDia.test.ts`

- [ ] **Step 1: Test que falla**

```ts
import { describe, it, expect } from 'vitest'
import { armarDia, type ItemDia } from './armarDia'

const NOW = new Date('2026-06-15T13:00:00.000Z').getTime() // 10:00 AR

const turno = (h: string, estado = 'reservado', extra = {}) => ({
  id: `t-${h}`,
  starts_at: `2026-06-15T${h}:00.000Z`,
  ends_at: `2026-06-15T${h}:00.000Z`,
  estado,
  paciente_nombre: 'Ana',
  paciente_apellido: 'Ríos',
  paciente_dni: '30111222',
  paciente_obra_social: 'OSEP',
  paciente_telefono: '543834222049',
  notas: null,
  origen: 'bot',
  ...extra,
})

const slot = (h: string, label: string) => ({
  startsAt: `2026-06-15T${h}:00.000Z`,
  endsAt: `2026-06-15T${h}:00.000Z`,
  label,
})

describe('armarDia', () => {
  it('mezcla turnos y huecos en orden cronológico', () => {
    const items = armarDia([turno('12:00')], [slot('15:30', '12:30')], NOW)
    expect(items.map((i) => i.tipo)).toEqual(['turno', 'libre'])
  })

  it('los cancelados NO aparecen (su hueco vuelve como libre vía slots)', () => {
    const items = armarDia([turno('12:00', 'cancelado')], [], NOW)
    expect(items).toEqual([])
  })

  it('cada turno lleva su estado efectivo (pasado sin marca = atendido)', () => {
    const items = armarDia([turno('12:00'), turno('19:00')], [], NOW)
    const turnos = items.filter((i): i is Extract<ItemDia, { tipo: 'turno' }> => i.tipo === 'turno')
    expect(turnos[0].estadoEfectivo).toBe('atendido') // 09:00 AR, ya pasó
    expect(turnos[1].estadoEfectivo).toBe('proximo') // 16:00 AR, futuro
  })

  it('ausente marcado → no_vino', () => {
    const items = armarDia([turno('12:00', 'ausente')], [], NOW)
    expect((items[0] as Extract<ItemDia, { tipo: 'turno' }>).estadoEfectivo).toBe('no_vino')
  })

  it('huecos intercalados entre turnos quedan en su lugar', () => {
    const items = armarDia([turno('12:00'), turno('13:00')], [slot('12:30', '09:30')], NOW)
    expect(items.map((i) => (i.tipo === 'turno' ? `T${i.turno.starts_at.slice(11, 16)}` : `L${i.label}`))).toEqual([
      'T12:00',
      'L09:30',
      'T13:00',
    ])
  })
})
```

- [ ] **Step 2: Correr y ver fallar** — `npm test -- src/lib/consultorio/armarDia.test.ts` → FAIL "Cannot find module './armarDia'".

- [ ] **Step 3: Implementar**

```ts
/** Arma la vista del día de la agenda (spec Fase 3 §5/D11): turnos + huecos, cronológico. */
import { estadoEfectivoTurno, type EstadoEfectivoTurno } from './asistencia'

export interface TurnoDia {
  id: string
  starts_at: string
  ends_at: string
  estado: string
  paciente_nombre: string | null
  paciente_apellido: string | null
  paciente_dni: string | null
  paciente_obra_social: string | null
  paciente_telefono: string | null
  notas: string | null
  origen: string
}

export interface SlotLibre {
  startsAt: string
  endsAt: string
  label: string
}

export type ItemDia =
  | { tipo: 'turno'; turno: TurnoDia; estadoEfectivo: EstadoEfectivoTurno; ts: number }
  | { tipo: 'libre'; startsAt: string; label: string; ts: number }

/** Cancelados afuera (su hueco ya vuelve a ofrecerse vía el motor de slots). */
export function armarDia(turnos: TurnoDia[], libres: SlotLibre[], nowMs: number): ItemDia[] {
  const items: ItemDia[] = []
  for (const t of turnos) {
    if (t.estado === 'cancelado') continue
    items.push({
      tipo: 'turno',
      turno: t,
      estadoEfectivo: estadoEfectivoTurno(t, nowMs),
      ts: new Date(t.starts_at).getTime(),
    })
  }
  for (const s of libres) {
    items.push({ tipo: 'libre', startsAt: s.startsAt, label: s.label, ts: new Date(s.startsAt).getTime() })
  }
  return items.sort((a, b) => a.ts - b.ts)
}
```

- [ ] **Step 4: Verde** — `npm test -- src/lib/consultorio/armarDia.test.ts` → PASS (5 tests). Suite completa: 138.
- [ ] **Step 5: Commit**

```bash
cd /Users/hector/proyectos/Medicuenta-V2.0 && git add src/lib/consultorio/armarDia.ts src/lib/consultorio/armarDia.test.ts && git commit -m "feat(consultorio): armarDia — vista cronológica del día con huecos y asistencia (TDD)"
```

---

## Task 4: `panelService` — todas las lecturas del panel (camino sesión)

Service de SOLO lectura. Recibe el `SupabaseClient` (browser o server) — el RLS hace el filtrado real; igual filtramos `medico_id` explícito por consistencia con la casa.

**Files:**
- Create: `src/features/consultorio/services/panelService.ts`

- [ ] **Step 1: Implementar**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { arDateString, AR_OFFSET } from '@/lib/turnos/slots'
import { getServiciosActivos, getDisponibilidad } from '@/features/whatsapp/services/turnosService'
import { armarDia, type ItemDia, type TurnoDia, type SlotLibre } from '@/lib/consultorio/armarDia'
import { semaforoConversacion, msRestantesVentana, type Semaforo } from '@/lib/consultorio/semaforo'

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
      .lt('starts_at', hastaIso),
    db
      .from('wa_sobreturnos')
      .select('fecha')
      .eq('medico_id', medicoId)
      .neq('estado', 'cancelado')
      .gte('fecha', desde)
      .lt('fecha', hasta),
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
      .order('starts_at'),
    db
      .from('wa_sobreturnos')
      .select('id, fecha, paciente_nombre, paciente_apellido, paciente_dni, paciente_obra_social, cobro, estado, notas')
      .eq('medico_id', medicoId)
      .eq('fecha', fecha)
      .neq('estado', 'cancelado')
      .order('created_at'),
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
  const { data: convs } = await db
    .from('wa_conversaciones')
    .select('id, bot_pausado, necesita_humano, last_message_at, last_paciente_at, contacto:wa_contactos(nombre, telefono)')
    .eq('medico_id', medicoId)
    .order('last_message_at', { ascending: false })
    .limit(50)
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
  const { data: msgs } = await db
    .from('wa_mensajes')
    .select('conversacion_id, contenido, created_at')
    .eq('medico_id', medicoId)
    .in('conversacion_id', rows.map((r) => r.id))
    .order('created_at', { ascending: false })
    .limit(300)
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
      .maybeSingle(),
    db
      .from('wa_mensajes')
      .select('id, direccion, origen, contenido, created_at')
      .eq('medico_id', medicoId)
      .eq('conversacion_id', conversacionId)
      .order('created_at', { ascending: true })
      .limit(200),
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
    mensajes: (msgsRes.data as MensajeHilo[] | null) ?? [],
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
    // Apellido, nombre o DNI (el teléfono se busca client-side: jsonb).
    query = query.or(`apellido.ilike.%${term}%,nombre.ilike.%${term}%,dni.like.%${term.replace(/\D/g, '') || term}%`)
  }
  const { data } = await query
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
  const { data: pacienteData } = await db
    .from('wa_pacientes')
    .select('id, dni, nombre, apellido, obra_social, telefonos, updated_at')
    .eq('medico_id', medicoId)
    .eq('id', pacienteId)
    .maybeSingle()
  if (!pacienteData) return null
  const p = pacienteData as Omit<PacienteRow, 'telefonos'> & { telefonos: unknown }
  const telefonos = Array.isArray(p.telefonos) ? (p.telefonos as string[]) : []

  const [turnosRes, sobresRes, contactoRes, recetasRes] = await Promise.all([
    db
      .from('wa_turnos')
      .select('id, starts_at, estado, notas, origen')
      .eq('medico_id', medicoId)
      .eq('paciente_dni', p.dni)
      .order('starts_at', { ascending: false })
      .limit(50),
    db
      .from('wa_sobreturnos')
      .select('id, fecha, paciente_nombre, paciente_apellido, paciente_dni, paciente_obra_social, cobro, estado, notas')
      .eq('medico_id', medicoId)
      .eq('paciente_dni', p.dni)
      .order('fecha', { ascending: false })
      .limit(20),
    telefonos.length
      ? db
          .from('wa_contactos')
          .select('id, conversaciones:wa_conversaciones(id)')
          .eq('medico_id', medicoId)
          .in('telefono', telefonos)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // Recetas del DNI — el panel es médico-only hasta 3B; en 3B este bloque se gatea por rol.
    db
      .from('recetas')
      .select('id, estado, monto, created_at, datos_ocr')
      .eq('medico_id', medicoId)
      .eq('paciente_dni', p.dni)
      .order('created_at', { ascending: false })
      .limit(20),
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
    db.from('wa_horarios').select('id, weekday, open_time, close_time').eq('medico_id', medicoId).order('weekday'),
    db.from('wa_servicios').select('id, duracion_min').eq('medico_id', medicoId).eq('activo', true).limit(1),
    db
      .from('wa_excepciones')
      .select('id, start_date, end_date, kind, note')
      .eq('medico_id', medicoId)
      .gte('end_date', hoy)
      .order('start_date'),
    db.from('wa_os_suspendidas').select('id, nombre_os, nota').eq('medico_id', medicoId).order('nombre_os'),
    db
      .from('wa_config_agente')
      .select('nombre_medico, especialidad, tono, saludo, faqs, precio_receta_default')
      .eq('medico_id', medicoId)
      .maybeSingle(),
    db.from('wa_canales').select('id').eq('medico_id', medicoId).eq('estado', 'conectado').maybeSingle(),
    db.from('mp_conexiones').select('id').eq('medico_id', medicoId).eq('estado', 'activa').maybeSingle(),
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
```

- [ ] **Step 2: Verificar** — `npm run typecheck` → limpio (este archivo solo se compila; las pantallas lo consumen después). `npm test` → 138 verdes.

NOTA: si `mp_conexiones.estado` usa otro literal que `'activa'` (verificar contra `src/features/whatsapp/services/mpConexiones.ts`), usar el literal real de ese service.

- [ ] **Step 3: Commit**

```bash
cd /Users/hector/proyectos/Medicuenta-V2.0 && git add src/features/consultorio/services/panelService.ts && git commit -m "feat(consultorio): panelService — lecturas de agenda, bandeja, hilo, pacientes y config (sesión)"
```

---

## Task 5: Server actions — agenda y sobreturnos

**Files:**
- Create: `src/actions/consultorio-agenda.ts`

- [ ] **Step 1: Implementar** (patrón de la casa: `'use server'` + Zod + `{ error?: string }`):

```ts
'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getServiciosActivos, getDisponibilidad, crearTurno } from '@/features/whatsapp/services/turnosService'
import { armarStartsAtISO } from '@/lib/turnos/formato'
import { esSlotOfrecido, arDateString } from '@/lib/turnos/slots'
import { upsertPacienteDesdeIdentidad } from '@/features/whatsapp/services/pacientesService'
import { registrarEvento } from '@/features/whatsapp/services/bitacora'
import { normalizeRecipient } from '@/lib/whatsapp/client'

async function medicoAutenticado() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null }
  return { supabase, user }
}

const turnoManualSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora: z.string().regex(/^\d{1,2}:\d{2}$/),
  nombre: z.string().min(1, 'Falta el nombre'),
  apellido: z.string().min(1, 'Falta el apellido'),
  dni: z.string().trim(), // opcional (spec §5.2): "" = sin DNI
  obraSocial: z.string().min(1, 'Indicá la obra social o "particular"'),
  telefono: z.string().trim(), // opcional
  motivo: z.string().trim(),
})

export async function turnoManual(input: z.infer<typeof turnoManualSchema>) {
  const { supabase, user } = await medicoAutenticado()
  if (!user) return { error: 'No autenticado' }
  const parsed = turnoManualSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data

  const dniNorm = d.dni.replace(/\D/g, '')
  if (d.dni && !/^\d{7,8}$/.test(dniNorm)) return { error: 'DNI inválido (7 u 8 dígitos), o dejalo vacío' }

  const servicios = await getServiciosActivos(supabase, user.id)
  if (servicios.length === 0) return { error: 'Configurá primero los horarios y la duración en Config' }
  const startsAt = armarStartsAtISO(d.fecha, d.hora.padStart(5, '0'))
  if (!startsAt) return { error: 'Fecha u hora inválida' }
  const dias = await getDisponibilidad(supabase, user.id, servicios[0])
  if (!esSlotOfrecido(dias, startsAt)) return { error: 'Ese horario ya no está libre — refrescá la agenda' }

  const r = await crearTurno(supabase, user.id, {
    servicio: servicios[0],
    startsAt,
    pacienteTelefono: d.telefono ? normalizeRecipient(d.telefono) : null,
    pacienteNombre: d.nombre,
    pacienteApellido: d.apellido,
    pacienteDni: dniNorm,
    pacienteObraSocial: d.obraSocial,
    motivo: d.motivo.slice(0, 200),
    contactoId: null,
    origen: 'panel',
    creadoPor: user.id,
  })
  if (!r.ok) return { error: r.error }
  return { ok: true as const }
}

export async function cancelarTurnoPanel(turnoId: string) {
  const { supabase, user } = await medicoAutenticado()
  if (!user) return { error: 'No autenticado' }
  const { data, error } = await supabase
    .from('wa_turnos')
    .update({ estado: 'cancelado', updated_at: new Date().toISOString() })
    .eq('medico_id', user.id)
    .eq('id', turnoId)
    .in('estado', ['reservado', 'confirmado'])
    .select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'Ese turno ya no se puede cancelar' }
  return { ok: true as const }
}

/** Asistencia (spec §5.4): marcar "no vino" o volverlo a atendido. */
export async function marcarAsistencia(turnoId: string, noVino: boolean) {
  const { supabase, user } = await medicoAutenticado()
  if (!user) return { error: 'No autenticado' }
  const { error } = await supabase
    .from('wa_turnos')
    .update({ estado: noVino ? 'ausente' : 'reservado', updated_at: new Date().toISOString() })
    .eq('medico_id', user.id)
    .eq('id', turnoId)
    .in('estado', noVino ? ['reservado', 'confirmado'] : ['ausente'])
  if (error) return { error: error.message }
  return { ok: true as const }
}

const sobreturnoSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nombre: z.string().min(1, 'Falta el nombre'),
  apellido: z.string().min(1, 'Falta el apellido'),
  dni: z.string().trim(),
  obraSocial: z.string().trim(),
  telefono: z.string().trim(),
  cobro: z.enum(['particular', 'sin_cargo']),
  notas: z.string().trim(),
})

export async function crearSobreturno(input: z.infer<typeof sobreturnoSchema>) {
  const { supabase, user } = await medicoAutenticado()
  if (!user) return { error: 'No autenticado' }
  const parsed = sobreturnoSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data
  const dniNorm = d.dni.replace(/\D/g, '')
  if (d.dni && !/^\d{7,8}$/.test(dniNorm)) return { error: 'DNI inválido (7 u 8 dígitos), o dejalo vacío' }

  const { error } = await supabase.from('wa_sobreturnos').insert({
    medico_id: user.id,
    fecha: d.fecha,
    paciente_nombre: d.nombre,
    paciente_apellido: d.apellido,
    paciente_dni: dniNorm || null,
    paciente_obra_social: d.obraSocial || null,
    paciente_telefono: d.telefono || null,
    cobro: d.cobro,
    notas: d.notas || null,
    creado_por: user.id,
  })
  if (error) return { error: error.message }

  // La base de pacientes se arma sola también desde sobreturnos (spec §7).
  if (dniNorm) {
    try {
      await upsertPacienteDesdeIdentidad(supabase, user.id, {
        nombre: d.nombre,
        apellido: d.apellido,
        dni: dniNorm,
        obraSocial: d.obraSocial || null,
        telefono: d.telefono || null,
      })
    } catch (e) {
      await registrarEvento(supabase, {
        medicoId: user.id,
        origen: 'panel',
        nivel: 'error',
        evento: 'upsert_paciente_error',
        detalle: { error: String(e), dni: dniNorm },
      })
    }
  }
  return { ok: true as const }
}

export async function setEstadoSobreturno(id: string, estado: 'pendiente' | 'atendido' | 'no_vino' | 'cancelado') {
  const { supabase, user } = await medicoAutenticado()
  if (!user) return { error: 'No autenticado' }
  const { error } = await supabase
    .from('wa_sobreturnos')
    .update({ estado, updated_at: new Date().toISOString() })
    .eq('medico_id', user.id)
    .eq('id', id)
  if (error) return { error: error.message }
  return { ok: true as const }
}

const bloquearSchema = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nota: z.string().trim(),
})

export async function bloquearDias(input: z.infer<typeof bloquearSchema>) {
  const { supabase, user } = await medicoAutenticado()
  if (!user) return { error: 'No autenticado' }
  const parsed = bloquearSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data
  if (d.hasta < d.desde) return { error: 'El rango está invertido' }
  if (d.desde < arDateString(Date.now(), 0)) return { error: 'No se puede bloquear el pasado' }
  const { error } = await supabase.from('wa_excepciones').insert({
    medico_id: user.id,
    start_date: d.desde,
    end_date: d.hasta,
    kind: 'closed',
    ranges: [],
    note: d.nota || null,
  })
  if (error) return { error: error.message }
  return { ok: true as const }
}

export async function desbloquearDias(excepcionId: string) {
  const { supabase, user } = await medicoAutenticado()
  if (!user) return { error: 'No autenticado' }
  const { error } = await supabase.from('wa_excepciones').delete().eq('medico_id', user.id).eq('id', excepcionId)
  if (error) return { error: error.message }
  return { ok: true as const }
}
```

- [ ] **Step 2: Verificar** — `npm run typecheck` → limpio; `npm test` → 138 verdes.
- [ ] **Step 3: Commit**

```bash
cd /Users/hector/proyectos/Medicuenta-V2.0 && git add src/actions/consultorio-agenda.ts && git commit -m "feat(consultorio): actions de agenda — turno manual (origen panel), asistencia, sobreturnos, bloqueos"
```

---

## Task 6: Server actions — conversaciones (responder humano, pausar, resolver)

**Files:**
- Create: `src/actions/consultorio-conversaciones.ts`

- [ ] **Step 1: Implementar**

```ts
'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getCanalByMedicoId } from '@/features/whatsapp/services/canales'
import { sendWhatsAppText } from '@/lib/whatsapp/client'
import { addMensaje } from '@/features/whatsapp/services/conversaciones'
import { registrarEvento } from '@/features/whatsapp/services/bitacora'
import { ventanaAbierta } from '@/lib/consultorio/semaforo'

const responderSchema = z.object({
  conversacionId: z.string().uuid(),
  texto: z.string().min(1, 'Escribí el mensaje').max(3500),
})

/**
 * Respuesta humana desde el panel (spec §6): sale por el MISMO número del
 * consultorio. Server action porque descifra el token de Meta (ENCRYPTION_KEY).
 * Responder = atender el aviso → apaga la alarma.
 */
export async function responderComoHumano(input: z.infer<typeof responderSchema>) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }
  const parsed = responderSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { conversacionId, texto } = parsed.data

  // Ventana de 24 h (regla de Meta): si está cerrada, no hay envío posible.
  const { data: conv } = await supabase
    .from('wa_conversaciones')
    .select('id, last_paciente_at, contacto:wa_contactos(telefono)')
    .eq('medico_id', user.id)
    .eq('id', conversacionId)
    .maybeSingle()
  if (!conv) return { error: 'Conversación no encontrada' }
  const c = conv as unknown as {
    last_paciente_at: string | null
    contacto: { telefono: string } | { telefono: string }[] | null
  }
  if (!ventanaAbierta(c.last_paciente_at, Date.now())) {
    return { error: 'La ventana de 24 h está cerrada: vas a poder responderle cuando el paciente vuelva a escribir.' }
  }
  const contacto = Array.isArray(c.contacto) ? c.contacto[0] : c.contacto
  if (!contacto?.telefono) return { error: 'La conversación no tiene teléfono asociado' }

  const canal = await getCanalByMedicoId(supabase, user.id)
  if (!canal) return { error: 'No hay canal de WhatsApp conectado' }

  try {
    await sendWhatsAppText({
      phoneNumberId: canal.phoneNumberId,
      accessToken: canal.accessToken,
      to: contacto.telefono,
      text: texto,
    })
  } catch (e) {
    // Nada falla en silencio (spec §10): el composer muestra este error inline.
    await registrarEvento(supabase, {
      medicoId: user.id,
      origen: 'panel',
      nivel: 'error',
      evento: 'respuesta_humana_error',
      detalle: { error: String(e) },
      conversacionId,
    })
    return { error: 'WhatsApp rechazó el envío (¿token vencido?). El mensaje NO salió.' }
  }

  await addMensaje(supabase, {
    medicoId: user.id,
    conversacionId,
    direccion: 'saliente',
    origen: 'humano',
    contenido: texto,
  })
  // Responder ES atender el aviso.
  await supabase
    .from('wa_conversaciones')
    .update({ necesita_humano: false, updated_at: new Date().toISOString() })
    .eq('medico_id', user.id)
    .eq('id', conversacionId)
  await registrarEvento(supabase, {
    medicoId: user.id,
    origen: 'panel',
    nivel: 'info',
    evento: 'respuesta_humana',
    detalle: { largo: texto.length },
    conversacionId,
  })
  return { ok: true as const }
}

export async function setBotPausado(conversacionId: string, pausado: boolean) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }
  const { error } = await supabase
    .from('wa_conversaciones')
    .update({ bot_pausado: pausado, updated_at: new Date().toISOString() })
    .eq('medico_id', user.id)
    .eq('id', conversacionId)
  if (error) return { error: error.message }
  await registrarEvento(supabase, {
    medicoId: user.id,
    origen: 'panel',
    nivel: 'info',
    evento: pausado ? 'bot_pausado' : 'bot_reanudado',
    conversacionId,
  })
  return { ok: true as const }
}

/** Apaga la alarma sin responder (la atendiste por otro canal). */
export async function resolverAlarma(conversacionId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }
  const { error } = await supabase
    .from('wa_conversaciones')
    .update({ necesita_humano: false, updated_at: new Date().toISOString() })
    .eq('medico_id', user.id)
    .eq('id', conversacionId)
  if (error) return { error: error.message }
  return { ok: true as const }
}
```

- [ ] **Step 2: Verificar** — `npm run typecheck` → limpio. NOTA: si `sendWhatsAppText` NO lanza en error (devuelve algo), adaptar el try/catch al contrato real del cliente (leer `src/lib/whatsapp/client.ts`) manteniendo la semántica: fallo → bitácora + `{ error }`, sin persistir el mensaje.
- [ ] **Step 3: Commit**

```bash
cd /Users/hector/proyectos/Medicuenta-V2.0 && git add src/actions/consultorio-conversaciones.ts && git commit -m "feat(consultorio): actions de conversaciones — respuesta humana real por WhatsApp, pausar bot, resolver alarma"
```

---

## Task 7: Server actions — pacientes y config

**Files:**
- Create: `src/actions/consultorio-pacientes.ts`
- Create: `src/actions/consultorio-config.ts`

- [ ] **Step 1: `consultorio-pacientes.ts`**

```ts
'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const editarSchema = z.object({
  pacienteId: z.string().uuid(),
  nombre: z.string().trim(),
  apellido: z.string().trim(),
  dni: z.string().trim().regex(/^\d{7,8}$/, 'DNI inválido (7 u 8 dígitos)'),
  obraSocial: z.string().trim(),
})

/** Corrección de datos de la ficha (spec §7). Cambiar el DNI re-keyea: avisar en la UI. */
export async function editarPaciente(input: z.infer<typeof editarSchema>) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }
  const parsed = editarSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data
  const { error } = await supabase
    .from('wa_pacientes')
    .update({
      nombre: d.nombre || null,
      apellido: d.apellido || null,
      dni: d.dni,
      obra_social: d.obraSocial || null,
      updated_at: new Date().toISOString(),
    })
    .eq('medico_id', user.id)
    .eq('id', d.pacienteId)
  if (error) {
    if (error.code === '23505') return { error: 'Ya existe otro paciente con ese DNI' }
    return { error: error.message }
  }
  return { ok: true as const }
}
```

- [ ] **Step 2: `consultorio-config.ts`**

```ts
'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { normalizarOs } from '@/lib/consultorio/osSuspendidas'

async function medicoAutenticado() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

const horariosSchema = z.array(
  z.object({
    weekday: z.number().int().min(0).max(6),
    open_time: z.string().regex(/^\d{2}:\d{2}$/),
    close_time: z.string().regex(/^\d{2}:\d{2}$/),
  }),
)

/** Reemplaza el horario semanal completo (patrón del seed: delete + insert).
 *  Los turnos YA dados fuera del nuevo horario NO se tocan (spec §8.1). */
export async function guardarHorarios(bloques: z.infer<typeof horariosSchema>) {
  const { supabase, user } = await medicoAutenticado()
  if (!user) return { error: 'No autenticado' }
  const parsed = horariosSchema.safeParse(bloques)
  if (!parsed.success) return { error: 'Horarios inválidos' }
  for (const b of parsed.data) {
    if (b.close_time <= b.open_time) return { error: `Bloque inválido: ${b.open_time}–${b.close_time}` }
  }
  const { error: delError } = await supabase.from('wa_horarios').delete().eq('medico_id', user.id)
  if (delError) return { error: delError.message }
  if (parsed.data.length > 0) {
    const { error } = await supabase
      .from('wa_horarios')
      .insert(parsed.data.map((b) => ({ medico_id: user.id, ...b })))
    if (error) return { error: error.message }
  }
  return { ok: true as const }
}

/** Cambia la duración del único servicio "Consulta" (spec D12). Solo afecta turnos futuros. */
export async function guardarDuracionConsulta(servicioId: string, duracionMin: number) {
  const { supabase, user } = await medicoAutenticado()
  if (!user) return { error: 'No autenticado' }
  if (!Number.isInteger(duracionMin) || duracionMin < 5 || duracionMin > 120) {
    return { error: 'Duración inválida (entre 5 y 120 minutos)' }
  }
  const { error } = await supabase
    .from('wa_servicios')
    .update({ duracion_min: duracionMin, updated_at: new Date().toISOString() })
    .eq('medico_id', user.id)
    .eq('id', servicioId)
  if (error) return { error: error.message }
  return { ok: true as const }
}

export async function agregarOsSuspendida(nombreOs: string, nota: string) {
  const { supabase, user } = await medicoAutenticado()
  if (!user) return { error: 'No autenticado' }
  // Normalizada al guardar (review parte 1): el UNIQUE es sensible, el match no.
  const nombre = normalizarOs(nombreOs).toUpperCase()
  if (!nombre || nombre === 'PARTICULAR') return { error: 'Nombre de obra social inválido' }
  const { error } = await supabase
    .from('wa_os_suspendidas')
    .insert({ medico_id: user.id, nombre_os: nombre, nota: nota.trim() || null })
  if (error) {
    if (error.code === '23505') return { error: 'Esa obra social ya está en la lista' }
    return { error: error.message }
  }
  return { ok: true as const }
}

export async function quitarOsSuspendida(id: string) {
  const { supabase, user } = await medicoAutenticado()
  if (!user) return { error: 'No autenticado' }
  const { error } = await supabase.from('wa_os_suspendidas').delete().eq('medico_id', user.id).eq('id', id)
  if (error) return { error: error.message }
  return { ok: true as const }
}

const agenteSchema = z.object({
  nombre_medico: z.string().trim(),
  especialidad: z.string().trim(),
  tono: z.string().trim(),
  saludo: z.string().trim(),
  faqs: z.array(z.object({ pregunta: z.string().min(1), respuesta: z.string().min(1) })).max(20),
  precio_receta: z.number().nonnegative().nullable(),
})

export async function guardarAsistente(input: z.infer<typeof agenteSchema>) {
  const { supabase, user } = await medicoAutenticado()
  if (!user) return { error: 'No autenticado' }
  const parsed = agenteSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data
  const { error } = await supabase
    .from('wa_config_agente')
    .upsert(
      {
        medico_id: user.id,
        nombre_medico: d.nombre_medico || null,
        especialidad: d.especialidad || null,
        tono: d.tono || null,
        saludo: d.saludo || null,
        faqs: d.faqs,
        precio_receta_default: d.precio_receta,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'medico_id' },
    )
  if (error) return { error: error.message }
  return { ok: true as const }
}
```

- [ ] **Step 3: Verificar** — `npm run typecheck` → limpio; `npm test` → 138 verdes.
- [ ] **Step 4: Commit**

```bash
cd /Users/hector/proyectos/Medicuenta-V2.0 && git add src/actions/consultorio-pacientes.ts src/actions/consultorio-config.ts && git commit -m "feat(consultorio): actions de pacientes (edición re-keyeable) y config (horarios, duración, OS, asistente)"
```

---

## Task 8: Navegación — grupo "Consultorio" en la sidebar

**Files:**
- Modify: `src/app/(main)/layout.tsx`
- Modify (probable): `src/shared/components/layout/sidebar.tsx`

- [ ] **Step 1: Leer ambos archivos.** El layout define `const navigation: { principal: NavItem[]; avanzado: NavItem[] }` y la `Sidebar` lo renderiza por secciones (`NavSection`). Hay que sumar un grupo `consultorio` ENTRE `principal` y `avanzado`, siguiendo EXACTAMENTE el mecanismo existente (si la Sidebar itera las secciones, alcanza con extender el objeto y el título de sección; si las hardcodea, extenderla igual que las otras dos). El **bottom-nav móvil NO se toca** (decisión D1).

- [ ] **Step 2: Items del grupo nuevo** (iconos de lucide-react ya en uso en el archivo):

```ts
  consultorio: [
    { name: 'Agenda', href: '/agenda', icon: CalendarDays },
    { name: 'Conversaciones', href: '/conversaciones', icon: MessageCircle },
    { name: 'Pacientes', href: '/pacientes', icon: Users },
    { name: 'Config consultorio', href: '/consultorio/config', icon: Settings2 },
  ],
```

(importar `CalendarDays, MessageCircle, Users, Settings2` de `lucide-react`; título de la sección: `"Consultorio"`.)

- [ ] **Step 3: Verificar** — `npm run typecheck` limpio; `npm run dev` y mirar que la sidebar muestre el grupo con los 4 links (404 esperado al clickear: las pantallas llegan en las tasks siguientes).
- [ ] **Step 4: Commit**

```bash
cd /Users/hector/proyectos/Medicuenta-V2.0 && git add src/app/\(main\)/layout.tsx src/shared/components/layout/sidebar.tsx && git commit -m "feat(consultorio): grupo Consultorio en la navegación (desktop sidebar; bottom-nav móvil intacto)"
```

---

## Task 9: Pantalla `/agenda` — el día como protagonista

**Files:**
- Create: `src/app/(main)/agenda/page.tsx`
- Create: `src/features/consultorio/components/agenda/agenda-view.tsx`
- Create: `src/features/consultorio/components/agenda/turno-manual-form.tsx`
- Create: `src/features/consultorio/components/agenda/sobreturno-form.tsx`

- [ ] **Step 1: `page.tsx`** (wrapper server, patrón de la casa):

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AgendaView } from '@/features/consultorio/components/agenda/agenda-view'

export default async function AgendaPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <AgendaView medicoId={user.id} />
}
```

- [ ] **Step 2: `agenda-view.tsx`** — tira semanal + lista del día + sobreturnos al costado (spec D11), polling 15 s:

```tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, CalendarOff, Phone } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getSemana, getDia, type DiaSemana, type DiaAgenda } from '@/features/consultorio/services/panelService'
import { cancelarTurnoPanel, marcarAsistencia, setEstadoSobreturno, bloquearDias } from '@/actions/consultorio-agenda'
import { fmtHora, fmtFechaLarga } from '@/lib/turnos/formato'
import { AR_OFFSET, arDateString } from '@/lib/turnos/slots'
import { TurnoManualForm } from './turno-manual-form'
import { SobreturnoForm } from './sobreturno-form'

const POLL_MS = 15_000

const ESTADO_CHIP: Record<string, { label: string; cls: string }> = {
  proximo: { label: 'próximo', cls: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  atendido: { label: '✓ atendido', cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  no_vino: { label: '✗ no vino', cls: 'bg-red-500/10 text-red-500 border-red-500/20' },
}

export function AgendaView({ medicoId }: { medicoId: string }) {
  const [fecha, setFecha] = useState(() => arDateString(Date.now(), 0))
  const [semana, setSemana] = useState<DiaSemana[]>([])
  const [dia, setDia] = useState<DiaAgenda | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [slotElegido, setSlotElegido] = useState<{ fecha: string; hora: string } | null>(null)
  const [sobreturnoOpen, setSobreturnoOpen] = useState(false)

  const refetch = useCallback(async () => {
    const supabase = createClient()
    try {
      const [s, d] = await Promise.all([getSemana(supabase, medicoId), getDia(supabase, medicoId, fecha)])
      setSemana(s)
      setDia(d)
      setError(null)
    } catch {
      setError('No pude cargar la agenda. Reintentando…')
    }
    setLoading(false)
  }, [medicoId, fecha])

  useEffect(() => {
    setLoading(true)
    refetch()
    const t = setInterval(refetch, POLL_MS)
    return () => clearInterval(t)
  }, [refetch])

  async function onAccion(fn: () => Promise<{ error?: string } | { ok: true }>) {
    const r = await fn()
    if ('error' in r && r.error) setError(r.error)
    else setError(null)
    refetch()
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h1 className="text-xl font-semibold">Agenda</h1>

      {/* Tira semanal (D11) */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {semana.map((d) => (
          <button
            key={d.fecha}
            onClick={() => setFecha(d.fecha)}
            className={`px-3 py-2 rounded-xl border text-sm whitespace-nowrap transition ${
              d.fecha === fecha ? 'bg-primary text-white border-primary shadow-lg shadow-primary/25' : 'border-border'
            }`}
          >
            <span className="font-semibold capitalize">
              {fmtFechaLarga(`${d.fecha}T12:00:00${AR_OFFSET}`)}
            </span>
            <span className="ml-2 opacity-75">
              {d.turnos > 0 || d.sobreturnos > 0 ? `${d.turnos}${d.sobreturnos ? `+${d.sobreturnos}` : ''}` : '—'}
            </span>
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-500/20">
          {error}
        </div>
      )}

      {loading || !dia ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-[var(--color-muted-foreground)]" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[7fr_3fr]">
          {/* Lista del día */}
          <div className="rounded-2xl border border-border divide-y divide-border/50">
            {dia.cerrado && (
              <div className="p-4 text-sm text-[var(--color-muted-foreground)] flex items-center gap-2">
                <CalendarOff className="w-4 h-4" /> Día sin atención (cerrado o sin horario cargado).
              </div>
            )}
            {dia.items.map((item) =>
              item.tipo === 'turno' ? (
                <div key={item.turno.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="font-bold tabular-nums w-12">{fmtHora(item.turno.starts_at)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {[item.turno.paciente_apellido, item.turno.paciente_nombre].filter(Boolean).join(', ') ||
                        item.turno.paciente_telefono ||
                        '(sin datos)'}
                    </p>
                    <p className="text-xs text-[var(--color-muted-foreground)] truncate">
                      {[item.turno.paciente_obra_social, item.turno.paciente_dni && `DNI ${item.turno.paciente_dni}`]
                        .filter(Boolean)
                        .join(' · ')}
                      {item.turno.notas ? ` — ${item.turno.notas}` : ''}
                      {item.turno.origen === 'panel' ? ' · cargado a mano' : ''}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${ESTADO_CHIP[item.estadoEfectivo]?.cls ?? ''}`}>
                    {ESTADO_CHIP[item.estadoEfectivo]?.label ?? item.estadoEfectivo}
                  </span>
                  {item.estadoEfectivo === 'atendido' && (
                    <button
                      className="text-xs underline text-[var(--color-muted-foreground)]"
                      onClick={() => onAccion(() => marcarAsistencia(item.turno.id, true))}
                    >
                      no vino
                    </button>
                  )}
                  {item.estadoEfectivo === 'no_vino' && (
                    <button
                      className="text-xs underline text-[var(--color-muted-foreground)]"
                      onClick={() => onAccion(() => marcarAsistencia(item.turno.id, false))}
                    >
                      sí vino
                    </button>
                  )}
                  {item.estadoEfectivo === 'proximo' && (
                    <button
                      className="text-xs underline text-red-500"
                      onClick={() => {
                        if (window.confirm('¿Cancelar este turno?')) onAccion(() => cancelarTurnoPanel(item.turno.id))
                      }}
                    >
                      cancelar
                    </button>
                  )}
                </div>
              ) : (
                <button
                  key={`libre-${item.startsAt}`}
                  onClick={() => setSlotElegido({ fecha, hora: item.label })}
                  className="w-full flex items-center gap-3 px-4 py-2 text-left opacity-60 hover:opacity-100 hover:bg-primary/5 transition"
                >
                  <span className="font-bold tabular-nums w-12">{item.label}</span>
                  <span className="text-sm text-[var(--color-muted-foreground)]">libre — click para dar turno</span>
                  <Plus className="w-4 h-4 ml-auto" />
                </button>
              ),
            )}
            {dia.items.length === 0 && !dia.cerrado && (
              <div className="p-6 text-sm text-center text-[var(--color-muted-foreground)]">Sin turnos ni huecos para este día.</div>
            )}
          </div>

          {/* Sobreturnos del día (D3: lista sin hora, siempre visible) */}
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3 h-fit">
            <h2 className="text-sm font-semibold text-amber-600">SOBRETURNOS ({dia.sobreturnos.length})</h2>
            {dia.sobreturnos.map((s) => (
              <div key={s.id} className="rounded-xl bg-amber-500/10 p-3 text-sm space-y-1">
                <p className="font-medium">
                  {s.paciente_apellido}, {s.paciente_nombre}
                  {s.paciente_dni ? ` · DNI ${s.paciente_dni}` : ''}
                </p>
                <p className="text-xs font-bold text-amber-600 uppercase">
                  {s.cobro === 'sin_cargo' ? 'Sin cargo' : 'Particular efectivo'}
                  {s.notas ? ` — ${s.notas}` : ''}
                </p>
                {s.estado === 'pendiente' ? (
                  <div className="flex gap-3 text-xs">
                    <button className="underline" onClick={() => onAccion(() => setEstadoSobreturno(s.id, 'atendido'))}>
                      ✓ atendido
                    </button>
                    <button className="underline" onClick={() => onAccion(() => setEstadoSobreturno(s.id, 'no_vino'))}>
                      ✗ no vino
                    </button>
                    <button className="underline text-red-500" onClick={() => onAccion(() => setEstadoSobreturno(s.id, 'cancelado'))}>
                      cancelar
                    </button>
                  </div>
                ) : (
                  <p className="text-xs">{s.estado === 'atendido' ? '✓ atendido' : '✗ no vino'}</p>
                )}
              </div>
            ))}
            <button
              onClick={() => setSobreturnoOpen(true)}
              className="w-full border border-dashed border-amber-500/50 text-amber-600 rounded-xl py-2 text-sm font-medium"
            >
              + Sobreturno
            </button>
            <button
              onClick={() => {
                const nota = window.prompt('Bloquear ESTE día (vacaciones/congreso). Nota opcional:')
                if (nota !== null) onAccion(() => bloquearDias({ desde: fecha, hasta: fecha, nota }))
              }}
              className="w-full text-xs underline text-[var(--color-muted-foreground)]"
            >
              <CalendarOff className="w-3 h-3 inline mr-1" />
              Bloquear este día
            </button>
          </div>
        </div>
      )}

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
    </div>
  )
}
```

- [ ] **Step 3: `turno-manual-form.tsx`** — modal liviano (overlay propio, patrón form de la casa):

```tsx
'use client'

import { useState, type FormEvent } from 'react'
import { Loader2, X } from 'lucide-react'
import { turnoManual } from '@/actions/consultorio-agenda'

interface Props {
  fecha: string
  hora: string
  onClose: () => void
  onDone: () => void
}

export function TurnoManualForm({ fecha, hora, onClose, onDone }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [f, setF] = useState({ nombre: '', apellido: '', dni: '', obraSocial: '', telefono: '', motivo: '' })

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const r = await turnoManual({ fecha, hora, ...f })
    if ('error' in r && r.error) {
      setError(r.error)
      setLoading(false)
      return
    }
    onDone()
  }

  const input = 'w-full rounded-lg border border-border bg-[var(--color-background)] px-3 py-2 text-sm'

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-border bg-[var(--color-background)] p-5 space-y-3 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">
            Turno manual — {fecha} {hora} hs
          </h2>
          <button type="button" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>
        {error && (
          <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-500/20">
            {error}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <input className={input} placeholder="Nombre *" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
          <input className={input} placeholder="Apellido *" value={f.apellido} onChange={(e) => setF({ ...f, apellido: e.target.value })} />
        </div>
        <input className={input} placeholder="DNI (opcional — sin DNI no entra a Pacientes)" value={f.dni} onChange={(e) => setF({ ...f, dni: e.target.value })} />
        <input className={input} placeholder='Obra social * (o "particular")' value={f.obraSocial} onChange={(e) => setF({ ...f, obraSocial: e.target.value })} />
        <input className={input} placeholder="Teléfono (opcional)" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
        <input className={input} placeholder="Motivo de consulta (opcional)" value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} />
        <button
          disabled={loading}
          className="w-full rounded-xl bg-primary text-white py-2.5 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Dar turno
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: `sobreturno-form.tsx`** — misma estructura (copiar el shell del modal anterior) con campos: nombre*, apellido*, dni (opcional), obraSocial (opcional), telefono (opcional), notas (opcional) y el selector de cobro:

```tsx
'use client'

import { useState, type FormEvent } from 'react'
import { Loader2, X } from 'lucide-react'
import { crearSobreturno } from '@/actions/consultorio-agenda'

interface Props {
  fecha: string
  onClose: () => void
  onDone: () => void
}

export function SobreturnoForm({ fecha, onClose, onDone }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [f, setF] = useState({ nombre: '', apellido: '', dni: '', obraSocial: '', telefono: '', notas: '' })
  const [cobro, setCobro] = useState<'particular' | 'sin_cargo'>('particular')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const r = await crearSobreturno({ fecha, cobro, ...f })
    if ('error' in r && r.error) {
      setError(r.error)
      setLoading(false)
      return
    }
    onDone()
  }

  const input = 'w-full rounded-lg border border-border bg-[var(--color-background)] px-3 py-2 text-sm'

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-amber-500/40 bg-[var(--color-background)] p-5 space-y-3 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-amber-600">Sobreturno — {fecha} (sin hora)</h2>
          <button type="button" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>
        {error && (
          <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-500/20">
            {error}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <input className={input} placeholder="Nombre *" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
          <input className={input} placeholder="Apellido *" value={f.apellido} onChange={(e) => setF({ ...f, apellido: e.target.value })} />
        </div>
        <input className={input} placeholder="DNI (opcional)" value={f.dni} onChange={(e) => setF({ ...f, dni: e.target.value })} />
        <input className={input} placeholder="Obra social (opcional)" value={f.obraSocial} onChange={(e) => setF({ ...f, obraSocial: e.target.value })} />
        <input className={input} placeholder="Teléfono (opcional)" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
        <input className={input} placeholder="Nota (ej. urgencia, amigo)" value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} />
        <div className="flex gap-2">
          {(
            [
              ['particular', 'Particular (efectivo)'],
              ['sin_cargo', 'Sin cargo'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setCobro(v)}
              className={`flex-1 rounded-xl border py-2 text-sm ${cobro === v ? 'border-amber-500 bg-amber-500/15 text-amber-600 font-semibold' : 'border-border'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          disabled={loading}
          className="w-full rounded-xl bg-amber-500 text-white py-2.5 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Anotar sobreturno
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 5: Verificar** — `npm run typecheck` limpio · `npm run build` OK · en el browser: `/agenda` muestra tu agenda real (los turnos del E2E), click en hueco abre el form, sobreturno se anota y aparece en el panel ámbar.
- [ ] **Step 6: Commit**

```bash
cd /Users/hector/proyectos/Medicuenta-V2.0 && git add src/app/\(main\)/agenda src/features/consultorio/components/agenda && git commit -m "feat(consultorio): pantalla /agenda — día protagonista, turno manual, sobreturnos, asistencia, bloqueo"
```

---

## Task 10: Pantalla `/conversaciones` — bandeja semáforo + intervención

**Files:**
- Create: `src/app/(main)/conversaciones/page.tsx`
- Create: `src/features/consultorio/components/conversaciones/conversaciones-view.tsx`
- Create: `src/features/consultorio/components/conversaciones/hilo-panel.tsx`

- [ ] **Step 1: `page.tsx`** — wrapper server idéntico al de agenda pero renderizando `<ConversacionesView medicoId={user.id} />` (import desde `@/features/consultorio/components/conversaciones/conversaciones-view`).

- [ ] **Step 2: `conversaciones-view.tsx`** — bandeja con semáforo (D13) + polling:

```tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getBandeja, type ConversacionItem } from '@/features/consultorio/services/panelService'
import { HiloPanel } from './hilo-panel'

const POLL_MS = 15_000

const SEMAFORO_CLS: Record<string, string> = {
  alerta: 'border-l-4 border-l-red-500 bg-red-500/10',
  viva: 'border-l-4 border-l-emerald-500 bg-emerald-500/5',
  terminada: 'border-l-4 border-l-blue-400 bg-blue-500/5 opacity-80',
}

export function ConversacionesView({ medicoId }: { medicoId: string }) {
  const [items, setItems] = useState<ConversacionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [seleccionada, setSeleccionada] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const supabase = createClient()
    setItems(await getBandeja(supabase, medicoId))
    setLoading(false)
  }, [medicoId])

  useEffect(() => {
    refetch()
    const t = setInterval(refetch, POLL_MS)
    return () => clearInterval(t)
  }, [refetch])

  return (
    <div className="p-4 md:p-6 h-[calc(100dvh-8.5rem)] md:h-dvh flex flex-col">
      <h1 className="text-xl font-semibold mb-3">Conversaciones</h1>
      <div className="flex-1 min-h-0 grid gap-4 lg:grid-cols-[3fr_7fr]">
        <div className="rounded-2xl border border-border overflow-y-auto divide-y divide-border/50">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <p className="p-6 text-sm text-center text-[var(--color-muted-foreground)]">
              Todavía no hay conversaciones del asistente.
            </p>
          ) : (
            items.map((c) => (
              <button
                key={c.id}
                onClick={() => setSeleccionada(c.id)}
                className={`w-full text-left px-3 py-3 transition hover:brightness-105 ${SEMAFORO_CLS[c.semaforo]} ${
                  seleccionada === c.id ? 'ring-1 ring-primary/40' : ''
                }`}
              >
                <p className="font-medium text-sm flex items-center gap-2">
                  {c.contactoNombre || c.contactoTelefono}
                  {c.semaforo === 'alerta' && (
                    <span className="text-[10px] font-bold bg-red-600 text-white rounded-full px-2 py-0.5">
                      NECESITA ATENCIÓN
                    </span>
                  )}
                  {c.botPausado && (
                    <span className="text-[10px] font-bold bg-amber-500/20 text-amber-600 rounded-full px-2 py-0.5">⏸ BOT PAUSADO</span>
                  )}
                </p>
                <p className="text-xs text-[var(--color-muted-foreground)] truncate">{c.ultimoMensaje}</p>
              </button>
            ))
          )}
        </div>
        <div className="rounded-2xl border border-border min-h-0">
          {seleccionada ? (
            <HiloPanel medicoId={medicoId} conversacionId={seleccionada} onChange={refetch} />
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-[var(--color-muted-foreground)]">
              Elegí una conversación
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: `hilo-panel.tsx`** — hilo con colores por actor + composer con ventana + pausar/resolver:

```tsx
'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Loader2, Pause, Play, BellOff, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getHilo, type Hilo } from '@/features/consultorio/services/panelService'
import { responderComoHumano, setBotPausado, resolverAlarma } from '@/actions/consultorio-conversaciones'

const POLL_MS = 10_000

const BUBBLE: Record<string, string> = {
  paciente: 'self-start bg-[var(--color-muted,#78716c1a)] border border-border/60',
  ia: 'self-end bg-blue-500/15 border border-blue-500/25',
  humano: 'self-end bg-emerald-500/15 border border-emerald-500/30',
  medico: 'self-end bg-blue-500/15 border border-blue-500/25',
}

function horasRestantes(ms: number): string {
  return `${Math.floor(ms / 3_600_000)} h ${Math.floor((ms % 3_600_000) / 60_000)} min`
}

export function HiloPanel({ medicoId, conversacionId, onChange }: { medicoId: string; conversacionId: string; onChange: () => void }) {
  const [hilo, setHilo] = useState<Hilo | null>(null)
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const refetch = useCallback(async () => {
    const supabase = createClient()
    setHilo(await getHilo(supabase, medicoId, conversacionId))
  }, [medicoId, conversacionId])

  useEffect(() => {
    setHilo(null)
    refetch()
    const t = setInterval(refetch, POLL_MS)
    return () => clearInterval(t)
  }, [refetch])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [hilo?.mensajes.length])

  if (!hilo)
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    )

  const ventanaAbierta = hilo.msVentana > 0

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!texto.trim()) return
    setEnviando(true)
    setError(null)
    const r = await responderComoHumano({ conversacionId, texto: texto.trim() })
    if ('error' in r && r.error) setError(r.error)
    else {
      setTexto('')
      await refetch()
      onChange()
    }
    setEnviando(false)
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border/60">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">{hilo.contactoNombre || hilo.contactoTelefono}</p>
          <p className={`text-[11px] font-semibold ${ventanaAbierta ? 'text-emerald-600' : 'text-blue-500'}`}>
            {ventanaAbierta ? `● ventana abierta (cierra en ${horasRestantes(hilo.msVentana)})` : '○ ventana cerrada'}
          </p>
        </div>
        <div className="flex gap-2">
          {hilo.necesitaHumano && (
            <button
              onClick={async () => {
                await resolverAlarma(conversacionId)
                refetch()
                onChange()
              }}
              className="text-xs flex items-center gap-1 rounded-lg border border-red-500/40 text-red-500 px-2 py-1"
            >
              <BellOff className="w-3 h-3" /> Resolver
            </button>
          )}
          <button
            onClick={async () => {
              await setBotPausado(conversacionId, !hilo.botPausado)
              refetch()
              onChange()
            }}
            className={`text-xs flex items-center gap-1 rounded-lg border px-2 py-1 ${
              hilo.botPausado ? 'border-emerald-500/40 text-emerald-600' : 'border-amber-500/40 text-amber-600'
            }`}
          >
            {hilo.botPausado ? (
              <>
                <Play className="w-3 h-3" /> Reanudar asistente
              </>
            ) : (
              <>
                <Pause className="w-3 h-3" /> Pausar asistente
              </>
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
        {hilo.mensajes.map((m) => (
          <div key={m.id} className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${BUBBLE[m.origen] ?? BUBBLE.paciente}`}>
            <span className="block text-[9px] font-bold opacity-60 uppercase">
              {m.origen === 'ia' ? '🤖 asistente' : m.origen === 'humano' ? '🧑 humano' : m.origen}
              {' · '}
              {new Date(m.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
            </span>
            {m.contenido}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={enviar} className="p-3 border-t border-border/60 space-y-2">
        {error && (
          <div className="p-2 rounded-lg text-xs bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-500/20">
            {error}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            disabled={!ventanaAbierta || enviando}
            placeholder={
              ventanaAbierta
                ? hilo.botPausado
                  ? 'Escribí como humano (asistente pausado)…'
                  : 'Escribí como humano (conviene pausar el asistente primero)…'
                : 'Ventana cerrada: vas a poder responder cuando el paciente vuelva a escribir.'
            }
            className="flex-1 rounded-xl border border-border bg-[var(--color-background)] px-3 py-2 text-sm disabled:opacity-50"
          />
          <button
            disabled={!ventanaAbierta || enviando || !texto.trim()}
            className="rounded-xl bg-emerald-600 text-white px-4 disabled:opacity-50 flex items-center gap-1 text-sm font-medium"
          >
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Enviar
          </button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Verificar** — typecheck + build · en browser: la bandeja muestra las conversaciones reales con su semáforo; abrir el hilo muestra los colores por actor; con ventana cerrada el composer queda deshabilitado con la explicación.
- [ ] **Step 5: Commit**

```bash
cd /Users/hector/proyectos/Medicuenta-V2.0 && git add src/app/\(main\)/conversaciones src/features/consultorio/components/conversaciones && git commit -m "feat(consultorio): pantalla /conversaciones — bandeja semáforo, hilo por actor, respuesta humana, pausar/resolver"
```

---

## Task 11: Pantalla `/pacientes` — lista + ficha

**Files:**
- Create: `src/app/(main)/pacientes/page.tsx`
- Create: `src/features/consultorio/components/pacientes/pacientes-view.tsx`

- [ ] **Step 1: `page.tsx`** — wrapper server idéntico (renderiza `<PacientesView medicoId={user.id} />`).

- [ ] **Step 2: `pacientes-view.tsx`**:

```tsx
'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { Loader2, Search, MessageCircle, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getPacientes, getFicha, type PacienteRow, type FichaPaciente } from '@/features/consultorio/services/panelService'
import { editarPaciente } from '@/actions/consultorio-pacientes'
import { estadoEfectivoTurno } from '@/lib/consultorio/asistencia'

export function PacientesView({ medicoId }: { medicoId: string }) {
  const [q, setQ] = useState('')
  const [pacientes, setPacientes] = useState<PacienteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [ficha, setFicha] = useState<FichaPaciente | null>(null)
  const [editando, setEditando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const supabase = createClient()
    setPacientes(await getPacientes(supabase, medicoId, q))
    setLoading(false)
  }, [medicoId, q])

  useEffect(() => {
    const t = setTimeout(refetch, 250) // debounce del buscador
    return () => clearTimeout(t)
  }, [refetch])

  async function abrirFicha(id: string) {
    const supabase = createClient()
    setFicha(await getFicha(supabase, medicoId, id))
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
                      href="/conversaciones"
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
                        <span className={ef === 'no_vino' ? 'text-red-500' : ef === 'proximo' ? 'text-blue-500' : 'text-emerald-600'}>
                          {ef === 'no_vino' ? '✗ no vino' : ef === 'proximo' ? 'próximo' : '✓ atendida'}
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
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verificar** — typecheck + build · en browser: buscar por apellido y DNI funciona; la ficha muestra historial, chip de asistencia, recetas y la edición re-keyea con el aviso de DNI duplicado si corresponde.
- [ ] **Step 4: Commit**

```bash
cd /Users/hector/proyectos/Medicuenta-V2.0 && git add src/app/\(main\)/pacientes src/features/consultorio/components/pacientes && git commit -m "feat(consultorio): pantalla /pacientes — lista buscable + ficha auto-armada con historial y recetas"
```

---

## Task 12: Pantalla `/consultorio/config`

**Files:**
- Create: `src/app/(main)/consultorio/config/page.tsx`
- Create: `src/features/consultorio/components/config/config-view.tsx`
- Create: `src/features/consultorio/components/config/horarios-editor.tsx`

- [ ] **Step 1: `page.tsx`** — wrapper server idéntico (renderiza `<ConfigView medicoId={user.id} />`).

- [ ] **Step 2: `horarios-editor.tsx`** — bloques por día (varios por día = siesta):

```tsx
'use client'

import { useState } from 'react'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { guardarHorarios } from '@/actions/consultorio-config'

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

interface Bloque {
  weekday: number
  open_time: string
  close_time: string
}

export function HorariosEditor({ inicial, onSaved }: { inicial: Bloque[]; onSaved: () => void }) {
  const [bloques, setBloques] = useState<Bloque[]>(inicial.map((b) => ({ ...b, open_time: b.open_time.slice(0, 5), close_time: b.close_time.slice(0, 5) })))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function set(i: number, patch: Partial<Bloque>) {
    setBloques((bs) => bs.map((b, j) => (j === i ? { ...b, ...patch } : b)))
  }

  async function guardar() {
    setSaving(true)
    setError(null)
    const r = await guardarHorarios(bloques)
    if ('error' in r && r.error) setError(r.error)
    else onSaved()
    setSaving(false)
  }

  const input = 'rounded-lg border border-border bg-[var(--color-background)] px-2 py-1 text-sm'

  return (
    <div className="space-y-2">
      {error && (
        <div className="p-2 rounded-lg text-xs bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-500/20">{error}</div>
      )}
      {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
        <div key={wd} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="w-24 font-medium">{DIAS[wd]}</span>
          {bloques.map((b, i) =>
            b.weekday === wd ? (
              <span key={i} className="flex items-center gap-1">
                <input type="time" className={input} value={b.open_time} onChange={(e) => set(i, { open_time: e.target.value })} />
                –
                <input type="time" className={input} value={b.close_time} onChange={(e) => set(i, { close_time: e.target.value })} />
                <button onClick={() => setBloques((bs) => bs.filter((_, j) => j !== i))}>
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </button>
              </span>
            ) : null,
          )}
          <button
            onClick={() => setBloques((bs) => [...bs, { weekday: wd, open_time: '09:00', close_time: '13:00' }])}
            className="text-xs flex items-center gap-0.5 text-[var(--color-muted-foreground)] underline"
          >
            <Plus className="w-3 h-3" /> bloque
          </button>
        </div>
      ))}
      <p className="text-[11px] text-[var(--color-muted-foreground)]">
        Los turnos ya dados fuera del nuevo horario se respetan — solo cambia la oferta futura.
      </p>
      <button
        onClick={guardar}
        disabled={saving}
        className="rounded-xl bg-primary text-white px-4 py-2 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        Guardar horarios
      </button>
    </div>
  )
}
```

- [ ] **Step 3: `config-view.tsx`** — orquesta las secciones del spec §8 (cargar con `getConfig`, refetch tras cada action):

```tsx
'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Loader2, Trash2, CheckCircle2, XCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getConfig, type ConfigConsultorio } from '@/features/consultorio/services/panelService'
import {
  guardarDuracionConsulta,
  agregarOsSuspendida,
  quitarOsSuspendida,
  guardarAsistente,
} from '@/actions/consultorio-config'
import { desbloquearDias, bloquearDias } from '@/actions/consultorio-agenda'
import { HorariosEditor } from './horarios-editor'

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border p-5 space-y-3">
      <h2 className="font-semibold">{titulo}</h2>
      {children}
    </section>
  )
}

export function ConfigView({ medicoId }: { medicoId: string }) {
  const [cfg, setCfg] = useState<ConfigConsultorio | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [osNueva, setOsNueva] = useState({ nombre: '', nota: '' })
  const [bloqueo, setBloqueo] = useState({ desde: '', hasta: '', nota: '' })

  const refetch = useCallback(async () => {
    const supabase = createClient()
    setCfg(await getConfig(supabase, medicoId))
  }, [medicoId])

  useEffect(() => {
    refetch()
  }, [refetch])

  async function onAccion(fn: () => Promise<{ error?: string } | { ok: true }>) {
    const r = await fn()
    setError('error' in r && r.error ? r.error : null)
    refetch()
  }

  async function guardarAgente(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const precio = String(fd.get('precio_receta') ?? '').trim()
    await onAccion(() =>
      guardarAsistente({
        nombre_medico: String(fd.get('nombre_medico') ?? ''),
        especialidad: String(fd.get('especialidad') ?? ''),
        tono: String(fd.get('tono') ?? ''),
        saludo: String(fd.get('saludo') ?? ''),
        faqs: cfg?.agente?.faqs ?? [], // edición de FAQs: v2 del panel — hoy se preservan
        precio_receta: precio ? Number(precio.replace(/[^\d.,]/g, '').replace(',', '.')) : null,
      }),
    )
  }

  if (!cfg)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin" />
      </div>
    )

  const input = 'w-full rounded-lg border border-border bg-[var(--color-background)] px-3 py-2 text-sm'

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl">
      <h1 className="text-xl font-semibold">Config del consultorio</h1>
      {error && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-500/20">{error}</div>
      )}

      <Seccion titulo="Horarios de atención">
        <HorariosEditor inicial={cfg.horarios} onSaved={refetch} />
      </Seccion>

      <Seccion titulo="Duración de la consulta">
        <div className="flex items-center gap-2 text-sm">
          Turno cada
          <select
            defaultValue={cfg.duracionMin}
            onChange={(e) => cfg.servicioId && onAccion(() => guardarDuracionConsulta(cfg.servicioId!, Number(e.target.value)))}
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
          {cfg.excepciones.length === 0 && <p className="text-[var(--color-muted-foreground)]">Sin bloqueos próximos.</p>}
        </div>
        <div className="flex flex-wrap gap-2 items-center text-sm">
          <input type="date" className={input + ' !w-auto'} value={bloqueo.desde} onChange={(e) => setBloqueo({ ...bloqueo, desde: e.target.value })} />
          →
          <input type="date" className={input + ' !w-auto'} value={bloqueo.hasta} onChange={(e) => setBloqueo({ ...bloqueo, hasta: e.target.value })} />
          <input placeholder="Nota (congreso, vacaciones…)" className={input + ' !w-44'} value={bloqueo.nota} onChange={(e) => setBloqueo({ ...bloqueo, nota: e.target.value })} />
          <button
            onClick={() =>
              bloqueo.desde && onAccion(() => bloquearDias({ desde: bloqueo.desde, hasta: bloqueo.hasta || bloqueo.desde, nota: bloqueo.nota }))
            }
            className="rounded-xl border border-border px-3 py-1.5"
          >
            Bloquear
          </button>
        </div>
      </Seccion>

      <Seccion titulo="Obras sociales suspendidas">
        <p className="text-[11px] text-[var(--color-muted-foreground)]">
          Fuente provisoria tuya — el día que exista la app del círculo, ellos serán la fuente oficial. El bot avisa al reservar (no bloquea).
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
          <input placeholder="OSEP" className={input + ' !w-36'} value={osNueva.nombre} onChange={(e) => setOsNueva({ ...osNueva, nombre: e.target.value })} />
          <input placeholder="Nota (opcional)" className={input} value={osNueva.nota} onChange={(e) => setOsNueva({ ...osNueva, nota: e.target.value })} />
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
        <form onSubmit={guardarAgente} className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input name="nombre_medico" defaultValue={cfg.agente?.nombre_medico ?? ''} placeholder="Nombre del médico (cómo se presenta)" className={input} />
            <input name="especialidad" defaultValue={cfg.agente?.especialidad ?? ''} placeholder="Especialidad" className={input} />
          </div>
          <input name="tono" defaultValue={cfg.agente?.tono ?? ''} placeholder='Tono (ej. "cordial, claro y breve")' className={input} />
          <input name="saludo" defaultValue={cfg.agente?.saludo ?? ''} placeholder="Saludo inicial (opcional)" className={input} />
          <input name="precio_receta" defaultValue={cfg.agente?.precio_receta_default ?? ''} placeholder="Precio de la receta ($)" className={input} />
          <p className="text-[11px] text-[var(--color-muted-foreground)]">Las FAQs se editan por ahora con el equipo técnico (v2 del panel).</p>
          <button className="rounded-xl bg-primary text-white px-4 py-2 text-sm font-medium">Guardar asistente</button>
        </form>
      </Seccion>

      <Seccion titulo="Conexiones">
        <div className="flex gap-4 text-sm">
          <span className="flex items-center gap-1">
            {cfg.conexiones.whatsapp ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-red-500" />}
            WhatsApp
          </span>
          <span className="flex items-center gap-1">
            {cfg.conexiones.mercadopago ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-red-500" />}
            MercadoPago
          </span>
          <span className="flex items-center gap-1 opacity-50">
            <XCircle className="w-4 h-4" /> Google Calendar (llega en 3C)
          </span>
        </div>
      </Seccion>
    </div>
  )
}
```

- [ ] **Step 4: Verificar** — typecheck + build · en browser: cambiar duración y ver que el bot ofrezca slots nuevos; agregar/quitar una OS; editar identidad del asistente y mandarle "hola" al bot para ver el saludo nuevo.
- [ ] **Step 5: Commit**

```bash
cd /Users/hector/proyectos/Medicuenta-V2.0 && git add src/app/\(main\)/consultorio src/features/consultorio/components/config && git commit -m "feat(consultorio): pantalla /consultorio/config — horarios, duración, bloqueos, OS suspendidas, asistente, conexiones"
```

---

## Task 13: Verificación integral + prueba en vivo del panel

- [ ] **Step 1: Gates**

```bash
npm test          # Expected: 138 verdes (133 + 5 de armarDia)
npm run typecheck # Expected: sin errores
npm run build     # Expected: build OK
```

- [ ] **Step 2: Guion en browser (el dueño, con `npm run dev` corriendo):**

1. **/agenda**: se ven los turnos reales (Nora, Figueroa, Martinez) en sus días · click en hueco libre → turno manual sin DNI → aparece en la lista con "cargado a mano" · "+ Sobreturno" → aparece en el panel ámbar con su cobro · marcar "no vino" en un turno pasado y revertirlo · tira semanal con contadores correctos.
2. **/conversaciones**: bandeja con semáforo (la conversación de prueba en azul "terminada" si pasaron >24 h) · el hilo muestra los colores por actor (los mensajes 'humano' de la prueba E2E en verde) · composer deshabilitado si la ventana cerró, con la explicación.
3. **Intervención end-to-end** (necesita túnel + paciente de prueba): el paciente escribe algo → la conversación pasa a verde → "Pausar asistente" → responder desde el panel → el mensaje LLEGA al WhatsApp del paciente y queda en verde en el hilo → "Reanudar".
4. **/pacientes**: buscar "Quinteros" y por DNI · la ficha muestra historial + chip de asistencia + recetas · corregir un dato y verificar que la lista se actualiza.
5. **/consultorio/config**: cambiar duración a 20 min → pedirle horarios al bot por WhatsApp → ofrece cada 20 · bloquear un día desde config → el bot deja de ofrecerlo · agregar una OS suspendida → el bot avisa al reservar con esa OS → quitarla.
6. Revisar `wa_bitacora`: eventos `respuesta_humana`, `bot_pausado/reanudado` con `origen: 'panel'`.

- [ ] **Step 3: Commit de cierre** (si hubo ajustes en vivo).

---

## Fuera de alcance de este plan (decidido — no re-debatir)

- **Etapa 3B** (secretaria: vínculo, RLS delegada, navegación por rol, tests de seguridad) y **3C** (GCal, correlación turno→orden + 15 min, pulido desktop): planes propios.
- **Realtime** (la agenda/bandeja refrescan por polling 15 s — suficiente para un consultorio).
- **Edición de FAQs en el panel** (se preservan; editor visual = v2 del panel).
- **Notificaciones push** del panel.
- **Merge de pacientes duplicados** (la edición de DNI cubre el caso simple).

## Self-review (hecho al escribir el plan)

- **Spec §5 agenda**: día protagonista ✓ (T9) · turno manual con teléfono/DNI opcionales ✓ (T5+T9) · sobreturnos lista sin hora con cobro ✓ (T5+T9) · asistencia con "no vino" reversible ✓ · bloquear día desde agenda Y config ✓ (T5 acción compartida) · actualización sin recargar ✓ (polling) · corregir datos del paciente de un turno → cubierto vía ficha de pacientes (la edición por-turno individual queda anotada como mejora si el uso real la pide; el DNI faltante de un turno manual se completa creando el paciente desde un turno futuro o editando la ficha) — **desviación menor consciente del §5.7**.
- **Spec §6 conversaciones**: bandeja semáforo D13 ✓ (T4+T10) · colores por actor ✓ · pausar/reanudar ✓ · responder real por WhatsApp con ventana 24h ✓ (T6) · alarma se apaga al responder + botón resolver ✓ · "no enviado" → error inline (desviación anotada en decisiones) ✓.
- **Spec §7 pacientes**: lista buscable ✓ · ficha con historial/asistencia/conversación/recetas-médico-only ✓ · edición re-keyeable con aviso ✓ · sobreturnos alimentan la base ✓ (T5).
- **Spec §8 config**: horarios multi-bloque ✓ · duración (D12, sin catálogo) ✓ · bloqueos ✓ · OS suspendidas normalizadas ✓ · asistente (identidad/tono/saludo/precio; FAQs preservadas) ✓ · conexiones ✓ · secretaria = 3B ✓.
- **Notas de parte 1 pagadas**: origen/creadoPor/conversacionId ✓ (T1) · 23P01 guard ✓ (T1) · evento `_error` ✓ (T1) · anti-mudez avisar ✓ (T2) · normalización OS al insertar ✓ (T7) · bitácora con origen 'panel' en actions ✓.
- **Tipos consistentes**: `panelService` exporta `DiaSemana/DiaAgenda/SobreturnoRow/ConversacionItem/Hilo/PacienteRow/FichaPaciente/ConfigConsultorio` y las vistas los importan con esos nombres ✓ · actions devuelven `{ error?: string } | { ok: true }` y las vistas chequean `'error' in r` ✓ · `armarDia` consume `estadoEfectivoTurno` de T2-parte-1 ✓.
- **Placeholders**: Tasks 2 y 8 instruyen leer el archivo real y copiar su estructura con escape NEEDS_CONTEXT (los archivos no estaban citados textualmente al escribir el plan) — explícito, no placeholder silencioso. Todo el resto: código completo.

---

## Notas de la ejecución (2026-06-11/12) — insumo para los planes de 3B y 3C

Ejecutado completo con subagent-driven development (13 tasks, doble review por cluster + review final de integración). Todos los hallazgos de los reviews fueron plan-level (el código prescripto), no de los implementers; quedaron arreglados en los commits `49256c6`, `c077b64`, `a14b819` y `c646b2f`. **Patrones a respetar en 3B/3C (auto-blindaje):**

1. **supabase-js devuelve errores, no los lanza** — todo service de lectura debe convertirlos en `throw` (helper `ok()` en `panelService.ts`) o las pantallas muestran vacíos convincentes ante fallas en vez del banner.
2. **Refetch tras acción no debe limpiar el error de la acción** — setear el error DESPUÉS de `await refetch()` (patrón `onAccion` de `agenda-view.tsx`).
3. **Todo refetch async con polling o cambio de contexto necesita epoch guard** (`seq` ref) — sin él, una respuesta vieja pisa el estado nuevo al cambiar de día/conversación/búsqueda.
4. **El early-return de loading no debe tapar el banner de error** — en la carga inicial, renderizar `error ? banner : spinner`.
5. **Montos SIEMPRE con `parseMontoArs`** (`src/lib/recetas/normalizar.ts`) — un parser a mano convirtió "5.000" en $5; paridad panel↔bot obligatoria.
6. **Teléfonos: dualidad de formatos** — `wa_contactos.telefono` guarda el formato crudo de Meta (`549...`), `wa_pacientes.telefonos` el normalizado (`54...`). Cruzar con variantes (ver `getFicha`) o normalizar en el borde SIEMPRE (`normalizeRecipient`).
7. **Literales de estado: verificar contra el código real, no asumir** — `mp_conexiones.estado` es `'conectado'` (el plan decía `'activa'`: el badge habría quedado siempre apagado).
8. **PostgREST `.or()`: sanitizar `, ( ) "` del input del usuario** — el médico pega "Apellido, Nombre" y el filtro se rompe (400 silencioso).
9. **Hilos/listas largas: traer los N MÁS RECIENTES** (`desc` + `limit` + `reverse`), nunca `asc + limit`.
10. **Escrituras reemplaza-todo (delete+insert): insertar primero, borrar después por id** — si el insert falla, lo viejo queda (`guardarHorarios`); validar solapes antes.
11. **OS suspendidas se guardan canónicas con `normalizarOs()` en minúsculas** — el matcher normaliza ambos lados; NO uppercasear al guardar.

**Deudas conocidas anotadas (menores, no bloquean 3A):** botones de config sin guard anti-doble-click (un doble click en "Bloquear" duplica la excepción — visible y borrable) · auto-scroll del hilo salta al fondo aunque estés leyendo historia · preview de bandeja con cap de 300 mensajes puede dejar conversaciones viejas sin preview · `getDia` lanza con `fecha` malformada (hoy inalcanzable: la fecha sale de la tira) · helper `medicoAutenticado` duplicado entre action files · `error.message` crudo de Postgres puede aparecer en la UI es-AR · revert de asistencia siempre vuelve a `'reservado'` (hoy nada escribe `'confirmado'`) · pestaña abierta cruzando medianoche deja la fecha seleccionada fuera de la tira (se corrige al recargar) · burbuja `'medico'` del hilo es inalcanzable hoy (nada persiste ese origen) · `?id=` con uuid ajeno editado a mano → spinner local en el panel del hilo · texto no numérico en el precio del panel limpia a null sin aviso (el bot sí rechaza con mensaje) · select de duración solo lista valores fijos (un `duracion_min` por SQL fuera de la lista muestra "10 min").

**Para el plan 3B además:** el patrón `initialId` por searchParams (preselección de hilo) sirve igual para deep-links de la secretaria; `wa_bitacora` necesita INSERT delegado (ya anotado en parte 1).

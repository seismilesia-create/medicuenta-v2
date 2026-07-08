# Ruteo del bot por contexto/sesión + desambiguación por nombre — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el ruteo del bot de WhatsApp sea por sesión (no un binding permanente número→médico) y que, cuando no pueda resolver el médico, le pregunte al paciente por texto a qué médico le escribe (apellido → reconfirmación / lista por especialidad).

**Architecture:** Se extiende `wa_ruteo_conversacion` a una máquina de estados por `(nodo, teléfono)`: `activa | esperando_confirmacion | esperando_nombre | esperando_seleccion`. La lógica de matcheo y parseo de respuestas vive en funciones **puras** testeables (`src/lib/whatsapp/desambiguacionRuteo.ts`); la orquestación (DB + envío) se rearma en `resolverIngreso` (`nodos.ts`) devolviendo un resultado más rico que el runner consume. Todo el intercambio es **texto plano** (`sendWhatsAppText`), sin la API de listas interactivas de Meta.

**Tech Stack:** Next.js 16 + TypeScript, Supabase (service-role), Vitest (tests co-locados `*.test.ts`), Meta WhatsApp Cloud API (solo texto).

## Global Constraints

- TypeScript strict. **NUNCA `any`** — usar `unknown`. (CLAUDE.md)
- Copy en **español** rioplatense, tono del bot existente.
- Tablas de WhatsApp = infraestructura: acceso por **service-role** (bypassa RLS). El cliente Supabase llega sin tipar → se castea cada fila a mano (patrón de `nodos.ts`).
- **Invariante:** los nodos son multi-médico por diseño; el caso "1 médico" es solo una guarda defensiva/transitoria, no un camino principal.
- El marcador **`[ID:slug]` del QR gana siempre** (si viene, resuelve y setea `activa`).
- El ruteo médico-por-teléfono NO cambia (match por `numero_personal`).
- TTL de sesión por defecto **4 h** (`RUTEO_TTL_MS = 4 * 60 * 60 * 1000`), tuneable en una constante.
- Tests co-locados; correr con `npx vitest run <archivo>`. Typecheck: `npm run typecheck`.
- Única columna/cambio de schema permitido: extender `wa_ruteo_conversacion` (estado, last_activity_at, candidatos) + `medico_id` nullable.

---

### Task 1: Helpers puros de desambiguación

**Files:**
- Create: `src/lib/whatsapp/desambiguacionRuteo.ts`
- Test: `src/lib/whatsapp/desambiguacionRuteo.test.ts`

**Interfaces:**
- Produces:
  - `interface MedicoNodo { medicoId: string; nombre: string; apellido: string; especialidad: string | null; matricula: string | null }`
  - `normalizarNombre(s: string): string`
  - `matchApellido(texto: string, medicos: MedicoNodo[]): MedicoNodo[]`
  - `etiquetaMedico(m: MedicoNodo): string`
  - `interpretarConfirmacion(texto: string): 'si' | 'no' | 'ambiguo'`
  - `interpretarSeleccion(texto: string, candidatos: MedicoNodo[]): MedicoNodo | null`
  - `sesionVencida(lastActivityAtIso: string, nowMs: number, ttlMs: number): boolean`
  - `RUTEO_TTL_MS: number`

- [ ] **Step 1: Write the failing test**

Create `src/lib/whatsapp/desambiguacionRuteo.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  normalizarNombre, matchApellido, etiquetaMedico,
  interpretarConfirmacion, interpretarSeleccion, sesionVencida, RUTEO_TTL_MS,
  type MedicoNodo,
} from './desambiguacionRuteo'

const morenoJ: MedicoNodo = { medicoId: 'm1', nombre: 'Juan', apellido: 'Moreno', especialidad: 'Traumatología', matricula: '1735' }
const morenoA: MedicoNodo = { medicoId: 'm2', nombre: 'Ana', apellido: 'Moreno', especialidad: 'Clínica', matricula: '1900' }
const perez:   MedicoNodo = { medicoId: 'm3', nombre: 'Luis', apellido: 'Pérez', especialidad: null, matricula: '2100' }
const TODOS = [morenoJ, morenoA, perez]

describe('normalizarNombre', () => {
  it('minúsculas, sin acentos, sin espacios de más', () => {
    expect(normalizarNombre('  Pérez  ')).toBe('perez')
    expect(normalizarNombre('MORENO')).toBe('moreno')
  })
})

describe('matchApellido', () => {
  it('un apellido único → 1 candidato', () => {
    expect(matchApellido('perez', TODOS).map((m) => m.medicoId)).toEqual(['m3'])
  })
  it('apellido con acento sin tipearlo → matchea', () => {
    expect(matchApellido('Perez', TODOS).map((m) => m.medicoId)).toEqual(['m3'])
  })
  it('apellido compartido → varios candidatos', () => {
    expect(matchApellido('moreno', TODOS).map((m) => m.medicoId)).toEqual(['m1', 'm2'])
  })
  it('acepta "dr moreno" (ignora prefijo)', () => {
    expect(matchApellido('dr moreno', TODOS).map((m) => m.medicoId)).toEqual(['m1', 'm2'])
  })
  it('sin coincidencia → vacío', () => {
    expect(matchApellido('gomez', TODOS)).toEqual([])
  })
  it('texto vacío → vacío (no matchea todo)', () => {
    expect(matchApellido('   ', TODOS)).toEqual([])
  })
})

describe('etiquetaMedico', () => {
  it('con especialidad', () => {
    expect(etiquetaMedico(morenoJ)).toBe('Moreno, Juan — Traumatología')
  })
  it('sin especialidad usa matrícula', () => {
    expect(etiquetaMedico(perez)).toBe('Pérez, Luis (Mat. 2100)')
  })
})

describe('interpretarConfirmacion', () => {
  it('sí / mismo / dale → si', () => {
    for (const t of ['sí', 'si', 'Dale', 'mismo', 'SIGO', 'ese']) expect(interpretarConfirmacion(t)).toBe('si')
  })
  it('no / otro / diferente → no', () => {
    for (const t of ['no', 'otro', 'Otra', 'diferente', 'cambiar']) expect(interpretarConfirmacion(t)).toBe('no')
  })
  it('cualquier otra cosa → ambiguo', () => {
    expect(interpretarConfirmacion('necesito una receta')).toBe('ambiguo')
  })
})

describe('interpretarSeleccion', () => {
  const cands = [morenoJ, morenoA]
  it('por número (1-based)', () => {
    expect(interpretarSeleccion('2', cands)?.medicoId).toBe('m2')
  })
  it('número fuera de rango → null', () => {
    expect(interpretarSeleccion('5', cands)).toBeNull()
  })
  it('por nombre si desambigua a 1 entre los candidatos', () => {
    expect(interpretarSeleccion('ana', cands)?.medicoId).toBe('m2')
  })
  it('texto que no resuelve → null', () => {
    expect(interpretarSeleccion('cualquiera', cands)).toBeNull()
  })
})

describe('sesionVencida', () => {
  it('dentro del TTL → false', () => {
    const t0 = '2026-07-08T10:00:00.000Z'
    const now = Date.parse('2026-07-08T13:00:00.000Z') // 3 h después
    expect(sesionVencida(t0, now, RUTEO_TTL_MS)).toBe(false)
  })
  it('pasado el TTL → true', () => {
    const t0 = '2026-07-08T10:00:00.000Z'
    const now = Date.parse('2026-07-08T15:00:00.000Z') // 5 h después
    expect(sesionVencida(t0, now, RUTEO_TTL_MS)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/whatsapp/desambiguacionRuteo.test.ts`
Expected: FAIL (`Cannot find module './desambiguacionRuteo'`).

- [ ] **Step 3: Implement**

Create `src/lib/whatsapp/desambiguacionRuteo.ts`:

```ts
/** Lógica pura de desambiguación de ruteo del bot (matcheo por apellido + parseo de respuestas). */

export interface MedicoNodo {
  medicoId: string
  nombre: string
  apellido: string
  especialidad: string | null
  matricula: string | null
}

/** TTL de una sesión de ruteo activa: tras esta inactividad, se re-pregunta el médico. */
export const RUTEO_TTL_MS = 4 * 60 * 60 * 1000 // 4 horas

/** minúsculas, sin acentos/diacríticos, espacios colapsados, trim. */
export function normalizarNombre(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// Prefijos de cortesía que el paciente puede anteponer y no son el apellido.
const PREFIJOS = new Set(['dr', 'dra', 'doctor', 'doctora', 'el', 'la', 'con'])

/** Médicos del nodo cuyo apellido matchea el texto ingresado (normalizado, tolerante a prefijos). */
export function matchApellido(texto: string, medicos: MedicoNodo[]): MedicoNodo[] {
  const q = normalizarNombre(texto)
  if (!q) return []
  const tokens = q.split(' ').filter((t) => t && !PREFIJOS.has(t))
  if (tokens.length === 0) return []
  return medicos.filter((m) => {
    const ap = normalizarNombre(m.apellido)
    if (!ap) return false
    return tokens.some((t) => ap.includes(t) || t.includes(ap))
  })
}

/** Etiqueta legible de un médico para las preguntas del bot. */
export function etiquetaMedico(m: MedicoNodo): string {
  const base = `${m.apellido}, ${m.nombre}`.trim()
  if (m.especialidad && m.especialidad.trim()) return `${base} — ${m.especialidad.trim()}`
  if (m.matricula && m.matricula.trim()) return `${base} (Mat. ${m.matricula.trim()})`
  return base
}

const SI = new Set(['si', 'sí', 'dale', 'ok', 'oka', 'correcto', 'mismo', 'sigo', 'ese', 'esa', 'confirmo', 'es'])
const NO = new Set(['no', 'otro', 'otra', 'diferente', 'distinto', 'distinta', 'cambiar', 'nel'])

/** Interpreta una respuesta de confirmación: 'si' | 'no' | 'ambiguo'. */
export function interpretarConfirmacion(texto: string): 'si' | 'no' | 'ambiguo' {
  const q = normalizarNombre(texto)
  if (!q) return 'ambiguo'
  const primera = q.split(' ')[0]
  if (SI.has(primera) || SI.has(q)) return 'si'
  if (NO.has(primera) || NO.has(q)) return 'no'
  return 'ambiguo'
}

/** Resuelve una selección entre candidatos: por número (1-based) o por nombre si desambigua a 1. */
export function interpretarSeleccion(texto: string, candidatos: MedicoNodo[]): MedicoNodo | null {
  const q = normalizarNombre(texto)
  const num = /^(\d+)$/.exec(q)
  if (num) {
    const idx = parseInt(num[1], 10) - 1
    return candidatos[idx] ?? null
  }
  const porNombre = matchApellido(texto, candidatos)
  return porNombre.length === 1 ? porNombre[0] : null
}

/** ¿La sesión activa venció? (diferencia de instantes; independiente de zona horaria). */
export function sesionVencida(lastActivityAtIso: string, nowMs: number, ttlMs: number): boolean {
  return nowMs - Date.parse(lastActivityAtIso) > ttlMs
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/whatsapp/desambiguacionRuteo.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` (limpio), luego:

```bash
git add src/lib/whatsapp/desambiguacionRuteo.ts src/lib/whatsapp/desambiguacionRuteo.test.ts
git commit -m "feat(whatsapp): helpers puros de desambiguación de ruteo (match apellido + parseo)"
```

---

### Task 2: Migración + helpers de sesión en `wa_ruteo_conversacion`

**Files:**
- Create: `supabase/migrations/20260708_wa_ruteo_sesion.sql`
- Modify: `src/features/whatsapp/services/ruteoConversacion.ts`

**Interfaces:**
- Consumes: `MedicoNodo` de `@/lib/whatsapp/desambiguacionRuteo` (Task 1).
- Produces:
  - `type EstadoRuteo = 'activa' | 'esperando_confirmacion' | 'esperando_nombre' | 'esperando_seleccion'`
  - `interface SesionRuteo { medicoId: string | null; estado: EstadoRuteo; lastActivityAt: string; candidatos: MedicoNodo[] | null }`
  - `getSesionRuteo(db, phoneNumberId, telefonoPaciente): Promise<SesionRuteo | null>`
  - `setSesionActiva(db, phoneNumberId, telefonoPaciente, medicoId): Promise<void>`
  - `setSesionEsperando(db, phoneNumberId, telefonoPaciente, estado, opts?): Promise<void>` con `opts?: { medicoId?: string | null; candidatos?: MedicoNodo[] | null }`
  - `bumpActividad(db, phoneNumberId, telefonoPaciente): Promise<void>`
  - (Se mantienen `getRuteoMedico`/`upsertRuteoMedico` existentes intactos; se remueven en Task 4.)

- [ ] **Step 1: Crear la migración**

Create `supabase/migrations/20260708_wa_ruteo_sesion.sql`:

```sql
-- Ruteo por sesión: estado + última actividad + candidatos ofrecidos.
-- Aditivo. medico_id pasa a nullable (una sesión en 'esperando_nombre' no tiene
-- médico aún). Sobre datos existentes: las filas actuales quedan estado='activa'
-- con last_activity_at=now() (default), consistente.
alter table public.wa_ruteo_conversacion
  add column if not exists estado text not null default 'activa'
    check (estado in ('activa','esperando_confirmacion','esperando_nombre','esperando_seleccion')),
  add column if not exists last_activity_at timestamptz not null default now(),
  add column if not exists candidatos jsonb;

alter table public.wa_ruteo_conversacion alter column medico_id drop not null;
```

- [ ] **Step 2: Aplicar la migración**

NO aplicar en este task — el controller la aplica a producción con OK del usuario (patrón del proyecto). Solo se crea el archivo.

- [ ] **Step 3: Agregar los helpers de sesión**

En `src/features/whatsapp/services/ruteoConversacion.ts`, agregar el import y, debajo de las funciones existentes, los helpers de sesión:

```ts
import type { MedicoNodo } from '@/lib/whatsapp/desambiguacionRuteo'

export type EstadoRuteo = 'activa' | 'esperando_confirmacion' | 'esperando_nombre' | 'esperando_seleccion'

export interface SesionRuteo {
  medicoId: string | null
  estado: EstadoRuteo
  lastActivityAt: string
  candidatos: MedicoNodo[] | null
}

/** Sesión de ruteo (nodo, paciente) con su estado. null si no existe todavía. */
export async function getSesionRuteo(
  db: SupabaseClient,
  phoneNumberId: string,
  telefonoPaciente: string,
): Promise<SesionRuteo | null> {
  const { data } = await db
    .from('wa_ruteo_conversacion')
    .select('medico_id, estado, last_activity_at, candidatos')
    .eq('phone_number_id', phoneNumberId)
    .eq('telefono_paciente', telefonoPaciente)
    .maybeSingle()
  if (!data) return null
  const d = data as {
    medico_id: string | null
    estado: EstadoRuteo
    last_activity_at: string
    candidatos: MedicoNodo[] | null
  }
  return { medicoId: d.medico_id, estado: d.estado, lastActivityAt: d.last_activity_at, candidatos: d.candidatos }
}

/** Deja la sesión en 'activa' con el médico resuelto (limpia candidatos y refresca actividad). */
export async function setSesionActiva(
  db: SupabaseClient,
  phoneNumberId: string,
  telefonoPaciente: string,
  medicoId: string,
): Promise<void> {
  const now = new Date().toISOString()
  await db.from('wa_ruteo_conversacion').upsert(
    {
      phone_number_id: phoneNumberId,
      telefono_paciente: telefonoPaciente,
      medico_id: medicoId,
      estado: 'activa',
      last_activity_at: now,
      candidatos: null,
      updated_at: now,
    },
    { onConflict: 'phone_number_id,telefono_paciente' },
  )
}

/** Pone la sesión en un estado de espera (con candidatos opcionales para resolver la próxima respuesta). */
export async function setSesionEsperando(
  db: SupabaseClient,
  phoneNumberId: string,
  telefonoPaciente: string,
  estado: Exclude<EstadoRuteo, 'activa'>,
  opts?: { medicoId?: string | null; candidatos?: MedicoNodo[] | null },
): Promise<void> {
  const now = new Date().toISOString()
  const row: Record<string, unknown> = {
    phone_number_id: phoneNumberId,
    telefono_paciente: telefonoPaciente,
    estado,
    candidatos: opts?.candidatos ?? null,
    updated_at: now,
  }
  if (opts && 'medicoId' in opts) row.medico_id = opts.medicoId ?? null
  await db.from('wa_ruteo_conversacion').upsert(row, { onConflict: 'phone_number_id,telefono_paciente' })
}

/** Refresca last_activity_at de una sesión activa (mantiene viva la ventana del TTL). */
export async function bumpActividad(
  db: SupabaseClient,
  phoneNumberId: string,
  telefonoPaciente: string,
): Promise<void> {
  const now = new Date().toISOString()
  await db
    .from('wa_ruteo_conversacion')
    .update({ last_activity_at: now, updated_at: now })
    .eq('phone_number_id', phoneNumberId)
    .eq('telefono_paciente', telefonoPaciente)
}
```

- [ ] **Step 4: Typecheck + commit**

Run: `npm run typecheck` (limpio). Nota: la migración no está aplicada, pero estos helpers no se ejecutan aún (nadie los llama hasta Task 4), así que typecheck alcanza.

```bash
git add supabase/migrations/20260708_wa_ruteo_sesion.sql src/features/whatsapp/services/ruteoConversacion.ts
git commit -m "feat(whatsapp): sesión de ruteo (estado + last_activity + candidatos) en wa_ruteo_conversacion"
```

---

### Task 3: Servicio `getMedicosDelNodo`

**Files:**
- Modify: `src/features/whatsapp/services/nodos.ts`

**Interfaces:**
- Consumes: `MedicoNodo` de `@/lib/whatsapp/desambiguacionRuteo` (Task 1).
- Produces: `getMedicosDelNodo(db, phoneNumberId): Promise<MedicoNodo[]>` — médicos ACTIVOS del nodo con nombre/apellido/especialidad/matrícula (de `perfiles`).

- [ ] **Step 1: Agregar el import**

En `src/features/whatsapp/services/nodos.ts`, junto a los imports:

```ts
import type { MedicoNodo } from '@/lib/whatsapp/desambiguacionRuteo'
```

- [ ] **Step 2: Implementar el servicio**

Agregar (por ejemplo, después de `contarAsignacionesActivas`):

```ts
/** Médicos ACTIVOS del nodo (para desambiguar por nombre): id + datos de identidad de `perfiles`. */
export async function getMedicosDelNodo(db: SupabaseClient, phoneNumberId: string): Promise<MedicoNodo[]> {
  const { data: nodo } = await db
    .from('wa_nodos')
    .select('id')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle()
  if (!nodo) return []
  const { data: asigs } = await db
    .from('wa_asignaciones')
    .select('medico_id')
    .eq('nodo_id', (nodo as { id: string }).id)
    .eq('activo', true)
  const ids = ((asigs as { medico_id: string }[] | null) ?? []).map((a) => a.medico_id)
  if (ids.length === 0) return []
  const { data: perfiles } = await db
    .from('perfiles')
    .select('id, nombre, apellido, especialidad, matricula')
    .in('id', ids)
  return ((perfiles as {
    id: string
    nombre: string | null
    apellido: string | null
    especialidad: string | null
    matricula: string | null
  }[] | null) ?? []).map((p) => ({
    medicoId: p.id,
    nombre: p.nombre ?? '',
    apellido: p.apellido ?? '',
    especialidad: p.especialidad,
    matricula: p.matricula,
  }))
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck` (limpio).

```bash
git add src/features/whatsapp/services/nodos.ts
git commit -m "feat(whatsapp): getMedicosDelNodo (médicos activos del nodo con identidad)"
```

---

### Task 4: Máquina de estados en `resolverIngreso`

**Files:**
- Modify: `src/features/whatsapp/services/nodos.ts`

**Interfaces:**
- Consumes: helpers puros (Task 1), helpers de sesión (Task 2), `getMedicosDelNodo` (Task 3).
- Produces:
  - `type ResultadoIngreso = { tipo: 'medico'; canal: CanalResuelto } | { tipo: 'paciente'; canal: CanalResuelto; textoLimpio?: string } | { tipo: 'mensaje'; nodo: NodoCreds; texto: string } | null`
  - `resolverIngreso(db, incoming): Promise<ResultadoIngreso>` (firma de entrada igual: `{ phoneNumberId; from; text? }`).

Nota: esta task cambia el **tipo de retorno** de `resolverIngreso` (antes `IngresoResuelto | null`). El runner se adapta en Task 5. Se remueven `getRuteoMedico`/`upsertRuteoMedico` del import (ya no se usan) y `IngresoResuelto` deja de exportarse si nadie más lo usa (verificar con grep).

- [ ] **Step 1: Ajustar imports**

En `nodos.ts`, reemplazar el import de `ruteoConversacion` y agregar los puros:

```ts
import { getSesionRuteo, setSesionActiva, setSesionEsperando, bumpActividad, type SesionRuteo } from './ruteoConversacion'
import {
  matchApellido, etiquetaMedico, interpretarConfirmacion, interpretarSeleccion,
  sesionVencida, RUTEO_TTL_MS, type MedicoNodo,
} from '@/lib/whatsapp/desambiguacionRuteo'
import { esRemitenteMedico } from '@/lib/whatsapp/clasificar'
```

(El import de `esRemitenteMedico` es nuevo acá: la decisión médico-vs-paciente se centraliza en `resolverIngreso`.)

- [ ] **Step 2: Definir el tipo de resultado**

Reemplazar la interface `IngresoResuelto` (y su doc) por:

```ts
/** Resultado de resolver un mensaje entrante en el modelo de nodos. */
export type ResultadoIngreso =
  | { tipo: 'medico'; canal: CanalResuelto }
  | { tipo: 'paciente'; canal: CanalResuelto; textoLimpio?: string }
  | { tipo: 'mensaje'; nodo: NodoCreds; texto: string }
  | null
```

- [ ] **Step 3: Sub-función de respuesta a la desambiguación**

Agregar, arriba de `resolverIngreso`:

```ts
/** Interpreta la respuesta del paciente a una pregunta de desambiguación pendiente. */
async function manejarRespuestaDesambiguacion(
  db: SupabaseClient,
  nodo: NodoCreds,
  telefono: string,
  sesion: SesionRuteo,
  texto: string,
  medicos: MedicoNodo[],
): Promise<ResultadoIngreso> {
  const phoneNumberId = nodo.phoneNumberId

  if (sesion.estado === 'esperando_confirmacion') {
    const r = interpretarConfirmacion(texto)
    const cand = sesion.candidatos?.[0]
    if (r === 'si' && cand) {
      await setSesionActiva(db, phoneNumberId, telefono, cand.medicoId)
      return { tipo: 'mensaje', nodo, texto: `Listo, estás con ${etiquetaMedico(cand)} 🙌 Contame en qué te puedo ayudar.` }
    }
    if (r === 'no') {
      await setSesionEsperando(db, phoneNumberId, telefono, 'esperando_nombre', { medicoId: null })
      return { tipo: 'mensaje', nodo, texto: 'Dale. Escribí el *apellido* del médico al que le querés escribir.' }
    }
    return { tipo: 'mensaje', nodo, texto: 'Respondé *sí* o *no*, por favor 🙏' }
  }

  if (sesion.estado === 'esperando_nombre') {
    const cands = matchApellido(texto, medicos)
    if (cands.length === 0) {
      return { tipo: 'mensaje', nodo, texto: 'No encontré un médico con ese apellido en este número. Revisá el apellido o escaneá el *QR* del consultorio.' }
    }
    if (cands.length === 1) {
      await setSesionEsperando(db, phoneNumberId, telefono, 'esperando_confirmacion', { medicoId: null, candidatos: cands })
      return { tipo: 'mensaje', nodo, texto: `¿Es ${etiquetaMedico(cands[0])}? Respondé *sí* o *no*.` }
    }
    await setSesionEsperando(db, phoneNumberId, telefono, 'esperando_seleccion', { medicoId: null, candidatos: cands })
    const lista = cands.map((c, i) => `${i + 1}) ${etiquetaMedico(c)}`).join('\n')
    return { tipo: 'mensaje', nodo, texto: `Encontré varios médicos con ese apellido. ¿A cuál le escribís?\n${lista}\n\nRespondé con el *número*.` }
  }

  // esperando_seleccion
  const sel = interpretarSeleccion(texto, sesion.candidatos ?? [])
  if (!sel) {
    return { tipo: 'mensaje', nodo, texto: 'No entendí. Respondé con el *número* de la lista.' }
  }
  await setSesionActiva(db, phoneNumberId, telefono, sel.medicoId)
  return { tipo: 'mensaje', nodo, texto: `Listo, estás con ${etiquetaMedico(sel)} 🙌 Contame en qué te puedo ayudar.` }
}
```

- [ ] **Step 4: Reescribir `resolverIngreso`**

Reemplazar el cuerpo de `resolverIngreso` (desde la firma hasta su `}`), manteniendo la firma de entrada:

```ts
export async function resolverIngreso(
  db: SupabaseClient,
  incoming: { phoneNumberId: string; from: string; text?: string },
): Promise<ResultadoIngreso> {
  const phoneNumberId = incoming.phoneNumberId
  const text = incoming.text ?? ''
  const telefono = normalizeRecipient(incoming.from)

  // ¿El número que recibió es un nodo? Si no, flujo legacy puro (wa_canales 1:1).
  const nodo = await getNodoByPhoneNumberId(db, phoneNumberId)
  if (!nodo) {
    const legacy = await getCanalByPhoneNumberId(db, phoneNumberId)
    if (!legacy) return null
    return esRemitenteMedico(incoming.from, legacy.numeroPersonal)
      ? { tipo: 'medico', canal: legacy }
      : { tipo: 'paciente', canal: legacy }
  }

  // (a) Marcador [ID:slug] del 1.er mensaje: gana siempre.
  const slug = extraerIdSlug(text)
  if (slug) {
    const asig = await getAsignacionBySlug(db, slug)
    if (asig && asig.nodoPhoneNumberId === phoneNumberId) {
      await setSesionActiva(db, phoneNumberId, telefono, asig.medicoId)
      const canal = await getNodoByMedicoId(db, asig.medicoId)
      if (canal) return { tipo: 'paciente', canal, textoLimpio: limpiarMarcadorId(text) }
    }
  }

  // (a.5) El número entrante es un médico del nodo (le escribe al bot).
  const medicoPropio = await getMedicoIdPorNumeroEnNodo(db, phoneNumberId, telefono)
  if (medicoPropio) {
    const canal = await getNodoByMedicoId(db, medicoPropio)
    if (canal) return { tipo: 'medico', canal }
  }

  const medicos = await getMedicosDelNodo(db, phoneNumberId)

  // Guarda defensiva: nodo con 1 solo médico → directo, sin preguntar.
  if (medicos.length === 1) {
    await setSesionActiva(db, phoneNumberId, telefono, medicos[0].medicoId)
    const canal = await getNodoByMedicoId(db, medicos[0].medicoId)
    if (canal) return { tipo: 'paciente', canal }
  }

  const sesion = await getSesionRuteo(db, phoneNumberId, telefono)

  // (3) Hay una pregunta de desambiguación pendiente → el mensaje es la respuesta.
  if (sesion && sesion.estado !== 'activa') {
    return manejarRespuestaDesambiguacion(db, nodo, telefono, sesion, text, medicos)
  }

  // (4) Sesión activa y reciente → continuar con el médico.
  if (sesion && sesion.estado === 'activa' && sesion.medicoId && !sesionVencida(sesion.lastActivityAt, Date.now(), RUTEO_TTL_MS)) {
    const canal = await getNodoByMedicoId(db, sesion.medicoId)
    if (canal) {
      await bumpActividad(db, phoneNumberId, telefono)
      return { tipo: 'paciente', canal }
    }
  }

  // (5) Sesión activa pero vieja → preguntar "¿mismo o otro?".
  if (sesion && sesion.medicoId && sesionVencida(sesion.lastActivityAt, Date.now(), RUTEO_TTL_MS)) {
    const actual = medicos.find((m) => m.medicoId === sesion.medicoId) ?? null
    await setSesionEsperando(db, phoneNumberId, telefono, 'esperando_confirmacion', {
      medicoId: sesion.medicoId,
      candidatos: actual ? [actual] : null,
    })
    const nombre = actual ? etiquetaMedico(actual) : 'el mismo médico de antes'
    return { tipo: 'mensaje', nodo, texto: `¿Seguís con ${nombre} o es con *otro* médico? Respondé *mismo* u *otro*.` }
  }

  // (6) Sin sesión (paciente nuevo) y sin marcador → preguntar el nombre.
  await setSesionEsperando(db, phoneNumberId, telefono, 'esperando_nombre', { medicoId: null })
  return { tipo: 'mensaje', nodo, texto: '¡Hola! 👋 ¿A qué médico le escribís? Escribí su *apellido* y te conecto.' }
}
```

(Si al final del reemplazo el `if (medicos.length === 1)` no pudo resolver canal, el flujo sigue hacia sesión/pregunta — comportamiento seguro.)

- [ ] **Step 5: Limpiar código muerto**

Verificar con `grep -rn "getRuteoMedico\|upsertRuteoMedico\|IngresoResuelto" src/` que no queden usos fuera de sus definiciones. Si `IngresoResuelto` ya no se usa, eliminar su definición. `getRuteoMedico`/`upsertRuteoMedico` quedan sin usar en `nodos.ts`; se pueden dejar en `ruteoConversacion.ts` (no molestan) o eliminar si no los usa nadie más (confirmá con grep). El `contarAsignacionesActivas` puede quedar sin uso: si el grep lo confirma, eliminarlo.

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck` (limpio).

```bash
git add src/features/whatsapp/services/nodos.ts
git commit -m "feat(whatsapp): ruteo por sesión + desambiguación por nombre en resolverIngreso"
```

---

### Task 5: Rewire del runner al nuevo resultado

**Files:**
- Modify: `src/features/whatsapp/runner.ts`

**Interfaces:**
- Consumes: `ResultadoIngreso` + `resolverIngreso` (Task 4).

- [ ] **Step 1: Consumir `ResultadoIngreso` en `handleIncomingWhatsApp`**

Reemplazar el bloque que hoy hace `const resuelto = await resolverIngreso(...)` + el `if (!resuelto)` + `esRemitenteMedico(...)` (líneas ~62-88) por:

```ts
  const db = createServiceClient()
  const r = await resolverIngreso(db, incoming)
  if (!r) {
    console.warn('[wa] sin nodo/canal para phone_number_id', incoming.phoneNumberId)
    return
  }

  // Pregunta de desambiguación: respondemos por el nodo y NO ruteamos contenido.
  if (r.tipo === 'mensaje') {
    markAsRead({ phoneNumberId: r.nodo.phoneNumberId, accessToken: r.nodo.accessToken, to: incoming.from, messageId: incoming.messageId })
    await sendWhatsAppText({ phoneNumberId: r.nodo.phoneNumberId, accessToken: r.nodo.accessToken, to: incoming.from, text: r.texto })
    return
  }

  const canal = r.canal
  // El marcador [ID:slug] ya cumplió su función: lo quitamos del texto.
  if (r.tipo === 'paciente' && r.textoLimpio !== undefined) incoming.text = r.textoLimpio

  markAsRead({ phoneNumberId: canal.phoneNumberId, accessToken: canal.accessToken, to: incoming.from, messageId: incoming.messageId })

  if (r.tipo === 'medico') {
    await handleMedico(db, canal, incoming)
    return
  }
  await handlePaciente(db, canal, incoming)
}
```

- [ ] **Step 2: Eliminar `MSG_RUTEO_FALLIDO` y `avisarRuteoFallido`**

Ya no se usan (el flujo de nombre los reemplaza). Eliminar la constante `MSG_RUTEO_FALLIDO` (líneas ~42-50) y la función `avisarRuteoFallido` (líneas ~94-109). Quitar de los imports lo que quede sin uso: verificar con grep si `getNodoByPhoneNumberId`, `esMedicoDelNodo` (usados solo por `avisarRuteoFallido`) siguen usándose en `runner.ts`; si no, sacarlos del import de `@/features/whatsapp/services/nodos`. (`normalizeRecipient` puede quedar usado por otras ramas — confirmá antes de sacarlo.)

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck` (limpio).

```bash
git add src/features/whatsapp/runner.ts
git commit -m "feat(whatsapp): runner consume ResultadoIngreso (desambiguación) y elimina MSG_RUTEO_FALLIDO"
```

---

## Cierre

- [ ] **Suite + typecheck**

Run: `npm run test` (esperado: suite previa verde + los tests de `desambiguacionRuteo` nuevos) y `npm run typecheck` limpio.

- [ ] **Aplicar la migración a prod** (controller, con OK del usuario) antes de deployar: `20260708_wa_ruteo_sesion.sql`. El código de sesión falla en runtime hasta que existan las columnas.

- [ ] **E2E manual** (patrón del proyecto):
  1. Paciente NUEVO sin marcador → el bot pregunta apellido → escribe "moreno" → si hay uno, confirma "¿es el Dr. Moreno? sí" → rutea; si hay varios, lista por especialidad → elige número → rutea.
  2. Paciente escanea el QR ([ID:slug]) → rutea directo, sin preguntar.
  3. Paciente ruteado a Dr. A, escribe de nuevo <4h → sigue con A (no re-pregunta).
  4. Paciente ruteado a Dr. A, vuelve >4h → "¿mismo u otro?" → "otro" → apellido de B → confirma → **rutea a B**; verificar que el Dr. A NO ve ese mensaje.
  5. Médico escribe desde su celu → lo reconoce como médico (comandos), sin preguntar.

## Self-Review (cubierto)

- **Cobertura del spec:** máquina de estados (§3) → Task 2 (persistencia) + Task 4 (lógica) ✓; flujo §4 (marcador/médico/activa/vieja/nuevo) → Task 4 `resolverIngreso` ✓; desambiguación por nombre §5 (0/1/varios) → Task 1 `matchApellido` + Task 4 `manejarRespuestaDesambiguacion` ✓; TTL §6 → `RUTEO_TTL_MS` + `sesionVencida` (Task 1) usados en Task 4 ✓; "listo, estás con…" §7 → Task 4 ✓; modelo de datos §8 → Task 2 migración (medico_id nullable + estado/last_activity/candidatos) ✓; reemplazo de `MSG_RUTEO_FALLIDO` §7-análisis → Task 5 ✓; guarda 1-médico §10 → Task 4 ✓; médico-por-teléfono sin cambios ✓.
- **Placeholders:** ninguno — código completo en cada paso.
- **Consistencia de tipos:** `MedicoNodo` (Task 1) usado en Tasks 2/3/4; `SesionRuteo`/`EstadoRuteo` (Task 2) en Task 4; `ResultadoIngreso` (Task 4) en Task 5; helpers puros (Task 1) en Task 4. Firmas alineadas.
- **Nota de secuencia:** la migración (Task 2) no se aplica durante la implementación; se aplica en el Cierre. Los tests de Task 1 son puros (no tocan DB); Tasks 3/4/5 son typecheck + E2E manual.

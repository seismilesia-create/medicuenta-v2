# Orden de consulta OSEP — cobro de receta vía secretaria (Fase A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el paciente pueda saldar su receta electrónica por la vía de la obra social — la secretaria toma la conversación, emite la orden en OSEP (afuera) y libera la receta desde el panel; el bot entrega el PDF y queda la constancia.

**Architecture:** Se apoya en lo existente: takeover de la secretaria (`responderComoHumano`/`setBotPausado`/`necesita_humano`), entrega del PDF (`entregarReceta`), y el horario de turnos (`wa_horarios`/`wa_excepciones` + motor puro en `slots.ts`). Se agregan: un helper puro "¿hay secretaria ahora?", una tool del bot para derivar, dos server actions autorizadas como consultorio (la secretaria no ve `recetas` por RLS → van con service-role), y un botón en el panel de conversaciones.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (service-role para las tablas del bot), Vercel AI SDK (tools), zod v4, vitest.

## Global Constraints

- Nunca usar `any` (usar `unknown`). Archivos ≤500 líneas, funciones ≤50 líneas.
- Fechas/horas SIEMPRE en hora de Argentina vía los helpers existentes (`arDateString`, `weekdayOf`, `toDateMs` de `slots.ts`; `hoyArgentina` de `shared/lib/fechas`). Nunca `new Date().toISOString().split('T')[0]`.
- Las tablas del bot (`recetas`, `wa_*`) se acceden por **service-role** (bypass RLS). Toda action nueva DEBE autorizar antes con `puede_acceder_consultorio`/`resolverConsultorio` sobre el `medico_id` involucrado.
- Migraciones **aditivas** (columnas nullable), aplicadas con `mcp__supabase__apply_migration`.
- Estados de receta existentes: `pendiente_datos`, `pendiente_pago`, `pagada`, `entregada`, `vencida`, `devuelta`. Solo `pendiente_pago` es liberable.
- Reglas duras de cobro del bot vigentes: un link solo si lo devolvió `cobrar_receta` en el turno. La vía nueva NO genera link.

---

### Task 1: Migración + tipos de la constancia en `recetas`

**Files:**
- Create: `supabase/migrations/20260706_recetas_constancia_orden.sql`
- Modify: `src/features/whatsapp/services/recetasService.ts:8-26` (RecetaRow + COLS)

**Interfaces:**
- Produces: columnas `recetas.forma_pago`, `recetas.nro_orden_consulta`, `recetas.liberada_por`, `recetas.liberada_at`; `RecetaRow` con esos campos.

- [ ] **Step 1: Crear la migración**

Archivo `supabase/migrations/20260706_recetas_constancia_orden.sql`:

```sql
-- Fase A orden de consulta OSEP: constancia de la receta saldada por orden de consulta
-- (en vez de MercadoPago). Columnas nullable → migración aditiva segura.
alter table public.recetas
  add column if not exists forma_pago text
    check (forma_pago is null or forma_pago in ('mercadopago','orden_consulta','efectivo','transferencia')),
  add column if not exists nro_orden_consulta text,
  add column if not exists liberada_por uuid references auth.users(id),
  add column if not exists liberada_at timestamptz;
```

- [ ] **Step 2: Aplicar la migración a la base**

Aplicar con `mcp__supabase__apply_migration` (name: `recetas_constancia_orden`, query: el ALTER de arriba). Es aditiva sobre una tabla con datos → segura.

- [ ] **Step 3: Actualizar `RecetaRow` y `COLS`**

En `recetasService.ts`, extender la interfaz (después de `created_at: string`):

```ts
export interface RecetaRow {
  id: string
  medico_id: string
  contacto_id: string | null
  paciente_nombre: string
  paciente_dni: string
  paciente_telefono: string | null
  pdf_path: string
  nro_receta: string | null
  monto: number | null
  estado: string
  mp_preference_id: string | null
  mp_payment_id: string | null
  datos_ocr: Record<string, unknown>
  created_at: string
  forma_pago: string | null
  nro_orden_consulta: string | null
  liberada_por: string | null
  liberada_at: string | null
}
```

Y agregar los campos al string `COLS`:

```ts
const COLS =
  'id, medico_id, contacto_id, paciente_nombre, paciente_dni, paciente_telefono, pdf_path, nro_receta, monto, estado, mp_preference_id, mp_payment_id, datos_ocr, created_at, forma_pago, nro_orden_consulta, liberada_por, liberada_at'
```

- [ ] **Step 4: Verificar tipos**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260706_recetas_constancia_orden.sql src/features/whatsapp/services/recetasService.ts
git commit -m "feat(recetas): columnas de constancia para liberación por orden de consulta"
```

---

### Task 2: Helper puro `estaDentroDelHorario` (TDD)

**Files:**
- Modify: `src/lib/turnos/slots.ts` (agregar función exportada al final)
- Test: `src/lib/turnos/slots.test.ts` (agregar `describe`)

**Interfaces:**
- Consumes: `arDateString`, `weekdayOf`, `resolveDayHours`, `toDateMs` (internos de `slots.ts`), `ScheduleExceptionLite`.
- Produces: `estaDentroDelHorario(params: { ahoraMs: number; weekly: { weekday: number; open_time: string; close_time: string }[]; exceptions: ScheduleExceptionLite[] }): boolean`

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `src/lib/turnos/slots.test.ts` (importar `estaDentroDelHorario`, `weekdayOf`, `arDateString` desde `./slots`):

```ts
describe('estaDentroDelHorario', () => {
  // Derivamos el weekday del instante para no hardcodear qué día cae cada fecha.
  const bloque = (ahoraMs: number, open: string, close: string) => [{
    weekday: weekdayOf(arDateString(ahoraMs)), open_time: open, close_time: close,
  }]

  it('dentro del bloque → true', () => {
    const ahoraMs = new Date('2026-07-06T13:00:00Z').getTime() // 10:00 AR
    expect(estaDentroDelHorario({ ahoraMs, weekly: bloque(ahoraMs, '09:00', '13:00'), exceptions: [] })).toBe(true)
  })

  it('límite de apertura es inclusivo, el de cierre exclusivo', () => {
    const apertura = new Date('2026-07-06T12:00:00Z').getTime() // 09:00 AR exacto
    expect(estaDentroDelHorario({ ahoraMs: apertura, weekly: bloque(apertura, '09:00', '13:00'), exceptions: [] })).toBe(true)
    const cierre = new Date('2026-07-06T16:00:00Z').getTime() // 13:00 AR exacto
    expect(estaDentroDelHorario({ ahoraMs: cierre, weekly: bloque(cierre, '09:00', '13:00'), exceptions: [] })).toBe(false)
  })

  it('fuera del bloque → false', () => {
    const ahoraMs = new Date('2026-07-06T22:00:00Z').getTime() // 19:00 AR
    expect(estaDentroDelHorario({ ahoraMs, weekly: bloque(ahoraMs, '09:00', '13:00'), exceptions: [] })).toBe(false)
  })

  it('sin horario cargado ese día → false', () => {
    const ahoraMs = new Date('2026-07-06T13:00:00Z').getTime()
    const otroDia = (weekdayOf(arDateString(ahoraMs)) + 1) % 7
    expect(estaDentroDelHorario({ ahoraMs, weekly: [{ weekday: otroDia, open_time: '09:00', close_time: '13:00' }], exceptions: [] })).toBe(false)
  })

  it('excepción "closed" ese día → false aunque haya horario semanal', () => {
    const ahoraMs = new Date('2026-07-06T13:00:00Z').getTime()
    const date = arDateString(ahoraMs)
    expect(estaDentroDelHorario({
      ahoraMs,
      weekly: bloque(ahoraMs, '09:00', '13:00'),
      exceptions: [{ start_date: date, end_date: date, kind: 'closed', ranges: [] }],
    })).toBe(false)
  })
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm run test -- slots`
Expected: FAIL ("estaDentroDelHorario is not a function" / no exportada).

- [ ] **Step 3: Implementar el helper**

Agregar al final de `src/lib/turnos/slots.ts`:

```ts
/**
 * ¿El instante `ahoraMs` cae dentro del horario de atención (hora AR)?
 * Reusa la resolución de bloques del día (semanal + excepciones) del motor de turnos.
 * Apertura inclusiva, cierre exclusivo.
 */
export function estaDentroDelHorario(params: {
  ahoraMs: number
  weekly: { weekday: number; open_time: string; close_time: string }[]
  exceptions: ScheduleExceptionLite[]
}): boolean {
  const date = arDateString(params.ahoraMs)
  const weekday = weekdayOf(date)
  const { closed, hours } = resolveDayHours({ date, weekday, weekly: params.weekly, exceptions: params.exceptions })
  if (closed) return false
  return hours.some((h) => {
    const open = toDateMs(date, h.open_time)
    const close = toDateMs(date, h.close_time)
    return params.ahoraMs >= open && params.ahoraMs < close
  })
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm run test -- slots`
Expected: PASS (todos, incluidos los existentes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/turnos/slots.ts src/lib/turnos/slots.test.ts
git commit -m "feat(turnos): helper puro estaDentroDelHorario (reusa resolveDayHours)"
```

---

### Task 3: Servicio `secretariaDisponibleAhora`

**Files:**
- Create: `src/features/whatsapp/services/horarioSecretaria.ts`

**Interfaces:**
- Consumes: `estaDentroDelHorario` (Task 2), `ScheduleExceptionLite`.
- Produces: `secretariaDisponibleAhora(db: SupabaseClient, medicoId: string): Promise<boolean>`

- [ ] **Step 1: Implementar el servicio**

Archivo `src/features/whatsapp/services/horarioSecretaria.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { estaDentroDelHorario } from '@/lib/turnos/slots'
import type { ScheduleExceptionLite } from '@/lib/turnos/slots'

/**
 * ¿La secretaria puede atender AHORA? = ¿el instante actual (hora AR) cae dentro del
 * horario de atención del médico (el mismo que usa turnos)? Si el médico no cargó
 * horario, devuelve false (no se inventa disponibilidad → el bot solo ofrece pago).
 */
export async function secretariaDisponibleAhora(db: SupabaseClient, medicoId: string): Promise<boolean> {
  const [{ data: horarios }, { data: excepciones }] = await Promise.all([
    db.from('wa_horarios').select('weekday, open_time, close_time').eq('medico_id', medicoId),
    db.from('wa_excepciones').select('start_date, end_date, kind, ranges').eq('medico_id', medicoId),
  ])
  const weekly = (horarios as { weekday: number; open_time: string; close_time: string }[] | null) ?? []
  if (weekly.length === 0) return false
  return estaDentroDelHorario({
    ahoraMs: Date.now(),
    weekly,
    exceptions: (excepciones as ScheduleExceptionLite[] | null) ?? [],
  })
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/features/whatsapp/services/horarioSecretaria.ts
git commit -m "feat(whatsapp): secretariaDisponibleAhora (horario del médico)"
```

---

### Task 4: recetasService — liberar por orden de consulta + listar pendientes

**Files:**
- Modify: `src/features/whatsapp/services/recetasService.ts` (agregar dos funciones al final)

**Interfaces:**
- Consumes: `RecetaRow`, `COLS` (Task 1).
- Produces:
  - `getRecetasPendientesPorTelefono(db: SupabaseClient, medicoId: string, telefono: string): Promise<RecetaRow[]>`
  - `liberarPorOrdenConsulta(db: SupabaseClient, args: { medicoId: string; recetaId: string; nroOrden: string; liberadaPor: string }): Promise<RecetaRow | null>`

- [ ] **Step 1: Implementar las dos funciones**

Agregar al final de `recetasService.ts`:

```ts
/** Recetas pendientes de pago de un paciente (por su teléfono normalizado), para el panel. */
export async function getRecetasPendientesPorTelefono(
  db: SupabaseClient,
  medicoId: string,
  telefono: string,
): Promise<RecetaRow[]> {
  const { data } = await db
    .from('recetas')
    .select(COLS)
    .eq('medico_id', medicoId)
    .eq('paciente_telefono', telefono)
    .eq('estado', 'pendiente_pago')
    .order('created_at', { ascending: true })
  return (data as RecetaRow[] | null) ?? []
}

/**
 * Libera una receta por orden de consulta: registra la constancia y transiciona
 * pendiente_pago → pagada (condicional por estado, anti-doble). Devuelve la fila
 * lista para entregar, o null si no era liberable (no pendiente / ajena).
 */
export async function liberarPorOrdenConsulta(
  db: SupabaseClient,
  args: { medicoId: string; recetaId: string; nroOrden: string; liberadaPor: string },
): Promise<RecetaRow | null> {
  const { data } = await db
    .from('recetas')
    .update({
      estado: 'pagada',
      forma_pago: 'orden_consulta',
      nro_orden_consulta: args.nroOrden,
      liberada_por: args.liberadaPor,
      liberada_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('medico_id', args.medicoId)
    .eq('id', args.recetaId)
    .eq('estado', 'pendiente_pago')
    .select(COLS)
    .maybeSingle()
  return (data as RecetaRow | null) ?? null
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/features/whatsapp/services/recetasService.ts
git commit -m "feat(recetas): liberarPorOrdenConsulta + getRecetasPendientesPorTelefono"
```

---

### Task 5: Tool `solicitar_orden_consulta` + wiring en runner y systemPrompt

**Files:**
- Modify: `src/features/whatsapp/agent/tools.ts` (agregar la tool; el ctx ya incluye `db`, `medicoId`, `telefonoPaciente`, `contactoId`, `conversacionId`)
- Modify: `src/features/whatsapp/runner.ts:258-278` (calcular disponibilidad, pasarla al prompt y al ctx)
- Modify: `src/features/whatsapp/agent/systemPrompt.ts:12` (nuevo param + instrucción de las dos vías)

**Interfaces:**
- Consumes: `secretariaDisponibleAhora` (Task 3).
- Produces: tool `solicitar_orden_consulta` (sin args) que devuelve `{ ok: boolean; mensaje: string }`; `buildSystemPromptPaciente` acepta `secretariaDisponible: boolean`.

- [ ] **Step 1: Agregar la tool en `tools.ts`**

Dentro de `buildPacienteTools(ctx)`, agregar (usa el mismo patrón de `necesita_humano` que `avisar_consultorio`):

```ts
    solicitar_orden_consulta: tool({
      description:
        'El paciente quiere gestionar su receta por su OBRA SOCIAL (orden de consulta), no pagarla. Llamala cuando lo pida. Si la secretaria está disponible ahora, deriva la conversación a ella; si no, devuelve el aviso de horario. Respondé al paciente con el `mensaje` que devuelve, tal cual.',
      inputSchema: z.object({}),
      execute: async () => {
        if (!ctx.secretariaDisponible) {
          return {
            ok: false,
            mensaje:
              'La orden de consulta te la gestiona la secretaria del consultorio, en el horario de atención del médico. Si la querés ahora, la podés pagar acá; si preferís la vía obra social, escribime cuando la secretaria esté disponible 🙌',
          }
        }
        const { error } = await ctx.db
          .from('wa_conversaciones')
          .update({ necesita_humano: true, updated_at: new Date().toISOString() })
          .eq('id', ctx.conversacionId)
        if (error) {
          console.error('[wa] solicitar_orden_consulta error:', error.message)
          return { ok: false, mensaje: 'No pude avisar al consultorio. Probá de nuevo en un momento 🙏' }
        }
        return {
          ok: true,
          mensaje: 'Perfecto 🙌 Te va a atender la secretaria por este mismo chat para gestionar tu orden de consulta. Aguardá un momento.',
        }
      },
    }),
```

Notas para el implementador:
- Confirmar el nombre de la tabla de conversaciones (`wa_conversaciones`) y de la columna `id`/`necesita_humano` mirando `avisar_consultorio` en `agent/toolsConsultorio.ts` (mismo update) — replicar exactamente ese acceso.
- Agregar `secretariaDisponible: boolean` al tipo del `ctx` que arma `buildPacienteTools` (junto a `db`, `medicoId`, etc.).

- [ ] **Step 2: Calcular la disponibilidad en el runner y pasarla**

En `runner.ts`, dentro de `handlePaciente`, ANTES de armar `systemPrompt` y `toolsCtx` (≈ línea 258), agregar:

```ts
  const secretariaDisponible = await secretariaDisponibleAhora(db, canal.medicoId)
```

Importar arriba: `import { secretariaDisponibleAhora } from '@/features/whatsapp/services/horarioSecretaria'`.

Pasar `secretariaDisponible` al prompt:

```ts
  const systemPrompt = buildSystemPromptPaciente({
    config: cfgRow as ConfigAgente | null,
    contactName: incoming.contactName,
    secretariaDisponible,
  })
```

Y al `toolsCtx`:

```ts
  const toolsCtx = {
    db,
    medicoId: canal.medicoId,
    telefonoPaciente: incoming.from,
    contactoId,
    conversacionId,
    secretariaDisponible,
  }
```

- [ ] **Step 3: Instrucción de las dos vías en el systemPrompt**

En `systemPrompt.ts`, cambiar la firma:

```ts
export function buildSystemPromptPaciente(opts: { config: ConfigAgente | null; contactName?: string; secretariaDisponible?: boolean }): string {
```

Y en la sección "TU FUNCIÓN PRINCIPAL", después de la línea de `cobrar_receta` (la del link), agregar dos líneas al array:

```ts
    `- DOS VÍAS para saldar la receta: (1) PAGAR la gestión (cobrar_receta → link), o (2) gestionarla por su OBRA SOCIAL con una orden de consulta que emite la secretaria. Ofrecé ambas cuando el paciente pida la receta.`,
    opts.secretariaDisponible
      ? `- Si elige la vía OBRA SOCIAL: llamá solicitar_orden_consulta y respondé con su \`mensaje\` (la secretaria lo va a atender por el chat). No pidas vos los datos de afiliado ni el token: eso lo maneja la secretaria.`
      : `- La vía OBRA SOCIAL ahora NO está disponible (fuera del horario de la secretaria). Si el paciente la pide igual, llamá solicitar_orden_consulta y transmití su \`mensaje\` (aviso de horario). La opción disponible ahora es pagar.`,
```

- [ ] **Step 4: Verificar tipos**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/features/whatsapp/agent/tools.ts src/features/whatsapp/runner.ts src/features/whatsapp/agent/systemPrompt.ts
git commit -m "feat(whatsapp): tool solicitar_orden_consulta + vías de cobro según horario"
```

---

### Task 6: Server actions autorizadas (listar pendientes + liberar y entregar)

**Files:**
- Create: `src/actions/consultorio-recetas.ts`

**Interfaces:**
- Consumes: `resolverConsultorio`/`puede_acceder_consultorio` (patrón de `src/actions/consultorio-conversaciones.ts`), `createServiceClient`, `getRecetasPendientesPorTelefono` + `liberarPorOrdenConsulta` (Task 4), `entregarReceta` (`services/entrega.ts`), `resolverSaliente` (`services/nodos.ts`).
- Produces:
  - `getRecetasPendientesConversacion(conversacionId: string): Promise<{ recetas: { id: string; paciente_nombre: string; nro_receta: string | null; monto: number | null; created_at: string }[] } | { error: string }>`
  - `liberarReceta(input: { recetaId: string; nroOrden: string }): Promise<{ ok: true } | { error: string }>`

- [ ] **Step 1: Implementar las actions**

Archivo `src/actions/consultorio-recetas.ts`. Usa el MISMO guard que `consultorio-conversaciones.ts`: `resolverConsultorio()` (de `@/features/consultorio/access/contexto`) devuelve `{ supabase, ctx: { medicoActivoId, userId } }`. La conversación se lee con el client del usuario (RLS delegada) filtrando por `medico_id = medicoActivoId`; las `recetas` (bloqueadas para la secretaria por RLS) se tocan con service-role DESPUÉS de ese check. La autorización de la liberación la refuerza `liberarPorOrdenConsulta`, que filtra por `medico_id` → una secretaria no puede liberar la receta de otro médico.

```ts
'use server'

import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { resolverConsultorio } from '@/features/consultorio/access/contexto'
import { resolverSaliente } from '@/features/whatsapp/services/nodos'
import { getRecetasPendientesPorTelefono, liberarPorOrdenConsulta } from '@/features/whatsapp/services/recetasService'
import { entregarReceta } from '@/features/whatsapp/services/entrega'

/** Autoriza: médico operado (dueño o secretaria) + user que firma. null si no autorizado. */
async function ctxConsultorio() {
  const r = await resolverConsultorio()
  if (!r || !r.ctx.medicoActivoId) return null
  return { supabase: r.supabase, medicoId: r.ctx.medicoActivoId as string, userId: r.ctx.userId as string }
}

export async function getRecetasPendientesConversacion(conversacionId: string) {
  const c = await ctxConsultorio()
  if (!c) return { error: 'No autenticado' }
  // Autorización: la conversación debe pertenecer al médico operado (RLS delegada del user client).
  const { data: conv } = await c.supabase
    .from('wa_conversaciones')
    .select('id, contacto:wa_contactos(telefono)')
    .eq('medico_id', c.medicoId)
    .eq('id', conversacionId)
    .maybeSingle()
  if (!conv) return { error: 'Conversación no encontrada' }
  const cv = conv as unknown as { contacto: { telefono: string } | { telefono: string }[] | null }
  const contacto = Array.isArray(cv.contacto) ? cv.contacto[0] : cv.contacto
  if (!contacto?.telefono) return { error: 'La conversación no tiene teléfono asociado' }

  const db = createServiceClient()
  const recetas = await getRecetasPendientesPorTelefono(db, c.medicoId, contacto.telefono)
  return {
    recetas: recetas.map((r) => ({
      id: r.id, paciente_nombre: r.paciente_nombre, nro_receta: r.nro_receta, monto: r.monto, created_at: r.created_at,
    })),
  }
}

const liberarSchema = z.object({
  recetaId: z.string().uuid(),
  nroOrden: z.string().trim().min(1, 'Ingresá el número de orden de consulta'),
})

export async function liberarReceta(input: { recetaId: string; nroOrden: string }) {
  const c = await ctxConsultorio()
  if (!c) return { error: 'No autenticado' }
  const parsed = liberarSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const db = createServiceClient()
  // liberarPorOrdenConsulta filtra por medico_id = médico operado → una secretaria no puede
  // liberar la receta de otro médico (0 filas → null). Doble refuerzo: authz + WHERE.
  const fila = await liberarPorOrdenConsulta(db, {
    medicoId: c.medicoId,
    recetaId: parsed.data.recetaId,
    nroOrden: parsed.data.nroOrden,
    liberadaPor: c.userId,
  })
  if (!fila) return { error: 'La receta ya no está pendiente o no corresponde a este consultorio' }

  const canal = await resolverSaliente(db, fila.medico_id)
  if (canal) await entregarReceta(db, canal, fila) // best-effort: si el envío falla, la compensación deja la receta 'pagada' para reintentar
  return { ok: true as const }
}
```

Nota: `resolverConsultorio` y su forma exacta (`r.supabase`, `r.ctx.medicoActivoId`, `r.ctx.userId`) están tal cual en `consultorio-conversaciones.ts` (`ctxConversaciones`). El join `contacto:wa_contactos(telefono)` también es de ese archivo.

- [ ] **Step 2: Verificar tipos**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/actions/consultorio-recetas.ts
git commit -m "feat(consultorio): actions liberar receta por orden de consulta + entrega"
```

---

### Task 7: UI — botón "Liberar receta" en el panel de conversaciones

**Files:**
- Create: `src/features/consultorio/components/conversaciones/liberar-receta.tsx`
- Modify: `src/features/consultorio/components/conversaciones/hilo-panel.tsx` (renderizar el botón junto a los controles de toma humana)

**Interfaces:**
- Consumes: `getRecetasPendientesConversacion`, `liberarReceta` (Task 6).
- Produces: componente `<LiberarRecetaButton conversacionId={...} />`.

- [ ] **Step 1: Componente del modal**

Archivo `src/features/consultorio/components/conversaciones/liberar-receta.tsx` (client component). Debe: botón "Liberar receta por orden de consulta" → al abrir, llama `getRecetasPendientesConversacion(conversacionId)` y muestra la lista (radio: paciente + nº receta + monto + fecha); input requerido "N° de orden de consulta"; botón Confirmar → `liberarReceta({ recetaId, nroOrden })` → si `ok` cierra y muestra "Receta liberada, el bot la envió"; si `error`, lo muestra. Seguir el estilo de los otros componentes del panel (`hilo-panel.tsx`) para clases/tokens de color.

```tsx
'use client'

import { useState } from 'react'
import { getRecetasPendientesConversacion, liberarReceta } from '@/actions/consultorio-recetas'

type Pendiente = { id: string; paciente_nombre: string; nro_receta: string | null; monto: number | null; created_at: string }

export function LiberarRecetaButton({ conversacionId }: { conversacionId: string }) {
  const [abierto, setAbierto] = useState(false)
  const [pendientes, setPendientes] = useState<Pendiente[]>([])
  const [sel, setSel] = useState<string>('')
  const [nroOrden, setNroOrden] = useState('')
  const [estado, setEstado] = useState<'idle' | 'cargando' | 'guardando'>('idle')
  const [msg, setMsg] = useState<string | null>(null)

  async function abrir() {
    setAbierto(true); setEstado('cargando'); setMsg(null)
    const res = await getRecetasPendientesConversacion(conversacionId)
    setEstado('idle')
    if ('error' in res) { setMsg(res.error); return }
    setPendientes(res.recetas)
    if (res.recetas.length === 1) setSel(res.recetas[0].id)
  }

  async function confirmar() {
    if (!sel || !nroOrden.trim()) { setMsg('Elegí la receta y escribí el N° de orden.'); return }
    setEstado('guardando'); setMsg(null)
    const res = await liberarReceta({ recetaId: sel, nroOrden: nroOrden.trim() })
    setEstado('idle')
    if ('error' in res) { setMsg(res.error); return }
    setMsg('✅ Receta liberada — el bot ya se la envió al paciente.')
    setPendientes((p) => p.filter((x) => x.id !== sel)); setSel(''); setNroOrden('')
  }

  if (!abierto) {
    return (
      <button type="button" onClick={abrir}
        className="text-sm px-3 py-2 rounded-lg border border-border bg-card hover:bg-accent/50 text-foreground">
        Liberar receta por orden de consulta
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3 text-sm">
      {estado === 'cargando' ? (
        <p className="text-muted-foreground">Buscando recetas pendientes…</p>
      ) : pendientes.length === 0 ? (
        <p className="text-muted-foreground">No hay recetas pendientes de este paciente.</p>
      ) : (
        <>
          <ul className="space-y-1">
            {pendientes.map((r) => (
              <li key={r.id}>
                <label className="flex items-center gap-2">
                  <input type="radio" name="receta" checked={sel === r.id} onChange={() => setSel(r.id)} />
                  <span>{r.paciente_nombre}{r.nro_receta ? ` · N° ${r.nro_receta}` : ''}{r.monto != null ? ` · $${r.monto.toLocaleString('es-AR')}` : ''}</span>
                </label>
              </li>
            ))}
          </ul>
          <input value={nroOrden} onChange={(e) => setNroOrden(e.target.value)} placeholder="N° de orden de consulta"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground" />
          <button type="button" onClick={confirmar} disabled={estado === 'guardando'}
            className="text-sm px-3 py-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-50">
            {estado === 'guardando' ? 'Liberando…' : 'Liberar y enviar'}
          </button>
        </>
      )}
      {msg && <p className="text-muted-foreground">{msg}</p>}
      <button type="button" onClick={() => setAbierto(false)} className="text-xs text-muted-foreground underline">Cerrar</button>
    </div>
  )
}
```

- [ ] **Step 2: Renderizar en el panel**

En `hilo-panel.tsx`, importar `LiberarRecetaButton` y renderizarlo junto a los controles de toma humana (donde están los botones de `responderComoHumano`/`setBotPausado`), pasándole el `conversacionId` que ese panel ya conoce. Leer el archivo para ubicar el punto exacto y el nombre de la prop del id de conversación.

- [ ] **Step 3: Verificar tipos + build**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/features/consultorio/components/conversaciones/liberar-receta.tsx src/features/consultorio/components/conversaciones/hilo-panel.tsx
git commit -m "feat(consultorio): botón Liberar receta por orden de consulta en el panel"
```

---

### Task 8: Visibilidad del médico + verificación final

**Files:**
- Modify: `src/features/whatsapp/services/recetasService.ts` (función `resumenRecetas`: marcar las liberadas por orden de consulta)

**Interfaces:**
- Consumes: `forma_pago` de `RecetaRow`.

- [ ] **Step 1: Marcar la forma de pago en el resumen del médico**

Leer `resumenRecetas` en `recetasService.ts`. Donde arma cada línea de una receta pagada/entregada, si `forma_pago === 'orden_consulta'`, agregar un indicador (ej. "· por orden de consulta"). No cambiar los conteos; solo el detalle legible.

- [ ] **Step 2: Verificar tipos + suite completa**

Run: `npm run typecheck && npm run test`
Expected: typecheck sin errores; todos los tests verdes (incluidos los nuevos de Task 2).

- [ ] **Step 3: Commit**

```bash
git add src/features/whatsapp/services/recetasService.ts
git commit -m "feat(recetas): distinguir en el resumen del médico las liberadas por orden de consulta"
```

- [ ] **Step 4: Checklist E2E manual (no automatizable)**

Verificar en prod/preview:
1. Paciente pide receta EN horario → el bot ofrece pagar u obra social; elige obra social → llega alarma al panel, el bot dice "te atiende la secretaria".
2. Secretaria toma la conversación, toca "Liberar receta", elige la receta, pone nº de orden, confirma → el paciente recibe el PDF por WhatsApp.
3. La receta queda `forma_pago='orden_consulta'`, `nro_orden_consulta`, `liberada_por/at`; el médico la ve marcada en su resumen.
4. Paciente pide receta FUERA de horario y elige obra social → el bot devuelve el aviso de horario + opción de pago (no deriva).
5. Médico sin horario cargado → solo se ofrece pago.

---

## Notas de implementación (auto-blindaje)

- **Autorización:** ninguna action libera/lista sin pasar por el guard de consultorio sobre el `medico_id` dueño de la receta. La secretaria no ve `recetas` por RLS: todo va por service-role DESPUÉS del check.
- **Entrega best-effort:** `entregarReceta` ya tiene reclamo atómico + compensación; si el envío falla, la receta queda `pagada` para reintentar (la constancia ya quedó).
- **Determinismo del horario:** la tool `solicitar_orden_consulta` re-decide con `ctx.secretariaDisponible` (calculado server-side en el runner); no depende de que el LLM respete el horario.
- **Fase B (fuera de alcance):** crear la orden de consulta nivel 1 OSEP con hora inventada anti-15min y nota "sin atención física" — ver el spec, §10.

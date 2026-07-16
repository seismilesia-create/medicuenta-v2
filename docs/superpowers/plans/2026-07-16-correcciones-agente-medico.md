# Correcciones del agente médico post-E2E — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el agente médico conteste por la agenda de cualquier fecha o rango, y que la conversación médico↔bot deje de aparecer en la bandeja de Conversaciones.

**Architecture:** Una función pura nueva (`resolverRangoAgenda`) resuelve rango + descriptor juntos y la consume `resumenTurnos` para la query Y el encabezado; la tool `consultar_agenda` pasa a aceptar `{ desde?, hasta? }`. Aparte, una columna `es_medico` en `wa_conversaciones` que `handleMedico` marca al crear y `getBandeja` filtra.

**Tech Stack:** TypeScript, Vercel AI SDK (`tool`), Zod, Supabase (service-role), Vitest, Postgres (migración).

**Spec:** `docs/superpowers/specs/2026-07-16-correcciones-agente-medico-design.md`

## Global Constraints

- **Testing (convención del repo):** solo funciones puras (`src/lib/`) se unit-testean; los services con Supabase, `runner.ts` y `panelService.ts` NO. Verificación = `npm run typecheck` + `npm run test`. **Baseline = 389 tests.** NADA de mocks de Supabase.
- **Cada task queda con typecheck VERDE** y un commit propio.
- **Hora argentina siempre**: los límites son de día calendario AR (`00:00`/`23:59`), NO ventanas rodantes de N×24hs. Anclar con `armarStartsAtISO` (`@/lib/turnos/formato`), que valida y rechaza fechas inexistentes.
- **La rama PACIENTE no se toca**: los params nuevos llevan default que preserva el comportamiento actual byte-idéntico (mismo patrón que el `userOrigen` de `loadHistorial`).
- **No** se toca el flujo de PDF de recetas, ni el tope `MAX_LINEAS_RESUMEN = 30` (límite de 4096 chars de WhatsApp).
- **No** se agrega RLS: ocultar la conversación es un filtro de UI, decisión consciente del spec.
- Rama: `fix/agente-medico-post-e2e`.

---

### Task 1: `resolverRangoAgenda` (función pura) + test

**Files:**
- Create: `src/lib/turnos/rangoAgenda.ts`
- Create: `src/lib/turnos/rangoAgenda.test.ts`

**Interfaces:**
- Consumes: `armarStartsAtISO(fecha, hora): string | null` y `fmtFechaLarga(iso): string` de `@/lib/turnos/formato`; `AR_TZ` de `@/lib/turnos/slots`.
- Produces: `DIAS_DEFAULT = 14`; `interface RangoAgenda { desde?: string; hasta?: string }`; `resolverRangoAgenda(rango: RangoAgenda | undefined, ahoraMs: number): { desdeISO: string; hastaISO: string; descriptor: string } | { error: string }`.

Aditivo (nadie lo consume hasta la Task 2) → typecheck verde.

- [ ] **Step 1: Escribir el test (TDD)**

Crear `src/lib/turnos/rangoAgenda.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolverRangoAgenda, DIAS_DEFAULT } from './rangoAgenda'

// Jueves 16 de julio de 2026, 12:08 hora AR — el instante real del E2E que encontró el bug.
const AHORA = new Date('2026-07-16T12:08:00-03:00').getTime()

const ok = (r: ReturnType<typeof resolverRangoAgenda>) => {
  if ('error' in r) throw new Error(`esperaba rango, vino error: ${r.error}`)
  return r
}

describe('resolverRangoAgenda', () => {
  it('sin argumentos: desde ahora hasta el fin del día AR de hoy + 14', () => {
    const r = ok(resolverRangoAgenda(undefined, AHORA))
    expect(r.desdeISO).toBe(new Date(AHORA).toISOString())
    // 2026-07-16 + 14 = 2026-07-30, 23:59 AR = 2026-07-31T02:59:00.000Z
    expect(r.hastaISO).toBe('2026-07-31T02:59:00.000Z')
    expect(r.descriptor).toBe(`los próximos ${DIAS_DEFAULT} días`)
  })

  it('día único: cubre el día ENTERO (regresión del E2E: el turno de las 18:20 debe entrar)', () => {
    const r = ok(resolverRangoAgenda({ desde: '2026-07-23', hasta: '2026-07-23' }, AHORA))
    expect(r.desdeISO).toBe('2026-07-23T03:00:00.000Z') // 00:00 AR
    expect(r.hastaISO).toBe('2026-07-24T02:59:00.000Z') // 23:59 AR
    const turno1820 = new Date('2026-07-23T18:20:00-03:00').getTime()
    expect(turno1820).toBeGreaterThan(new Date(r.desdeISO).getTime())
    expect(turno1820).toBeLessThanOrEqual(new Date(r.hastaISO).getTime())
    expect(r.descriptor).toBe('el jueves 23 de julio')
  })

  it('NO usa ventana rodante: pidiendo HOY al mediodía, el techo es 23:59 de hoy', () => {
    const r = ok(resolverRangoAgenda({ desde: '2026-07-16', hasta: '2026-07-16' }, AHORA))
    expect(r.hastaISO).toBe('2026-07-17T02:59:00.000Z') // 23:59 AR de hoy, NO mediodía+24h
  })

  it('solo desde: 14 días desde esa fecha', () => {
    const r = ok(resolverRangoAgenda({ desde: '2026-07-20' }, AHORA))
    expect(r.desdeISO).toBe('2026-07-20T03:00:00.000Z')
    // 2026-07-20 + 14 = 2026-08-03, 23:59 AR
    expect(r.hastaISO).toBe('2026-08-04T02:59:00.000Z')
  })

  it('solo hasta: piso = ahora', () => {
    const r = ok(resolverRangoAgenda({ hasta: '2026-07-26' }, AHORA))
    expect(r.desdeISO).toBe(new Date(AHORA).toISOString())
    expect(r.hastaISO).toBe('2026-07-27T02:59:00.000Z')
  })

  it('rango de varios días: descriptor con los dos extremos', () => {
    const r = ok(resolverRangoAgenda({ desde: '2026-07-20', hasta: '2026-07-26' }, AHORA))
    expect(r.descriptor).toBe('del lunes 20 de julio al domingo 26 de julio')
  })

  it('fecha con formato inválido → error', () => {
    const r = resolverRangoAgenda({ desde: 'mañana' }, AHORA)
    expect(r).toHaveProperty('error')
  })

  it('fecha inexistente → error (anti-rollover)', () => {
    const r = resolverRangoAgenda({ desde: '2026-02-30' }, AHORA)
    expect(r).toHaveProperty('error')
  })

  it('hasta anterior a desde → error', () => {
    const r = resolverRangoAgenda({ desde: '2026-07-26', hasta: '2026-07-20' }, AHORA)
    expect(r).toHaveProperty('error')
  })
})
```

- [ ] **Step 2: Correr el test → falla**

Run: `npx vitest run src/lib/turnos/rangoAgenda.test.ts`
Expected: FAIL (`Cannot find module './rangoAgenda'`).

- [ ] **Step 3: Implementar**

Crear `src/lib/turnos/rangoAgenda.ts`:

```ts
/** Resolución del rango de agenda que pide el médico por WhatsApp (hora AR, día calendario). */
import { armarStartsAtISO, fmtFechaLarga } from '@/lib/turnos/formato'
import { AR_TZ } from '@/lib/turnos/slots'

/** Ventana por defecto cuando el médico pregunta genérico ("¿qué turnos tengo?"). */
export const DIAS_DEFAULT = 14

export interface RangoAgenda {
  desde?: string
  hasta?: string
}

export interface RangoResuelto {
  desdeISO: string
  hastaISO: string
  /** Texto del rango, usable tal cual en "📅 Turnos — X (3):" y en "📅 No hay turnos — X.". */
  descriptor: string
}

/** 'YYYY-MM-DD' del instante en hora AR. */
function diaAR(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: AR_TZ }).format(new Date(iso))
}

/** 'jueves 23 de julio' (fmtFechaLarga trae coma: 'jueves, 23 de julio'). */
function diaLargo(iso: string): string {
  return fmtFechaLarga(iso).replace(', ', ' ')
}

/**
 * Resuelve { desde?, hasta? } (fechas AR 'YYYY-MM-DD') a límites ISO + su descriptor.
 * El descriptor sale de la MISMA resolución que la query: así el encabezado no puede
 * mentir sobre lo que se consultó (era exactamente el bug: "próximos 7 días" hardcodeado).
 * Límites de día calendario AR, NO ventana rodante de N×24hs.
 */
export function resolverRangoAgenda(
  rango: RangoAgenda | undefined,
  ahoraMs: number,
): RangoResuelto | { error: string } {
  const desde = rango?.desde?.trim() || undefined
  const hasta = rango?.hasta?.trim() || undefined

  // Piso: 'ahora' si no pidió desde (la pregunta genérica no muestra turnos pasados);
  // si pidió desde, se honra el día completo (permite preguntar por un día puntual o pasado).
  let desdeISO: string
  if (desde) {
    const iso = armarStartsAtISO(desde, '00:00')
    if (!iso) return { error: `No entendí la fecha "${desde}". Usá el formato AAAA-MM-DD.` }
    desdeISO = iso
  } else {
    desdeISO = new Date(ahoraMs).toISOString()
  }

  // Techo: 23:59 AR de 'hasta', o de (desde ?? hoy) + DIAS_DEFAULT.
  let hastaISO: string
  if (hasta) {
    const iso = armarStartsAtISO(hasta, '23:59')
    if (!iso) return { error: `No entendí la fecha "${hasta}". Usá el formato AAAA-MM-DD.` }
    hastaISO = iso
  } else {
    const finDia = diaAR(new Date(new Date(desdeISO).getTime() + DIAS_DEFAULT * 86_400_000).toISOString())
    const iso = armarStartsAtISO(finDia, '23:59')
    if (!iso) return { error: 'No pude calcular el rango de fechas.' }
    hastaISO = iso
  }

  if (new Date(hastaISO).getTime() < new Date(desdeISO).getTime()) {
    return { error: 'El rango está al revés: la fecha de fin es anterior a la de inicio.' }
  }

  const descriptor = !desde && !hasta
    ? `los próximos ${DIAS_DEFAULT} días`
    : diaAR(desdeISO) === diaAR(hastaISO)
      ? `el ${diaLargo(desdeISO)}`
      : `del ${diaLargo(desdeISO)} al ${diaLargo(hastaISO)}`

  return { desdeISO, hastaISO, descriptor }
}
```

- [ ] **Step 4: Correr el test → pasa**

Run: `npx vitest run src/lib/turnos/rangoAgenda.test.ts`
Expected: PASS (9/9).

Si algún ISO esperado no coincide, NO ajustes el test para que pase: verificá primero cuál es el correcto (AR = UTC-3, sin DST → `00:00 AR` = `03:00Z` del mismo día; `23:59 AR` = `02:59Z` del día siguiente).

- [ ] **Step 5: Typecheck + suite**

Run: `npm run typecheck && npm run test`
Expected: sin errores, `398 passed` (389 + 9 nuevos).

- [ ] **Step 6: Commit**

```bash
git add src/lib/turnos/rangoAgenda.ts src/lib/turnos/rangoAgenda.test.ts
git commit -m "feat(turnos): resolverRangoAgenda — rango de agenda por día calendario AR + descriptor"
```

---

### Task 2: `resumenTurnos` por rango + tool `consultar_agenda`

**Files:**
- Modify: `src/features/whatsapp/services/turnosService.ts` (líneas 20, 325-375)
- Modify: `src/features/whatsapp/agent/toolsMedico.ts`

**Interfaces:**
- Consumes: `resolverRangoAgenda`, `RangoAgenda` (Task 1).
- Produces: `resumenTurnos(db, medicoId, rango?: RangoAgenda): Promise<string>` (el 3er param es opcional; `toolsMedico.ts` es su ÚNICO consumidor).

- [ ] **Step 1: Importar `resolverRangoAgenda` en `turnosService.ts`**

Agregar el import junto a los otros de `@/lib/turnos/*`:

```ts
import { resolverRangoAgenda, type RangoAgenda } from '@/lib/turnos/rangoAgenda'
```

- [ ] **Step 2: Borrar la constante muerta**

En `src/features/whatsapp/services/turnosService.ts:20`, eliminar la línea:

```ts
const DIAS_RESUMEN_MEDICO = 7
```

(La ventana ahora vive en `DIAS_DEFAULT` dentro de `rangoAgenda.ts`. `MAX_LINEAS_RESUMEN = 30` en la línea 22 **NO se toca**.)

- [ ] **Step 3: Cambiar la firma de `resumenTurnos` y resolver el rango**

Reemplazar la firma y el bloque de la query. De:

```ts
export async function resumenTurnos(db: SupabaseClient, medicoId: string): Promise<string> {
  const { data, error } = await db
    .from('wa_turnos')
    .select('starts_at, paciente_nombre, paciente_apellido, paciente_telefono, paciente_dni, paciente_obra_social, estado, notas, servicio:wa_servicios(nombre)')
    .eq('medico_id', medicoId)
    .in('estado', ['reservado', 'confirmado'])
    .gt('starts_at', new Date().toISOString())
    .lte('starts_at', new Date(Date.now() + DIAS_RESUMEN_MEDICO * 86_400_000).toISOString())
    .order('starts_at')
    .limit(MAX_LINEAS_RESUMEN)
```

a:

```ts
export async function resumenTurnos(
  db: SupabaseClient,
  medicoId: string,
  rango?: RangoAgenda,
): Promise<string> {
  const r = resolverRangoAgenda(rango, Date.now())
  if ('error' in r) return r.error
  const { data, error } = await db
    .from('wa_turnos')
    .select('starts_at, paciente_nombre, paciente_apellido, paciente_telefono, paciente_dni, paciente_obra_social, estado, notas, servicio:wa_servicios(nombre)')
    .eq('medico_id', medicoId)
    .in('estado', ['reservado', 'confirmado'])
    .gt('starts_at', r.desdeISO)
    .lte('starts_at', r.hastaISO)
    .order('starts_at')
    .limit(MAX_LINEAS_RESUMEN)
```

El `if (error) { ... }` que sigue NO se toca.

- [ ] **Step 4: Encabezado y caso vacío según el rango real**

En la misma función, reemplazar la línea del caso vacío (era la 354):

```ts
  if (rows.length === 0) return `No hay turnos agendados para los próximos ${DIAS_RESUMEN_MEDICO} días.`
```

por:

```ts
  if (rows.length === 0) return `📅 No hay turnos — ${r.descriptor}.`
```

Y el `return` final (era la 375):

```ts
  return `📅 Turnos de los próximos ${DIAS_RESUMEN_MEDICO} días (${cuenta}):\n${lineas}${corto}`
```

por:

```ts
  return `📅 Turnos — ${r.descriptor} (${cuenta}):\n${lineas}${corto}`
```

El guion es a propósito: el mismo `descriptor` tiene que servir en las dos frases, y en español "Turnos de **el** jueves" pide contracción mientras "para **de** los próximos" no — el guion evita la preposición en ambas.

- [ ] **Step 5: `consultar_agenda` acepta el rango**

En `src/features/whatsapp/agent/toolsMedico.ts`, reemplazar la tool `consultar_agenda` completa por:

```ts
    consultar_agenda: tool({
      description:
        'Agenda de turnos del médico. Pasá desde/hasta (YYYY-MM-DD, hora argentina) para una fecha o ' +
        'rango puntual ("el jueves 23", "la otra semana", "septiembre"). Sin argumentos devuelve los próximos 14 días.',
      inputSchema: z.object({
        desde: z.string().optional().describe('Fecha AR YYYY-MM-DD. Inicio del rango.'),
        hasta: z.string().optional().describe('Fecha AR YYYY-MM-DD. Fin del rango, inclusive.'),
      }),
      execute: async ({ desde, hasta }) => ({ resumen: await resumenTurnos(ctx.db, ctx.medicoId, { desde, hasta }) }),
    }),
```

(El system prompt ya le inyecta al agente la fecha de hoy en hora AR vía `fmtFechaHoraLarga(Date.now())`, así que puede resolver "el jueves 23" solo. **No se toca `systemPromptMedico.ts`.**)

- [ ] **Step 6: Typecheck + suite**

Run: `npm run typecheck && npm run test`
Expected: sin errores, `398 passed` (esta task no agrega tests: `resumenTurnos` pega a Supabase → E2E por convención).

- [ ] **Step 7: Commit**

```bash
git add src/features/whatsapp/services/turnosService.ts src/features/whatsapp/agent/toolsMedico.ts
git commit -m "feat(bot): el agente médico consulta la agenda por fecha o rango

consultar_agenda acepta {desde,hasta} y resumenTurnos resuelve los límites por día
calendario AR (adiós ventana rodante de 7x24hs, que se comía el día pedido si la
consulta caía al mediodía). El encabezado ahora describe el rango real consultado."
```

---

### Task 3: La conversación médico↔bot sale de la bandeja

**Files:**
- Create: `supabase/migrations/20260716_conversacion_medico.sql`
- Modify: `src/features/whatsapp/services/conversaciones.ts` (`ensureConversacion`)
- Modify: `src/features/whatsapp/runner.ts` (`handleMedico`)
- Modify: `src/features/consultorio/services/panelService.ts` (`getBandeja`, línea ~306)

**Interfaces:**
- Produces: `ensureConversacion(db, medicoId, contactoId, esMedico = false): Promise<string>` — el default preserva la rama paciente byte-idéntica.

- [ ] **Step 1: Migración**

Crear `supabase/migrations/20260716_conversacion_medico.sql`:

```sql
-- La conversación del MÉDICO con su propio bot no es una conversación de paciente:
-- no va en la bandeja de Conversaciones (el médico la lee en su celular).
-- Sigue existiendo porque el agente necesita el historial para el multi-turno.
ALTER TABLE wa_conversaciones ADD COLUMN es_medico BOOLEAN NOT NULL DEFAULT false;

-- Backfill: marcar las que ya existen (creadas antes de este flag).
-- Comparación por dígitos: los formatos guardados pueden diferir (+54 / 9 / 0 / 15).
UPDATE wa_conversaciones c
SET es_medico = true
FROM wa_contactos ct, wa_asignaciones a
WHERE c.contacto_id = ct.id
  AND c.medico_id = a.medico_id
  AND regexp_replace(ct.telefono, '\D', '', 'g') = regexp_replace(a.numero_personal, '\D', '', 'g');
```

- [ ] **Step 2: `ensureConversacion` marca la conversación**

En `src/features/whatsapp/services/conversaciones.ts`, reemplazar la firma y el insert de `ensureConversacion`. De:

```ts
export async function ensureConversacion(
  db: SupabaseClient,
  medicoId: string,
  contactoId: string,
): Promise<string> {
```

a:

```ts
export async function ensureConversacion(
  db: SupabaseClient,
  medicoId: string,
  contactoId: string,
  esMedico = false,
): Promise<string> {
```

Y en la misma función, el insert. De:

```ts
    .insert({ medico_id: medicoId, contacto_id: contactoId, estado: 'abierta' })
```

a:

```ts
    .insert({ medico_id: medicoId, contacto_id: contactoId, estado: 'abierta', es_medico: esMedico })
```

El `select('id')` inicial (el camino de conversación ya existente) **NO se toca**: las conversaciones médico-self viejas las cubre el backfill.

- [ ] **Step 3: `handleMedico` pasa el flag**

En `src/features/whatsapp/runner.ts`, dentro de `handleMedico`, cambiar:

```ts
  const conversacionId = await ensureConversacion(db, canal.medicoId, contactoId)
```

por:

```ts
  const conversacionId = await ensureConversacion(db, canal.medicoId, contactoId, true)
```

**Ojo:** `handlePaciente` tiene una llamada idéntica — NO la toques (tiene que seguir usando el default `false`). La de `handleMedico` es la que está arriba en el archivo, después del bloque `if (incoming.type === 'document')`.

- [ ] **Step 4: `getBandeja` la excluye**

En `src/features/consultorio/services/panelService.ts`, en `getBandeja`, agregar el filtro a la query de `wa_conversaciones`. De:

```ts
    .eq('medico_id', medicoId)
    .order('last_message_at', { ascending: false })
    .limit(50))
```

a:

```ts
    .eq('medico_id', medicoId)
    .eq('es_medico', false)
    .order('last_message_at', { ascending: false })
    .limit(50))
```

La segunda query (preview de `wa_mensajes`) filtra por los `conversacion_id` ya filtrados → **no necesita cambios**.

- [ ] **Step 5: Typecheck + suite + build**

Run: `npm run typecheck && npm run test`
Expected: sin errores, `398 passed`.

Run: `npm run build`
Expected: build limpio.

Gotcha conocido: `npm run build` togglea `next-env.d.ts` (`./.next/dev/types/` ↔ `./.next/types/`) — **NO lo stagees**. `npm run lint` está pre-roto (`next lint` mal configurado) — ignoralo.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260716_conversacion_medico.sql src/features/whatsapp/services/conversaciones.ts src/features/whatsapp/runner.ts src/features/consultorio/services/panelService.ts
git commit -m "feat(bot): la conversación médico↔bot no va en la bandeja de Conversaciones

Columna es_medico en wa_conversaciones (+ backfill por dígitos del teléfono contra
wa_asignaciones.numero_personal); handleMedico la marca al crear, getBandeja la filtra.
El médico lee ese hilo en su celular; no es una conversación de paciente y la secretaria
no tiene por qué verla. La conversación sigue existiendo: el agente necesita el historial."
```

---

## Cierre

Pendiente después de las 3 tasks (NO es parte del plan):
1. **Aplicar la migración a prod** (`20260716_conversacion_medico.sql`) — Héctor decide cuándo.
2. **E2E manual**: preguntarle al agente por "el jueves 23", "la otra semana", "septiembre" y una fecha inválida; y verificar que la conversación del médico desapareció de Conversaciones (y que las de pacientes siguen ahí).
3. Deploy: la rama `fix/agente-medico-post-e2e` mergea a `main` → dispara prod. **La migración tiene que estar aplicada ANTES del deploy**: sin la columna, `getBandeja` rompe con 42703 (columna inexistente) y la bandeja queda muerta.

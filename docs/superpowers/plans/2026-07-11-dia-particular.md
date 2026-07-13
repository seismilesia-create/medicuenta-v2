# Día particular — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El médico marca días como "todo particular" (recurrentes por día de semana + fechas puntuales); el bot avisa al paciente y la agenda los señala.

**Architecture:** Tabla nueva `wa_dias_particulares` (separada de `wa_excepciones`, que es de disponibilidad). Un helper puro `esDiaParticular(dias, fecha)` usa `weekdayOf` (hora AR). El bot lo consulta en `reservar_turno` (mismo mecanismo de aviso/confirmación que las OS suspendidas). La config gana una sección; la agenda muestra una etiqueta "Particular".

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase, TypeScript, Zod, Vitest, Tailwind, lucide-react.

## Global Constraints
- NUNCA `any`; seguí el patrón de casteo de filas Supabase existente.
- Día de la semana: `0=domingo .. 6=sábado`. Calcular SIEMPRE con `weekdayOf(fecha)` de `@/lib/turnos/slots` (hora AR), NUNCA con `new Date().getDay()`.
- El bot AVISA, no bloquea; NO revela precio; NO cambia la OS del paciente. Reusa el flag `os_confirmada` (un solo aviso cubre OS-suspendida + día-particular).
- Ortogonal a días bloqueados (`wa_excepciones`): NO se toca esa tabla ni su lógica.
- Migraciones = espejo versionado; aplicar a prod con OK de Héctor (aditiva).
- Tests: lógica pura (`esDiaParticular`) con Vitest/TDD; lo demás (DB/UI/bot) gate = typecheck+build+suite+manual.
- File naming kebab-case, funciones camelCase.

---

### Task 1 — Migración: tabla `wa_dias_particulares` + RLS

**Files:**
- Create: `supabase/migrations/20260712_dias_particulares.sql`

**Interfaces:**
- Produces: tabla `public.wa_dias_particulares (id, medico_id, tipo, dia_semana, fecha, created_at)` con RLS médico-CRUD + secretaria SELECT delegado.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/20260712_dias_particulares.sql
-- Días en que el médico atiende TODO particular (recurrente por día de semana o fecha puntual).
-- Ortogonal a wa_excepciones (disponibilidad): acá el día está abierto, solo cambia el cobro.
-- RLS espeja wa_horarios: médico CRUD; secretaria SELECT delegado (necesita verlo en la agenda).
create table if not exists public.wa_dias_particulares (
  id          uuid primary key default gen_random_uuid(),
  medico_id   uuid not null references auth.users(id) on delete cascade,
  tipo        text not null check (tipo in ('semanal','fecha')),
  dia_semana  smallint check (dia_semana between 0 and 6),  -- 0=domingo..6=sábado; null salvo tipo='semanal'
  fecha       date,                                          -- null salvo tipo='fecha'
  created_at  timestamptz not null default now(),
  check ((tipo='semanal' and dia_semana is not null and fecha is null)
      or (tipo='fecha'   and fecha is not null and dia_semana is null))
);
create index if not exists idx_wa_dias_particulares_medico on public.wa_dias_particulares(medico_id);
-- No duplicar el mismo día de semana / la misma fecha por médico:
create unique index if not exists idx_wa_dias_particulares_semanal
  on public.wa_dias_particulares(medico_id, dia_semana) where tipo='semanal';
create unique index if not exists idx_wa_dias_particulares_fecha
  on public.wa_dias_particulares(medico_id, fecha) where tipo='fecha';

alter table public.wa_dias_particulares enable row level security;
-- Escritura médico-only:
create policy "wa_dias_particulares_insert" on public.wa_dias_particulares
  for insert with check (auth.uid() = medico_id);
create policy "wa_dias_particulares_update" on public.wa_dias_particulares
  for update using (auth.uid() = medico_id) with check (auth.uid() = medico_id);
create policy "wa_dias_particulares_delete" on public.wa_dias_particulares
  for delete using (auth.uid() = medico_id);
-- Lectura delegada (médico + su secretaria activa), para la agenda:
create policy "wa_dias_particulares_select" on public.wa_dias_particulares
  for select using (public.puede_acceder_consultorio(medico_id));
```

- [ ] **Step 2: (controller) Aplicar a prod con OK de Héctor** (Supabase MCP `apply_migration`, name `dias_particulares`). NO lo hace el implementer.

- [ ] **Step 3: Verificar**

```sql
select count(*) from information_schema.columns where table_name='wa_dias_particulares';
select relrowsecurity from pg_class where relname='wa_dias_particulares';
```
Expected: 5 columnas, `relrowsecurity = true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260712_dias_particulares.sql
git commit -m "feat(dia-particular): tabla wa_dias_particulares + RLS (médico CRUD, secretaria select)"
```

---

### Task 2 — Lógica pura `esDiaParticular` (TDD)

**Files:**
- Create: `src/lib/consultorio/diasParticulares.ts`
- Test: `src/lib/consultorio/diasParticulares.test.ts`

**Interfaces:**
- Consumes: `weekdayOf(date: string): number` de `@/lib/turnos/slots` (0=domingo..6=sábado, hora AR).
- Produces:
  - `type DiaParticular = { tipo: 'semanal' | 'fecha'; dia_semana: number | null; fecha: string | null }`
  - `esDiaParticular(dias: DiaParticular[], fechaISO: string): boolean`

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/lib/consultorio/diasParticulares.test.ts
import { describe, it, expect } from 'vitest'
import { esDiaParticular, type DiaParticular } from './diasParticulares'

// 2026-07-17 es VIERNES (weekday 5) en hora AR; 2026-07-14 es MARTES.
const viernesSemanal: DiaParticular = { tipo: 'semanal', dia_semana: 5, fecha: null }
const fechaPuntual: DiaParticular = { tipo: 'fecha', dia_semana: null, fecha: '2026-07-14' }

describe('esDiaParticular', () => {
  it('true cuando la fecha coincide con una fila puntual', () => {
    expect(esDiaParticular([fechaPuntual], '2026-07-14')).toBe(true)
  })
  it('true cuando el día de la semana coincide con una fila semanal', () => {
    expect(esDiaParticular([viernesSemanal], '2026-07-17')).toBe(true) // viernes
  })
  it('false cuando ni la fecha ni el weekday coinciden', () => {
    expect(esDiaParticular([viernesSemanal, fechaPuntual], '2026-07-15')).toBe(false) // miércoles, no puntual
  })
  it('lista vacía → false', () => {
    expect(esDiaParticular([], '2026-07-17')).toBe(false)
  })
  it('combina: un viernes distinto al puntual igual es particular por la regla semanal', () => {
    expect(esDiaParticular([viernesSemanal], '2026-07-24')).toBe(true) // otro viernes
  })
})
```

- [ ] **Step 2: Correr el test (RED)**

Run: `npm test -- src/lib/consultorio/diasParticulares.test.ts`
Expected: FAIL "Cannot find module './diasParticulares'".

- [ ] **Step 3: Implementar**

```ts
// src/lib/consultorio/diasParticulares.ts
import { weekdayOf } from '@/lib/turnos/slots'

export type DiaParticular = { tipo: 'semanal' | 'fecha'; dia_semana: number | null; fecha: string | null }

/** ¿La fecha (YYYY-MM-DD, hora AR) es un día particular del médico? Por fecha puntual o por día de semana. */
export function esDiaParticular(dias: DiaParticular[], fechaISO: string): boolean {
  const wd = weekdayOf(fechaISO)
  return dias.some(
    (d) =>
      (d.tipo === 'fecha' && d.fecha === fechaISO) ||
      (d.tipo === 'semanal' && d.dia_semana === wd),
  )
}
```

- [ ] **Step 4: Correr el test (GREEN) + suite**

Run: `npm test -- src/lib/consultorio/diasParticulares.test.ts` → PASS (5).
Run: `npm test` → suite completa verde.

- [ ] **Step 5: Commit**

```bash
git add src/lib/consultorio/diasParticulares.ts src/lib/consultorio/diasParticulares.test.ts
git commit -m "feat(dia-particular): esDiaParticular (lógica pura, testeada)"
```

---

### Task 3 — Backend config: acciones + `getConfig`

**Files:**
- Modify: `src/actions/consultorio-config.ts` (agregar 3 acciones + import de `ctxDueño`/`normalizarOs` ya existentes; usar el mismo `ctxDueño`)
- Modify: `src/features/consultorio/services/panelService.ts` (tipo `ConfigConsultorio` + 9ª query en `getConfig`)

**Interfaces:**
- Consumes: `ctxDueño()` (ya en `consultorio-config.ts`).
- Produces:
  - `agregarDiaSemanalParticular(diaSemana: number): Promise<{ ok: true } | { error: string }>`
  - `agregarFechaParticular(fecha: string): Promise<{ ok: true } | { error: string }>`
  - `quitarDiaParticular(id: string): Promise<{ ok: true } | { error: string }>`
  - `ConfigConsultorio.diasParticulares: { id: string; tipo: 'semanal' | 'fecha'; dia_semana: number | null; fecha: string | null }[]`

- [ ] **Step 1: Acciones en `consultorio-config.ts`** (agregar al final, junto a `agregarOsSuspendida`)

```ts
export async function agregarDiaSemanalParticular(diaSemana: number) {
  const c = await ctxDueño()
  if ('error' in c) return c
  const { supabase, medicoId } = c
  if (!Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6) return { error: 'Día de la semana inválido' }
  const { error } = await supabase
    .from('wa_dias_particulares')
    .insert({ medico_id: medicoId, tipo: 'semanal', dia_semana: diaSemana })
  if (error) {
    if (error.code === '23505') return { error: 'Ese día ya está marcado como particular' }
    return { error: error.message }
  }
  return { ok: true as const }
}

export async function agregarFechaParticular(fecha: string) {
  const c = await ctxDueño()
  if ('error' in c) return c
  const { supabase, medicoId } = c
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: 'Fecha inválida' }
  const { error } = await supabase
    .from('wa_dias_particulares')
    .insert({ medico_id: medicoId, tipo: 'fecha', fecha })
  if (error) {
    if (error.code === '23505') return { error: 'Esa fecha ya está marcada como particular' }
    return { error: error.message }
  }
  return { ok: true as const }
}

export async function quitarDiaParticular(id: string) {
  const c = await ctxDueño()
  if ('error' in c) return c
  const { supabase, medicoId } = c
  const { error } = await supabase.from('wa_dias_particulares').delete().eq('medico_id', medicoId).eq('id', id)
  if (error) return { error: error.message }
  return { ok: true as const }
}
```

- [ ] **Step 2: `getConfig` + tipo en `panelService.ts`**

- En el `interface ConfigConsultorio` (línea ~508), agregar:
  ```ts
  diasParticulares: { id: string; tipo: 'semanal' | 'fecha'; dia_semana: number | null; fecha: string | null }[]
  ```
- En `getConfig`, sumar una 9ª entrada al `Promise.all` (junto a las otras, mismo patrón `.then(ok)`):
  ```ts
  db.from('wa_dias_particulares').select('id, tipo, dia_semana, fecha').eq('medico_id', medicoId).then(ok),
  ```
  Desestructurar el nuevo resultado (agregar la variable al array de la izquierda del `Promise.all`, p. ej. `diasPartRes`), y en el objeto de retorno agregar:
  ```ts
  diasParticulares: (diasPartRes.data as ConfigConsultorio['diasParticulares'] | null) ?? [],
  ```

- [ ] **Step 3: Verificar tipos**

Run: `npm run typecheck`
Expected: limpio (la UI todavía no usa los campos nuevos; no rompe).

- [ ] **Step 4: Commit**

```bash
git add src/actions/consultorio-config.ts src/features/consultorio/services/panelService.ts
git commit -m "feat(dia-particular): acciones agregar/quitar + getConfig expone diasParticulares"
```

---

### Task 4 — Config UI: sección "Días particulares"

**Files:**
- Modify: `src/features/consultorio/components/config/config-view.tsx`

**Interfaces:**
- Consumes: `agregarDiaSemanalParticular`, `agregarFechaParticular`, `quitarDiaParticular` (Task 3), `cfg.diasParticulares` (Task 3), `onAccion`, `Seccion`, `input`, `Trash2`.

- [ ] **Step 1: Importar las acciones** (junto a `bloquearDias`/`desbloquearDias` en el import de `@/actions/...`):

```ts
import { agregarDiaSemanalParticular, agregarFechaParticular, quitarDiaParticular } from '@/actions/consultorio-config'
```
(confirmá el path real de esas acciones — están en `consultorio-config.ts`.)

- [ ] **Step 2: Estado para la fecha puntual** (junto a `const [bloqueo, ...]`):

```tsx
  const [fechaPart, setFechaPart] = useState('')
```

- [ ] **Step 3: Agregar la Seccion** (justo después de la `<Seccion titulo="Días bloqueados">`)

```tsx
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
```

- [ ] **Step 4: Verificar tipos + build**

Run: `npm run typecheck && npm run build`
Expected: limpio.

- [ ] **Step 5: Commit**

```bash
git add src/features/consultorio/components/config/config-view.tsx
git commit -m "feat(dia-particular): sección en config (días de semana + fechas puntuales)"
```

---

### Task 5 — Bot: aviso en `reservar_turno`

**Files:**
- Modify: `src/features/whatsapp/services/turnosService.ts` (nueva `getDiasParticulares`, junto a `getOsSuspendidas`)
- Modify: `src/features/whatsapp/agent/toolsTurnos.ts` (chequeo en `reservar_turno`, después del bloque de `esOsSuspendida`)

**Interfaces:**
- Consumes: `esDiaParticular` (Task 2), `weekdayOf` (indirecto), `getOsSuspendidas` (patrón).
- Produces: `getDiasParticulares(db: SupabaseClient, medicoId: string): Promise<DiaParticular[]>`.

- [ ] **Step 1: `getDiasParticulares` en `turnosService.ts`** (espeja `getOsSuspendidas`, ~línea 297)

```ts
import { esDiaParticular, type DiaParticular } from '@/lib/consultorio/diasParticulares'

/** Días particulares del médico (recurrentes + puntuales). Para el aviso del bot. */
export async function getDiasParticulares(db: SupabaseClient, medicoId: string): Promise<DiaParticular[]> {
  const { data, error } = await db
    .from('wa_dias_particulares')
    .select('tipo, dia_semana, fecha')
    .eq('medico_id', medicoId)
  if (error) {
    console.error('[turnos] dias_particulares read error:', error.message)
    return [] // fallo de lectura ≠ bloquear: sin aviso es el degradado seguro (igual que getOsSuspendidas)
  }
  return (data as DiaParticular[] | null) ?? []
}
```

- [ ] **Step 2: Chequeo en `reservar_turno` (`toolsTurnos.ts`)**

Justo DESPUÉS del bloque `if (esOsSuspendida(...) && os_confirmada... )` (líneas ~156-170), agregar (importar `getDiasParticulares` de `turnosService` y `esDiaParticular` de `@/lib/consultorio/diasParticulares`):

```ts
        // Día particular (B3): mismo patrón que OS suspendida — avisar, no bloquear.
        // Reusa os_confirmada: un solo aviso cubre OS-suspendida + día-particular.
        const diasParticulares = await getDiasParticulares(ctx.db, ctx.medicoId)
        if (esDiaParticular(diasParticulares, fecha) && os_confirmada.trim().toLowerCase() !== 'si') {
          await registrarEvento(ctx.db, {
            medicoId: ctx.medicoId,
            origen: 'agente',
            nivel: 'info',
            evento: 'aviso_dia_particular',
            detalle: { fecha },
            conversacionId: ctx.conversacionId,
          })
          return {
            ok: false,
            error: `AVISO: ese día el profesional atiende todo de forma PARTICULAR (se abona en el consultorio). Explicáselo al paciente y preguntale si quiere reservar igual. SOLO si acepta, llamá de nuevo con os_confirmada:"si".`,
          }
        }
```
(`fecha` es el param YYYY-MM-DD de la tool; `registrarEvento` ya se usa en el bloque de OS suspendida — mismo import.)

- [ ] **Step 3: Verificar tipos + build + suite**

Run: `npm run typecheck && npm run build && npm test`
Expected: limpio; suite verde.

- [ ] **Step 4: Commit**

```bash
git add src/features/whatsapp/services/turnosService.ts src/features/whatsapp/agent/toolsTurnos.ts
git commit -m "feat(dia-particular): el bot avisa 'día particular' al reservar (reusa os_confirmada)"
```

---

### Task 6 — Agenda: etiqueta "Particular"

**Files:**
- Modify: `src/features/consultorio/services/panelService.ts` (agregar `particular` a `DiaAgenda`, `DiaAgendaSemana`, `DiaMesContador` y calcularlo en `getDia`, `getAgendaSemana`, `getMesContadores`)
- Modify: `src/features/consultorio/components/agenda/vista-dia.tsx`, `vista-semana.tsx`, `vista-mes.tsx`

**Interfaces:**
- Consumes: `esDiaParticular` (Task 2).

- [ ] **Step 1: Servicios — agregar `particular` a los 3 agregados**

En `panelService.ts`, importar `esDiaParticular` de `@/lib/consultorio/diasParticulares`. En cada una de las 3 funciones, además de lo que ya leen para `bloqueado`, leer los días particulares del médico y calcular el flag:

- **`getDia(supabase, medicoId, fecha)`** (~línea 88): agregar al tipo `DiaAgenda` `particular: boolean`; leer `db.from('wa_dias_particulares').select('tipo, dia_semana, fecha').eq('medico_id', medicoId)` y setear `particular: esDiaParticular(dias, fecha)`.
- **`getAgendaSemana(supabase, medicoId, lunes)`**: agregar `particular: boolean` a `DiaAgendaSemana`; leer la lista de días particulares una vez y para cada `d.fecha` del rango setear `particular: esDiaParticular(dias, d.fecha)`.
- **`getMesContadores(supabase, medicoId, anio, mes)`**: agregar `particular: boolean` a `DiaMesContador`; ídem, `particular: esDiaParticular(dias, fecha)` por cada fecha.

Seguí el patrón exacto con que hoy calculan `bloqueado` (query + `.some(...)`/`.maybeSingle()`), sumando la lectura de `wa_dias_particulares`.

- [ ] **Step 2: `vista-dia.tsx` — banner**

Después del banner de `dia.bloqueado` (~líneas 23-39), agregar:

```tsx
{dia.particular && (
  <div className="p-3 rounded-lg text-sm bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/30 flex items-center gap-2">
    <span className="flex-1">Día particular. El asistente le avisa al paciente que se atiende de forma particular.</span>
  </div>
)}
```

- [ ] **Step 3: `vista-semana.tsx` — etiqueta en el encabezado**

En el `<span>` de estado por día (~líneas 58-65), agregar `particular` como estado (después de `bloqueado`, antes/junto a `sobreturnos`):

```tsx
      {d.bloqueado ? (
        <span className="text-[var(--color-muted-foreground)] uppercase">bloqueado</span>
      ) : d.particular ? (
        <span className="text-violet-600 dark:text-violet-300 uppercase">particular</span>
      ) : d.sobreturnos > 0 ? (
        <span className="text-amber-600 font-medium">+{d.sobreturnos} sobret.</span>
      ) : null}
```

- [ ] **Step 4: `vista-mes.tsx` — etiqueta en la celda**

Después del bloque `{c?.bloqueado && (...)}` (~línea 63), agregar:

```tsx
{c?.particular && !c?.bloqueado && (
  <span className="block text-[10px] uppercase text-violet-600 dark:text-violet-300">particular</span>
)}
```

- [ ] **Step 5: Verificar tipos + build**

Run: `npm run typecheck && npm run build`
Expected: limpio. Si `next-env.d.ts` se auto-modifica, revertilo.

- [ ] **Step 6: Commit**

```bash
git add src/features/consultorio/services/panelService.ts src/features/consultorio/components/agenda/
git commit -m "feat(dia-particular): etiqueta 'Particular' en agenda (día/semana/mes)"
```

---

### Task 7 — Gate + verificación

- [ ] **Step 1: Suite + typecheck + build**

Run: `npm test && npm run typecheck && npm run build`
Expected: suite verde (incluye `diasParticulares.test.ts`), typecheck limpio, build OK.

- [ ] **Step 2: Verificación manual (dev server, sesión de médico)**

1. `/consultorio/config` → sección "Días particulares": tildar "Vie" → queda marcado; agregar una fecha puntual → aparece; quitarla → sale. Verificar en DB (`wa_dias_particulares`) que las filas tienen `tipo`/`dia_semana`/`fecha` correctos.
2. `/agenda`: un viernes (o la fecha puntual) muestra la etiqueta "Particular" en vista día, semana y mes.
3. Bot (opcional, WhatsApp): paciente pide turno un viernes marcado, con OS → el bot avisa "ese día es particular" y reserva si acepta; un día no-particular → sin aviso.

- [ ] **Step 3: Actualizar memoria**

Anotar que B3 (día particular) quedó implementado; queda B4 (system prompt endurecido).

---

## Self-Review (cobertura del spec)
- §1 tabla `wa_dias_particulares` + RLS → Task 1. ✅
- §2 `esDiaParticular` puro → Task 2. ✅
- §3 config UI (semanales + puntuales) → Tasks 3 + 4. ✅
- §4 bot avisa (reusa os_confirmada) → Task 5. ✅
- §5 agenda etiqueta → Task 6. ✅
- §Testing → Tasks 2 (unit) + 7 (manual). ✅
- Fuera de alcance (órdenes, precios, excepciones a la regla, días bloqueados) → respetado.

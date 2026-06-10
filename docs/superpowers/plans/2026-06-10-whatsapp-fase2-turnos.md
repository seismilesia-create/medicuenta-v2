# WhatsApp Fase 2 — Turnos · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El paciente agenda, consulta y cancela turnos hablándole al bot de WhatsApp; el motor de slots calcula disponibilidad real (horario semanal + excepciones − turnos ocupados); el médico ve su agenda con el comando `turnos` — todo re-keyeado a `medico_id` y con anti-overbooking a nivel base de datos.

**Architecture:** Se porta el motor de turnos de `~/proyectos/Agente_Whatsapp` (repo ORIGEN, **no se toca**, solo se copia): `slots.ts` (lógica pura) va 1:1 a `src/lib/turnos/`; el camino de datos service-role (`admin-data.ts` del origen) se reescribe como `turnosService.ts` filtrando `medico_id` a mano (patrón Fase 0/1). El agente del paciente gana 3 tools (`consultar_disponibilidad`, `reservar_turno`, `cancelar_turno`) que se componen con las de recetas en el runner. La última línea anti-overbooking es un constraint `EXCLUDE USING gist` en la DB (atrapa la carrera entre dos reservas simultáneas que el chequeo en app no ve).

**Tech Stack:** Next.js 16 route handlers (nodejs) · `ai ^6` tools Zod + `stopWhen` · OpenRouter → Claude Haiku 4.5 · Supabase (service-role, RLS `auth.uid()=medico_id`, `btree_gist`) · vitest.

**Spec:** `docs/superpowers/specs/2026-06-09-whatsapp-recetas-turnos-design.md` §7 y §4 (tablas Fase 2).

---

## Decisiones de implementación (concretan el spec, anotar si se discute)

- **Recordatorios de confirmación (cron + plantilla HSM): DIFERIDOS a producción** — decisión del dueño (2026-06-10). El recordatorio proactivo cae casi siempre fuera de la ventana de 24h → necesita plantilla HSM aprobada + cron productivo, y toda la infra paga se hace al final. El schema queda preparado (estado `confirmado` definido) pero NO se porta `confirmations.ts` ni el cron.
- **`cancelar_turno` SÍ se agrega** (no estaba en el motor origen) — decisión del dueño (2026-06-10). El paciente cancela SOLO sus propios turnos: el candado es `paciente_telefono` = el número de WhatsApp desde el que escribe.
- **Camino con sesión (el `services.ts` del origen) y UI del panel: Fase 3.** Acá se construye solo el camino service-role que usa el bot. El RLS de las 4 tablas queda definido desde ya en la migración (el panel de Fase 3 lo va a usar tal cual).
- **Google Calendar NO se porta** (spec §7: la agenda vive en la DB).
- **Catálogo simplificado:** `wa_servicios` solo tiene nombre/duración/precio-informativo/activo. Sin `kind` producto/servicio, sin media, sin stock, sin attributes (eso era del SaaS general multi-rubro; un consultorio no vende productos).
- **`kind` de excepciones queda en inglés** (`'closed' | 'custom' | 'open'`): `slots.ts` se porta 1:1 y su API usa esos literales — cero capa de mapeo, cero bugs de traducción. Los nombres de columnas que `slots.ts` consume (`weekday`, `open_time`, `close_time`, `start_date`, `end_date`, `ranges`) también se conservan.
- **Estados de `wa_turnos` en español** (molde MediCuenta, CHECK no enum): `reservado | confirmado | cancelado | completado | ausente`. Fase 2 solo usa `reservado`/`cancelado`; los otros quedan definidos para producción (recordatorios, no-show).
- **Sin `business_config`:** `time_format` y `confirmation_*` del origen eran del panel y de los recordatorios → Fase 3/producción. La config de turnos del médico vive en `wa_servicios` + `wa_horarios`.
- **Ventana de búsqueda 14 días** (constante editable), la tool muestra los primeros **5 días con horarios** y hasta **24 slots por día** (caps del origen). El origen buscaba 60 días: para un consultorio es ruido y queries más pesadas.
- **Mejora sobre el origen (bug heredado):** la query de "ocupados" toma también turnos que EMPEZARON antes de ahora pero siguen en curso (`ends_at > now`); el origen filtraba por `starts_at >= now` y perdía el solape con un turno en curso.
- **Configuración de horarios del médico: seed script** (`scripts/seed-wa-turnos.mjs`, patrón de `seed-wa-canal.mjs`). La carga self-service llega con el panel (Fase 3).
- **Doble validación de reserva** (cinturón y tiradores, como el origen): (1) en app, `esSlotOfrecido` re-calcula slots y exige que fecha+hora sea EXACTAMENTE un slot ofrecido (anti-horario-inventado por la IA); (2) en DB, el constraint EXCLUDE rechaza el solape si dos reservas ganan la carrera al mismo tiempo (error `23P01` → "ese horario ya fue tomado").

## Prerrequisitos externos (el dueño)

1. **Aplicar la migración** (Task 1) en el SQL Editor de Supabase (proyecto `eylcrxhpccwobipcjzal`) — mismo procedimiento que Fases 0/1.
2. Para la prueba E2E en vivo (Task 9): el **token temporal de Meta puede estar vencido** (vence en horas) → renovarlo en el panel de la app "MediCuenta" y re-correr `scripts/seed-wa-canal.mjs`; si el túnel cloudflared se reinició, **reconfigurar la URL del webhook** en Meta.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20260610_whatsapp_fase2_turnos.sql` (crear) | Tablas `wa_servicios`, `wa_horarios`, `wa_excepciones`, `wa_turnos` + `btree_gist` + constraint anti-overbooking. |
| `src/lib/turnos/slots.ts` (+test) | **Port 1:1** del motor de slots del origen + `DayAvailability`/`esSlotOfrecido` (agregados, puros). |
| `src/lib/turnos/formato.ts` (+test) | Puro: `armarStartsAtISO` (fecha+hora AR → ISO UTC, valida formato), `fmtFechaLarga`, `fmtFechaCorta`, `fmtHora`. |
| `src/lib/turnos/resolverServicio.ts` (+test) | Puro: resuelve qué servicio quiere el paciente ('' + uno solo activo → ese; texto → match exacto/parcial). |
| `src/features/whatsapp/services/turnosService.ts` (crear) | Camino service-role: disponibilidad, crear turno (mapea `23P01`), listar/cancelar del paciente, resumen para el médico. |
| `src/features/whatsapp/agent/toolsTurnos.ts` (crear) | `buildTurnosTools` (`consultar_disponibilidad`, `reservar_turno`, `cancelar_turno`), `medico_id` y teléfono inyectados. |
| `src/features/whatsapp/agent/systemPrompt.ts` (modificar) | Sección TURNOS con reglas duras (solo horarios exactos de la tool; "agendado" solo con ok:true). |
| `src/features/whatsapp/runner.ts` (modificar) | Comando `turnos` del médico + componer tools de turnos con las de recetas en la rama paciente. |
| `scripts/seed-wa-turnos.mjs` (crear) | Siembra `wa_servicios` + `wa_horarios` del médico de prueba (idempotente). |

---

## Task 1: Migración — `wa_servicios`, `wa_horarios`, `wa_excepciones`, `wa_turnos` + anti-overbooking

**Files:**
- Create: `supabase/migrations/20260610_whatsapp_fase2_turnos.sql`

- [ ] **Step 1: Crear la migración**

```sql
-- ============================================================================
-- WhatsApp Fase 2 — turnos: wa_servicios, wa_horarios, wa_excepciones, wa_turnos
-- Motor portado de Agente_Whatsapp, re-keyeado a medico_id (RLS auth.uid()=medico_id).
-- El sistema (webhook/runner) escribe via service-role y filtra medico_id a mano.
-- ============================================================================

-- Necesaria para el constraint anti-overbooking (EXCLUDE con = sobre uuid)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── wa_servicios: catálogo de servicios del médico (consulta, control, etc.) ─
CREATE TABLE wa_servicios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  duracion_min INT NOT NULL DEFAULT 30 CHECK (duracion_min > 0),
  precio DECIMAL(12,2),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (medico_id, nombre)
);
CREATE INDEX idx_wa_servicios_medico_id ON wa_servicios(medico_id);
ALTER TABLE wa_servicios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_servicios_select" ON wa_servicios FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "wa_servicios_insert" ON wa_servicios FOR INSERT WITH CHECK (auth.uid() = medico_id);
CREATE POLICY "wa_servicios_update" ON wa_servicios FOR UPDATE USING (auth.uid() = medico_id);
CREATE POLICY "wa_servicios_delete" ON wa_servicios FOR DELETE USING (auth.uid() = medico_id);

-- ── wa_horarios: horario semanal de atención (varios bloques por día → siesta) ─
CREATE TABLE wa_horarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0=domingo … 6=sábado
  open_time TIME NOT NULL,
  close_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (close_time > open_time)
);
CREATE INDEX idx_wa_horarios_medico_id ON wa_horarios(medico_id);
ALTER TABLE wa_horarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_horarios_select" ON wa_horarios FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "wa_horarios_insert" ON wa_horarios FOR INSERT WITH CHECK (auth.uid() = medico_id);
CREATE POLICY "wa_horarios_update" ON wa_horarios FOR UPDATE USING (auth.uid() = medico_id);
CREATE POLICY "wa_horarios_delete" ON wa_horarios FOR DELETE USING (auth.uid() = medico_id);

-- ── wa_excepciones: feriados / vacaciones / horarios especiales ──────────────
-- kind en inglés A PROPÓSITO: el motor de slots (src/lib/turnos/slots.ts) se porta
-- 1:1 del origen y consume estos literales sin capa de mapeo.
CREATE TABLE wa_excepciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('closed', 'custom', 'open')),
  ranges JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{"open":"HH:MM","close":"HH:MM"}] solo en 'custom'
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX idx_wa_excepciones_medico_fecha ON wa_excepciones(medico_id, start_date);
ALTER TABLE wa_excepciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_excepciones_select" ON wa_excepciones FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "wa_excepciones_insert" ON wa_excepciones FOR INSERT WITH CHECK (auth.uid() = medico_id);
CREATE POLICY "wa_excepciones_update" ON wa_excepciones FOR UPDATE USING (auth.uid() = medico_id);
CREATE POLICY "wa_excepciones_delete" ON wa_excepciones FOR DELETE USING (auth.uid() = medico_id);

-- ── wa_turnos: turnos agendados ───────────────────────────────────────────────
CREATE TABLE wa_turnos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contacto_id UUID REFERENCES wa_contactos(id) ON DELETE SET NULL,
  servicio_id UUID REFERENCES wa_servicios(id) ON DELETE SET NULL,
  paciente_telefono TEXT NOT NULL,  -- candado de cancelación: solo el dueño del número
  paciente_nombre TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  estado TEXT NOT NULL DEFAULT 'reservado'
    CHECK (estado IN ('reservado', 'confirmado', 'cancelado', 'completado', 'ausente')),
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX idx_wa_turnos_medico_id ON wa_turnos(medico_id);
CREATE INDEX idx_wa_turnos_medico_start ON wa_turnos(medico_id, starts_at);
CREATE INDEX idx_wa_turnos_contacto_id ON wa_turnos(contacto_id);
CREATE INDEX idx_wa_turnos_telefono ON wa_turnos(medico_id, paciente_telefono);

-- Anti-overbooking a nivel base: dos turnos NO cancelados del mismo médico no
-- pueden solaparse. Atrapa la carrera entre dos reservas simultáneas que el
-- chequeo en app no ve. Violación = SQLSTATE 23P01 (exclusion_violation).
ALTER TABLE wa_turnos ADD CONSTRAINT wa_turnos_sin_solape
  EXCLUDE USING gist (medico_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (estado <> 'cancelado');

ALTER TABLE wa_turnos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_turnos_select" ON wa_turnos FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "wa_turnos_insert" ON wa_turnos FOR INSERT WITH CHECK (auth.uid() = medico_id);
CREATE POLICY "wa_turnos_update" ON wa_turnos FOR UPDATE USING (auth.uid() = medico_id);
CREATE POLICY "wa_turnos_delete" ON wa_turnos FOR DELETE USING (auth.uid() = medico_id);
```

- [ ] **Step 2: Aplicar** — el dueño la pega en el SQL Editor de Supabase (`eylcrxhpccwobipcjzal`) → Run → "Success".

- [ ] **Step 3: Verificar** (cuando esté aplicada):

```sql
select tablename, rowsecurity from pg_tables
  where tablename in ('wa_servicios','wa_horarios','wa_excepciones','wa_turnos');
select conname from pg_constraint where conname = 'wa_turnos_sin_solape';
```

Expected: 4 tablas con `rowsecurity = true`; 1 fila `wa_turnos_sin_solape`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260610_whatsapp_fase2_turnos.sql
git commit -m "feat(db): tablas de turnos wa_* + constraint anti-overbooking EXCLUDE gist (Fase 2)"
```

---

## Task 2: Motor de slots — port 1:1 con suite de tests propia (TDD)

El origen NO tiene tests. Los tests se escriben PRIMERO (codifican el comportamiento esperado del motor), después se copia el archivo y se agregan los dos helpers nuevos.

**Files:**
- Create: `src/lib/turnos/slots.ts` (copiar de `~/proyectos/Agente_Whatsapp/src/features/appointments/slots.ts` + agregar `DayAvailability`/`esSlotOfrecido` al final)
- Test: `src/lib/turnos/slots.test.ts`

- [ ] **Step 1: Test que falla**

```ts
import { describe, it, expect } from 'vitest'
import {
  computeSlotsForDate,
  arDateString,
  weekdayOf,
  pickException,
  resolveDayHours,
  esSlotOfrecido,
  type ScheduleExceptionLite,
  type DayAvailability,
} from './slots'

// 2026-06-15 es lunes. 09:00 AR (-03:00) = 12:00 UTC.

describe('computeSlotsForDate', () => {
  const hours = [{ open_time: '09:00', close_time: '12:00' }]

  it('genera slots cada `durationMin` dentro del bloque, en UTC con label AR', () => {
    const slots = computeSlotsForDate({ date: '2026-06-15', durationMin: 60, hours, busy: [] })
    expect(slots.map((s) => s.label)).toEqual(['09:00', '10:00', '11:00'])
    expect(slots[0].startsAt).toBe('2026-06-15T12:00:00.000Z')
    expect(slots[0].endsAt).toBe('2026-06-15T13:00:00.000Z')
  })

  it('el último slot tiene que ENTRAR completo antes del cierre', () => {
    const slots = computeSlotsForDate({ date: '2026-06-15', durationMin: 45, hours, busy: [] })
    expect(slots.map((s) => s.label)).toEqual(['09:00', '09:45', '10:30', '11:15'])
  })

  it('acepta open/close con segundos (formato TIME de Postgres)', () => {
    const conSegundos = [{ open_time: '09:00:00', close_time: '11:00:00' }]
    const slots = computeSlotsForDate({ date: '2026-06-15', durationMin: 60, hours: conSegundos, busy: [] })
    expect(slots.map((s) => s.label)).toEqual(['09:00', '10:00'])
  })

  it('excluye slots que solapan turnos ocupados', () => {
    const busy = [{ starts_at: '2026-06-15T13:00:00.000Z', ends_at: '2026-06-15T14:00:00.000Z' }] // 10–11 AR
    const slots = computeSlotsForDate({ date: '2026-06-15', durationMin: 60, hours, busy })
    expect(slots.map((s) => s.label)).toEqual(['09:00', '11:00'])
  })

  it('descarta slots en el pasado si se pasa nowMs', () => {
    const nowMs = new Date('2026-06-15T13:30:00.000Z').getTime() // 10:30 AR
    const slots = computeSlotsForDate({ date: '2026-06-15', durationMin: 60, hours, busy: [], nowMs })
    expect(slots.map((s) => s.label)).toEqual(['11:00'])
  })

  it('soporta dos bloques (mañana y tarde, siesta en el medio)', () => {
    const dosBloques = [
      { open_time: '09:00', close_time: '11:00' },
      { open_time: '17:00', close_time: '19:00' },
    ]
    const slots = computeSlotsForDate({ date: '2026-06-15', durationMin: 60, hours: dosBloques, busy: [] })
    expect(slots.map((s) => s.label)).toEqual(['09:00', '10:00', '17:00', '18:00'])
  })
})

describe('arDateString / weekdayOf', () => {
  it('arDateString devuelve YYYY-MM-DD en hora AR con offset de días', () => {
    const base = new Date('2026-06-15T12:00:00.000Z').getTime()
    expect(arDateString(base, 0)).toBe('2026-06-15')
    expect(arDateString(base, 2)).toBe('2026-06-17')
  })

  it('weekdayOf: lunes=1, domingo=0', () => {
    expect(weekdayOf('2026-06-15')).toBe(1)
    expect(weekdayOf('2026-06-14')).toBe(0)
  })
})

describe('pickException', () => {
  const cerrado: ScheduleExceptionLite = { start_date: '2026-07-09', end_date: '2026-07-09', kind: 'closed', ranges: [] }
  const especial: ScheduleExceptionLite = {
    start_date: '2026-07-01',
    end_date: '2026-07-31',
    kind: 'custom',
    ranges: [{ open: '10:00', close: '13:00' }],
  }

  it('precedencia: closed gana sobre custom cuando ambas cubren la fecha', () => {
    expect(pickException('2026-07-09', [especial, cerrado])?.kind).toBe('closed')
  })

  it('fecha sin excepción que la cubra → null', () => {
    expect(pickException('2026-08-01', [especial, cerrado])).toBeNull()
  })
})

describe('resolveDayHours', () => {
  const weekly = [
    { weekday: 1, open_time: '09:00', close_time: '13:00' },
    { weekday: 1, open_time: '17:00', close_time: '20:00' },
    { weekday: 3, open_time: '09:00', close_time: '13:00' },
  ]

  it('día cerrado por excepción', () => {
    const r = resolveDayHours({
      date: '2026-06-15',
      weekday: 1,
      weekly,
      exceptions: [{ start_date: '2026-06-15', end_date: '2026-06-15', kind: 'closed', ranges: [] }],
    })
    expect(r.closed).toBe(true)
    expect(r.hours).toEqual([])
  })

  it('horario especial (custom) pisa al semanal', () => {
    const r = resolveDayHours({
      date: '2026-06-15',
      weekday: 1,
      weekly,
      exceptions: [
        { start_date: '2026-06-15', end_date: '2026-06-15', kind: 'custom', ranges: [{ open: '10:00', close: '12:00' }] },
      ],
    })
    expect(r.closed).toBe(false)
    expect(r.hours).toEqual([{ open_time: '10:00', close_time: '12:00' }])
  })

  it('sin excepción → los bloques del weekday', () => {
    const r = resolveDayHours({ date: '2026-06-15', weekday: 1, weekly, exceptions: [] })
    expect(r.hours).toHaveLength(2)
  })

  it('weekday sin horario cargado → sin bloques (no atiende ese día)', () => {
    const r = resolveDayHours({ date: '2026-06-16', weekday: 2, weekly, exceptions: [] })
    expect(r.closed).toBe(false)
    expect(r.hours).toEqual([])
  })
})

describe('esSlotOfrecido', () => {
  const dias: DayAvailability[] = [
    {
      date: '2026-06-15',
      weekday: 1,
      slots: [{ startsAt: '2026-06-15T12:00:00.000Z', endsAt: '2026-06-15T12:30:00.000Z', label: '09:00' }],
    },
  ]

  it('true para un slot exactamente ofrecido', () => {
    expect(esSlotOfrecido(dias, '2026-06-15T12:00:00.000Z')).toBe(true)
  })

  it('false para un horario no ofrecido (anti-horario-inventado)', () => {
    expect(esSlotOfrecido(dias, '2026-06-15T12:15:00.000Z')).toBe(false)
  })
})
```

- [ ] **Step 2: Correr y ver fallar** — `npm test -- src/lib/turnos/slots.test.ts` → FAIL "Cannot find module './slots'".

- [ ] **Step 3: Portar el motor.** Copiar ÍNTEGRO el contenido de `~/proyectos/Agente_Whatsapp/src/features/appointments/slots.ts` a `src/lib/turnos/slots.ts` (las funciones `computeSlotsForDate`, `arDateString`, `weekdayOf`, `pickException`, `resolveDayHours`, las constantes `AR_OFFSET`, `AR_TZ`, `BOOKING_WINDOW_DAYS` y los tipos `Slot`, `ScheduleExceptionLite` — sin cambiar NADA), y agregar al final:

```ts
// ── Agregados para MediCuenta (no estaban en el motor origen) ────────────────

/** Disponibilidad de un día, como la devuelve el servicio de turnos. */
export interface DayAvailability {
  date: string // YYYY-MM-DD
  weekday: number
  slots: Slot[]
}

/**
 * ¿El instante startsAt es EXACTAMENTE uno de los slots ofrecidos?
 * Barrera anti-horario-inventado: la IA solo puede reservar lo que la tool ofreció.
 */
export function esSlotOfrecido(dias: DayAvailability[], startsAt: string): boolean {
  return dias.some((d) => d.slots.some((s) => s.startsAt === startsAt))
}
```

- [ ] **Step 4: Verde** — `npm test -- src/lib/turnos/slots.test.ts` → PASS (15 tests).
- [ ] **Step 5: Commit**

```bash
git add src/lib/turnos/slots.ts src/lib/turnos/slots.test.ts
git commit -m "feat(turnos): motor de slots portado 1:1 del origen, con suite de tests propia"
```

---

## Task 3: Formato y parseo de fecha/hora (TDD)

**Files:**
- Create: `src/lib/turnos/formato.ts`
- Test: `src/lib/turnos/formato.test.ts`

- [ ] **Step 1: Test que falla**

```ts
import { describe, it, expect } from 'vitest'
import { armarStartsAtISO, fmtFechaLarga, fmtHora } from './formato'

describe('armarStartsAtISO', () => {
  it('combina fecha + hora en hora argentina → ISO UTC', () => {
    expect(armarStartsAtISO('2026-06-15', '09:00')).toBe('2026-06-15T12:00:00.000Z')
  })

  it('normaliza H:MM a HH:MM', () => {
    expect(armarStartsAtISO('2026-06-15', '9:00')).toBe('2026-06-15T12:00:00.000Z')
  })

  it('tolera espacios alrededor', () => {
    expect(armarStartsAtISO(' 2026-06-15 ', ' 09:00 ')).toBe('2026-06-15T12:00:00.000Z')
  })

  it('rechaza formatos inválidos (la IA a veces manda cualquier cosa)', () => {
    expect(armarStartsAtISO('15/06/2026', '09:00')).toBeNull()
    expect(armarStartsAtISO('2026-06-15', '9am')).toBeNull()
    expect(armarStartsAtISO('2026-06-15', '09:00:00')).toBeNull()
    expect(armarStartsAtISO('', '')).toBeNull()
  })
})

describe('fmtFechaLarga / fmtHora', () => {
  // 2026-06-15T12:00:00Z = lunes 15 de junio, 09:00 hora argentina
  it('fmtFechaLarga devuelve día de semana, número y mes en es-AR', () => {
    const s = fmtFechaLarga('2026-06-15T12:00:00.000Z')
    expect(s).toContain('lunes')
    expect(s).toContain('15')
    expect(s).toContain('junio')
  })

  it('fmtHora devuelve HH:MM de 24h en hora argentina', () => {
    expect(fmtHora('2026-06-15T12:00:00.000Z')).toBe('09:00')
  })
})
```

- [ ] **Step 2: Correr y ver fallar** — `npm test -- src/lib/turnos/formato.test.ts` → FAIL "Cannot find module './formato'".

- [ ] **Step 3: Implementar**

```ts
/** Helpers puros de fecha/hora para el flujo de turnos (hora AR fija, sin DST vigente). */
import { AR_OFFSET, AR_TZ } from './slots'

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
const HORA_RE = /^\d{2}:\d{2}$/

/**
 * Combina fecha (YYYY-MM-DD) + hora (HH:MM o H:MM) en hora argentina → ISO UTC.
 * Devuelve null si el formato no es válido — el caller responde con instrucción
 * de reusar la fecha/hora EXACTAS de consultar_disponibilidad.
 */
export function armarStartsAtISO(fecha: string, hora: string): string | null {
  const f = fecha.trim()
  const hRaw = hora.trim()
  const h = /^\d:\d{2}$/.test(hRaw) ? `0${hRaw}` : hRaw
  if (!FECHA_RE.test(f) || !HORA_RE.test(h)) return null
  const d = new Date(`${f}T${h}:00${AR_OFFSET}`)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/** 'lunes, 15 de junio' (es-AR, hora argentina). */
export function fmtFechaLarga(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: AR_TZ,
  }).format(new Date(iso))
}

/** 'lunes 15/06' para listados compactos. */
export function fmtFechaCorta(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    timeZone: AR_TZ,
  }).format(new Date(iso))
}

/** 'HH:MM' de 24h en hora argentina. */
export function fmtHora(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: AR_TZ,
  }).format(new Date(iso))
}
```

- [ ] **Step 4: Verde** — `npm test -- src/lib/turnos/formato.test.ts` → PASS (6 tests).
- [ ] **Step 5: Commit**

```bash
git add src/lib/turnos/formato.ts src/lib/turnos/formato.test.ts
git commit -m "feat(turnos): parseo seguro de fecha/hora AR y formateo es-AR (TDD)"
```

---

## Task 4: Resolución del servicio pedido (TDD)

**Files:**
- Create: `src/lib/turnos/resolverServicio.ts`
- Test: `src/lib/turnos/resolverServicio.test.ts`

- [ ] **Step 1: Test que falla**

```ts
import { describe, it, expect } from 'vitest'
import { resolverServicio, type ServicioLite } from './resolverServicio'

const consulta: ServicioLite = { id: 'a1', nombre: 'Consulta', duracion_min: 30, precio: null, activo: true }
const control: ServicioLite = { id: 'b2', nombre: 'Control post-operatorio', duracion_min: 15, precio: null, activo: true }
const inactivo: ServicioLite = { id: 'c3', nombre: 'Ecografía', duracion_min: 20, precio: null, activo: false }

describe('resolverServicio', () => {
  it('sin servicios activos → ninguno', () => {
    expect(resolverServicio([inactivo], 'consulta')).toEqual({ tipo: 'ninguno' })
    expect(resolverServicio([], '')).toEqual({ tipo: 'ninguno' })
  })

  it("query vacía + UN solo activo → ese (el caso típico: 'Consulta')", () => {
    expect(resolverServicio([consulta, inactivo], '')).toEqual({ tipo: 'ok', servicio: consulta })
  })

  it('query vacía + varios activos → pedir elección', () => {
    const r = resolverServicio([consulta, control], '')
    expect(r.tipo).toBe('elegir')
    if (r.tipo === 'elegir') expect(r.opciones).toHaveLength(2)
  })

  it('match exacto (case-insensitive)', () => {
    expect(resolverServicio([consulta, control], 'CONSULTA')).toEqual({ tipo: 'ok', servicio: consulta })
  })

  it('match parcial en ambas direcciones', () => {
    expect(resolverServicio([consulta, control], 'control')).toEqual({ tipo: 'ok', servicio: control })
    expect(resolverServicio([consulta, control], 'quiero un control post-operatorio ya')).toEqual({
      tipo: 'ok',
      servicio: control,
    })
  })

  it('query sin match + UN solo activo → ese (el médico ofrece una sola cosa)', () => {
    expect(resolverServicio([consulta], 'turno para lo que sea')).toEqual({ tipo: 'ok', servicio: consulta })
  })

  it('query sin match + varios activos → pedir elección', () => {
    const r = resolverServicio([consulta, control], 'masajes')
    expect(r.tipo).toBe('elegir')
  })
})
```

- [ ] **Step 2: Correr y ver fallar** — `npm test -- src/lib/turnos/resolverServicio.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```ts
/** Resolución pura de "qué servicio quiere el paciente" a partir del catálogo del médico. */

export interface ServicioLite {
  id: string
  nombre: string
  duracion_min: number
  precio: number | null
  activo: boolean
}

export type ResultadoServicio =
  | { tipo: 'ok'; servicio: ServicioLite }
  | { tipo: 'elegir'; opciones: ServicioLite[] }
  | { tipo: 'ninguno' }

export function resolverServicio(servicios: ServicioLite[], query: string): ResultadoServicio {
  const activos = servicios.filter((s) => s.activo)
  if (activos.length === 0) return { tipo: 'ninguno' }

  const q = query.trim().toLowerCase()
  if (q) {
    const exacto = activos.find((s) => s.nombre.toLowerCase() === q)
    if (exacto) return { tipo: 'ok', servicio: exacto }
    const parcial = activos.find(
      (s) => s.nombre.toLowerCase().includes(q) || q.includes(s.nombre.toLowerCase()),
    )
    if (parcial) return { tipo: 'ok', servicio: parcial }
  }
  // Sin query (o sin match): si ofrece una sola cosa, es esa; si no, que elija.
  if (activos.length === 1) return { tipo: 'ok', servicio: activos[0] }
  return { tipo: 'elegir', opciones: activos }
}
```

- [ ] **Step 4: Verde** — `npm test -- src/lib/turnos/resolverServicio.test.ts` → PASS (7 tests).
- [ ] **Step 5: Commit**

```bash
git add src/lib/turnos/resolverServicio.ts src/lib/turnos/resolverServicio.test.ts
git commit -m "feat(turnos): resolución del servicio pedido por el paciente (TDD)"
```

---

## Task 5: Servicio de datos de turnos (camino service-role del bot)

Equivalente re-keyeado del `admin-data.ts` del origen. Recibe el cliente **service-role** y filtra `medico_id` a mano en TODAS las queries (patrón Fase 0/1). Sin tests unitarios propios (capa DB, igual que `recetasService.ts`): la lógica decidible está en los libs puros ya testeados, y el constraint EXCLUDE se prueba en vivo en Task 9.

**Files:**
- Create: `src/features/whatsapp/services/turnosService.ts`

- [ ] **Step 1: Implementar**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  computeSlotsForDate,
  arDateString,
  weekdayOf,
  resolveDayHours,
  pickException,
  type ScheduleExceptionLite,
  type DayAvailability,
} from '@/lib/turnos/slots'
import { fmtFechaCorta, fmtHora } from '@/lib/turnos/formato'
import type { ServicioLite } from '@/lib/turnos/resolverServicio'

/** Cuántos días hacia adelante se busca disponibilidad (el origen usaba 60: ruido). */
const DIAS_A_OFRECER = 14
/** Ventana del resumen de agenda del médico (comando 'turnos'). */
const DIAS_RESUMEN_MEDICO = 7

export interface TurnoRow {
  id: string
  servicio_id: string | null
  paciente_telefono: string
  paciente_nombre: string | null
  starts_at: string
  ends_at: string
  estado: string
}

export async function getServiciosActivos(db: SupabaseClient, medicoId: string): Promise<ServicioLite[]> {
  const { data } = await db
    .from('wa_servicios')
    .select('id, nombre, duracion_min, precio, activo')
    .eq('medico_id', medicoId)
    .eq('activo', true)
    .order('nombre')
  return ((data as ServicioLite[] | null) ?? []).map((s) => ({
    ...s,
    precio: s.precio != null ? Number(s.precio) : null,
  }))
}

async function getHorarios(
  db: SupabaseClient,
  medicoId: string,
): Promise<{ weekday: number; open_time: string; close_time: string }[]> {
  const { data } = await db
    .from('wa_horarios')
    .select('weekday, open_time, close_time')
    .eq('medico_id', medicoId)
    .order('weekday')
  return (data as { weekday: number; open_time: string; close_time: string }[] | null) ?? []
}

async function getExcepciones(db: SupabaseClient, medicoId: string): Promise<ScheduleExceptionLite[]> {
  const { data } = await db
    .from('wa_excepciones')
    .select('start_date, end_date, kind, ranges')
    .eq('medico_id', medicoId)
    .order('start_date')
  return (data as ScheduleExceptionLite[] | null) ?? []
}

/** Disponibilidad real del servicio: horario semanal + excepciones − turnos ocupados. */
export async function getDisponibilidad(
  db: SupabaseClient,
  medicoId: string,
  servicio: ServicioLite,
  dias = DIAS_A_OFRECER,
): Promise<DayAvailability[]> {
  const [horarios, excepciones] = await Promise.all([getHorarios(db, medicoId), getExcepciones(db, medicoId)])
  if (horarios.length === 0) return []

  const nowMs = Date.now()
  const desdeIso = new Date(nowMs).toISOString()
  const hastaIso = new Date(nowMs + dias * 86_400_000).toISOString()
  // Ocupados: cualquier turno NO cancelado que toque la ventana — incluye los que
  // empezaron antes de "ahora" y siguen en curso (el origen los perdía).
  const { data: busy } = await db
    .from('wa_turnos')
    .select('starts_at, ends_at')
    .eq('medico_id', medicoId)
    .neq('estado', 'cancelado')
    .gt('ends_at', desdeIso)
    .lte('starts_at', hastaIso)
  const ocupados = (busy as { starts_at: string; ends_at: string }[] | null) ?? []

  const result: DayAvailability[] = []
  for (let i = 0; i < dias; i++) {
    const date = arDateString(nowMs, i)
    const weekday = weekdayOf(date)
    const { closed, hours } = resolveDayHours({ date, weekday, weekly: horarios, exceptions: excepciones })
    if (closed || hours.length === 0) continue
    const slots = computeSlotsForDate({
      date,
      durationMin: servicio.duracion_min,
      hours,
      busy: ocupados,
      nowMs,
    })
    if (slots.length > 0) result.push({ date, weekday, slots })
  }
  return result
}

export interface CrearTurnoInput {
  servicio: ServicioLite
  startsAt: string // ISO UTC, ya validado contra esSlotOfrecido por el caller
  pacienteTelefono: string // ya normalizado con normalizeRecipient
  pacienteNombre: string
  contactoId: string | null
}

/**
 * Crea el turno. El caller ya validó que startsAt es un slot ofrecido; acá quedan
 * dos defensas: día cerrado por excepción (por si el slot venía de una consulta
 * vieja) y el constraint EXCLUDE de la DB (carrera entre reservas simultáneas).
 */
export async function crearTurno(
  db: SupabaseClient,
  medicoId: string,
  input: CrearTurnoInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const fecha = arDateString(new Date(input.startsAt).getTime(), 0)
  const excepciones = await getExcepciones(db, medicoId)
  if (pickException(fecha, excepciones)?.kind === 'closed') {
    return { ok: false, error: 'Ese día el consultorio está cerrado.' }
  }

  const endsAt = new Date(
    new Date(input.startsAt).getTime() + input.servicio.duracion_min * 60_000,
  ).toISOString()

  const { error } = await db.from('wa_turnos').insert({
    medico_id: medicoId,
    contacto_id: input.contactoId,
    servicio_id: input.servicio.id,
    paciente_telefono: input.pacienteTelefono,
    paciente_nombre: input.pacienteNombre || null,
    starts_at: input.startsAt,
    ends_at: endsAt,
    estado: 'reservado',
  })
  if (error) {
    // 23P01 = exclusion_violation: otro turno ganó ese rango en la carrera.
    if (error.code === '23P01') return { ok: false, error: 'Ese horario ya fue tomado. Probá con otro.' }
    console.error('[turnos] insert error:', error.message)
    return { ok: false, error: 'No se pudo crear el turno.' }
  }
  return { ok: true }
}

/** Turnos próximos (no cancelados) del paciente, identificado por su teléfono. */
export async function listarTurnosDePaciente(
  db: SupabaseClient,
  medicoId: string,
  telefonoNormalizado: string,
): Promise<TurnoRow[]> {
  const { data } = await db
    .from('wa_turnos')
    .select('id, servicio_id, paciente_telefono, paciente_nombre, starts_at, ends_at, estado')
    .eq('medico_id', medicoId)
    .eq('paciente_telefono', telefonoNormalizado)
    .in('estado', ['reservado', 'confirmado'])
    .gt('starts_at', new Date().toISOString())
    .order('starts_at')
  return (data as TurnoRow[] | null) ?? []
}

/** Cancela un turno DEL PACIENTE: el candado es su propio teléfono (no cancela ajenos). */
export async function cancelarTurnoDePaciente(
  db: SupabaseClient,
  medicoId: string,
  telefonoNormalizado: string,
  turnoId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data } = await db
    .from('wa_turnos')
    .update({ estado: 'cancelado', updated_at: new Date().toISOString() })
    .eq('medico_id', medicoId)
    .eq('id', turnoId)
    .eq('paciente_telefono', telefonoNormalizado)
    .in('estado', ['reservado', 'confirmado'])
    .select('id')
  if (!data || data.length === 0) {
    return { ok: false, error: 'No encontré ese turno a nombre de este número (o ya estaba cancelado).' }
  }
  return { ok: true }
}

function nombreServicio(s: { nombre: string } | { nombre: string }[] | null): string {
  if (!s) return 'turno'
  return Array.isArray(s) ? (s[0]?.nombre ?? 'turno') : s.nombre
}

/** Agenda compacta para el comando 'turnos' del médico (visibilidad mínima, como 'recetas'). */
export async function resumenTurnos(db: SupabaseClient, medicoId: string): Promise<string> {
  const { data } = await db
    .from('wa_turnos')
    .select('starts_at, paciente_nombre, paciente_telefono, estado, servicio:wa_servicios(nombre)')
    .eq('medico_id', medicoId)
    .in('estado', ['reservado', 'confirmado'])
    .gt('starts_at', new Date().toISOString())
    .lte('starts_at', new Date(Date.now() + DIAS_RESUMEN_MEDICO * 86_400_000).toISOString())
    .order('starts_at')
  const rows =
    (data as
      | {
          starts_at: string
          paciente_nombre: string | null
          paciente_telefono: string
          estado: string
          servicio: { nombre: string } | { nombre: string }[] | null
        }[]
      | null) ?? []

  if (rows.length === 0) return `No hay turnos agendados para los próximos ${DIAS_RESUMEN_MEDICO} días.`

  const lineas = rows
    .map(
      (t) =>
        `• ${fmtFechaCorta(t.starts_at)} ${fmtHora(t.starts_at)} — ${t.paciente_nombre || t.paciente_telefono} (${nombreServicio(t.servicio)})`,
    )
    .join('\n')
  return `📅 Turnos de los próximos ${DIAS_RESUMEN_MEDICO} días (${rows.length}):\n${lineas}`
}
```

- [ ] **Step 2: Verificar** — `npm run typecheck` → sin errores; `npm test` → los existentes verdes.
- [ ] **Step 3: Commit**

```bash
git add src/features/whatsapp/services/turnosService.ts
git commit -m "feat(turnos): servicio de datos service-role (disponibilidad, reserva con 23P01, cancelación, resumen)"
```

---

## Task 6: Tools del agente — `consultar_disponibilidad`, `reservar_turno`, `cancelar_turno`

Mismo patrón que `tools.ts` (recetas): `medico_id` y teléfono del paciente INYECTADOS, schema anti-Claude (strings requeridos, `""` cuando falta — sin `.optional()`/`.nullable()`).

**Files:**
- Create: `src/features/whatsapp/agent/toolsTurnos.ts`

- [ ] **Step 1: Implementar**

```ts
import { tool } from 'ai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeRecipient } from '@/lib/whatsapp/client'
import { resolverServicio } from '@/lib/turnos/resolverServicio'
import { armarStartsAtISO, fmtFechaLarga, fmtHora } from '@/lib/turnos/formato'
import { esSlotOfrecido } from '@/lib/turnos/slots'
import {
  getServiciosActivos,
  getDisponibilidad,
  crearTurno,
  listarTurnosDePaciente,
  cancelarTurnoDePaciente,
} from '@/features/whatsapp/services/turnosService'

export interface TurnosToolsCtx {
  db: SupabaseClient
  medicoId: string
  telefonoPaciente: string
  contactoId: string | null
}

/** Caps de la respuesta de disponibilidad (mismos del origen): no abrumar el contexto. */
const DIAS_EN_RESPUESTA = 5
const SLOTS_POR_DIA = 24

/** Tools de turnos del agente del paciente. medico_id INYECTADO (el webhook no tiene sesión). */
export function buildTurnosTools(ctx: TurnosToolsCtx) {
  return {
    consultar_disponibilidad: tool({
      description:
        'Devuelve los próximos horarios disponibles para un turno. Usala SIEMPRE antes de ofrecer horarios, y también si preguntan qué días u horarios atiende el médico.',
      inputSchema: z.object({
        servicio: z
          .string()
          .describe('Nombre del servicio que pide el paciente. "" si no especificó o si hay uno solo.'),
      }),
      execute: async ({ servicio }) => {
        const servicios = await getServiciosActivos(ctx.db, ctx.medicoId)
        const res = resolverServicio(servicios, servicio)
        if (res.tipo === 'ninguno') {
          return { error: 'El médico todavía no configuró la agenda de turnos. Sugerile consultarlo directamente.' }
        }
        if (res.tipo === 'elegir') {
          return {
            elegir_entre: res.opciones.map((s) => ({ servicio: s.nombre, duracion_min: s.duracion_min })),
            instruccion: 'Preguntale al paciente cuál de estos servicios quiere antes de ofrecer horarios.',
          }
        }
        const dias = await getDisponibilidad(ctx.db, ctx.medicoId, res.servicio)
        if (dias.length === 0) {
          return { servicio: res.servicio.nombre, mensaje: 'No hay horarios disponibles en los próximos días.' }
        }
        return {
          servicio: res.servicio.nombre,
          duracion_min: res.servicio.duracion_min,
          disponibilidad: dias.slice(0, DIAS_EN_RESPUESTA).map((d) => ({
            fecha: d.date, // YYYY-MM-DD — pasala TAL CUAL a reservar_turno
            dia: fmtFechaLarga(`${d.date}T12:00:00-03:00`),
            horarios: d.slots.slice(0, SLOTS_POR_DIA).map((s) => s.label),
          })),
          instruccion:
            'Ofrecé SOLO estos horarios, con fecha y hora EXACTAS. Para reservar llamá a reservar_turno con la fecha (YYYY-MM-DD) y la hora (HH:MM) elegidas.',
        }
      },
    }),

    reservar_turno: tool({
      description:
        'Reserva un turno en uno de los horarios devueltos por consultar_disponibilidad. Antes de llamarla confirmá con el paciente el servicio, el día y la hora, y tené su nombre completo.',
      inputSchema: z.object({
        servicio: z.string().describe('Nombre del servicio. "" si hay uno solo.'),
        fecha: z.string().describe('Fecha YYYY-MM-DD EXACTA devuelta por consultar_disponibilidad'),
        hora: z.string().describe('Hora HH:MM (24h) EXACTA de uno de los horarios ofrecidos'),
        nombre_paciente: z.string().describe('Nombre completo del paciente. "" si todavía no lo dio (pedíselo antes).'),
      }),
      execute: async ({ servicio, fecha, hora, nombre_paciente }) => {
        if (!nombre_paciente.trim()) {
          return { ok: false, error: 'Falta el nombre completo del paciente: pedíselo antes de reservar.' }
        }
        const servicios = await getServiciosActivos(ctx.db, ctx.medicoId)
        const res = resolverServicio(servicios, servicio)
        if (res.tipo !== 'ok') {
          return { ok: false, error: 'No pude determinar el servicio. Llamá primero a consultar_disponibilidad.' }
        }
        const startsAt = armarStartsAtISO(fecha, hora)
        if (!startsAt) {
          return {
            ok: false,
            error: 'Fecha u hora inválida. Usá la fecha YYYY-MM-DD y la hora HH:MM EXACTAS que devolvió consultar_disponibilidad.',
          }
        }
        // Anti-horario-inventado: tiene que ser un slot realmente ofrecido AHORA.
        const dias = await getDisponibilidad(ctx.db, ctx.medicoId, res.servicio)
        if (!esSlotOfrecido(dias, startsAt)) {
          return {
            ok: false,
            error: 'Ese horario no está disponible. Volvé a llamar a consultar_disponibilidad y ofrecé los horarios reales.',
          }
        }
        const r = await crearTurno(ctx.db, ctx.medicoId, {
          servicio: res.servicio,
          startsAt,
          pacienteTelefono: normalizeRecipient(ctx.telefonoPaciente),
          pacienteNombre: nombre_paciente.trim(),
          contactoId: ctx.contactoId,
        })
        if (!r.ok) return { ok: false, error: r.error }
        return {
          ok: true,
          mensaje: `Turno confirmado: ${res.servicio.nombre} el ${fmtFechaLarga(startsAt)} a las ${fmtHora(startsAt)} hs.`,
        }
      },
    }),

    cancelar_turno: tool({
      description:
        'Lista o cancela turnos DEL PACIENTE que escribe (solo los suyos). Llamala con turno_id="" para listar; después, confirmá con el paciente y llamala con el turno_id elegido para cancelar.',
      inputSchema: z.object({
        turno_id: z.string().describe('El turno_id devuelto por esta misma tool al listar. "" para listar.'),
      }),
      execute: async ({ turno_id }) => {
        const telefono = normalizeRecipient(ctx.telefonoPaciente)
        const turnos = await listarTurnosDePaciente(ctx.db, ctx.medicoId, telefono)
        if (turnos.length === 0) {
          return { turnos: [], mensaje: 'No hay turnos próximos a nombre de este número de WhatsApp.' }
        }
        if (!turno_id.trim()) {
          return {
            turnos: turnos.map((t) => ({
              turno_id: t.id,
              dia: fmtFechaLarga(t.starts_at),
              hora: fmtHora(t.starts_at),
            })),
            instruccion:
              turnos.length === 1
                ? 'Confirmá con el paciente que quiere cancelar ESE turno y llamá de nuevo con su turno_id.'
                : 'Preguntale cuál quiere cancelar y llamá de nuevo con el turno_id elegido.',
          }
        }
        const r = await cancelarTurnoDePaciente(ctx.db, ctx.medicoId, telefono, turno_id.trim())
        if (!r.ok) return { ok: false, error: r.error }
        return { ok: true, mensaje: 'Turno cancelado. El horario quedó liberado.' }
      },
    }),
  }
}
```

- [ ] **Step 2: Verificar** — `npm run typecheck` → sin errores.
- [ ] **Step 3: Commit**

```bash
git add src/features/whatsapp/agent/toolsTurnos.ts
git commit -m "feat(turnos): tools del agente consultar/reservar/cancelar con barreras anti-invento"
```

---

## Task 7: System prompt + runner (componer tools y comando `turnos` del médico)

**Files:**
- Modify: `src/features/whatsapp/agent/systemPrompt.ts`
- Modify: `src/features/whatsapp/runner.ts`

- [ ] **Step 1: System prompt — reemplazar la línea de "turnos no disponibles" por la sección TURNOS.**

En `buildSystemPromptPaciente`, **eliminar** esta línea del bloque `LÍMITES`:

```ts
    `- Los turnos todavía no están disponibles (llegan pronto).`,
```

e **insertar** entre el bloque `REGLAS DURAS DE COBRO` y el bloque `LÍMITES`:

```ts
    ``,
    `TURNOS (agenda del consultorio):`,
    `- Para ofrecer horarios usá consultar_disponibilidad. Ofrecé ÚNICAMENTE los horarios EXACTOS que devuelve (fecha y hora tal cual). NUNCA redondees ni inventes: si devuelve 09:45, ofrecé 09:45 (jamás 09:00 ni 10:00). Si no hay horarios, decilo.`,
    `- Si preguntan qué días u horarios atiende el médico: también usá consultar_disponibilidad. No inventes horarios de atención.`,
    `- Para reservar: pedí el NOMBRE COMPLETO del paciente si no lo tenés, confirmá servicio + día + hora, y llamá a reservar_turno con la fecha (YYYY-MM-DD) y hora (HH:MM) EXACTAS de un horario ofrecido. El teléfono NO se pide (ya lo tenés: es el número desde el que escribe).`,
    `- Decí que el turno "quedó agendado" SOLO si reservar_turno devolvió ok:true. Si devolvió error: pedí disculpas, volvé a consultar_disponibilidad y ofrecé horarios reales.`,
    `- Para cancelar: usá cancelar_turno (primero listá con turno_id="", confirmá con el paciente cuál, y recién ahí cancelá con ese turno_id). Solo puede cancelar turnos de su propio número.`,
```

- [ ] **Step 2: Runner — comando del médico + componer tools del paciente.**

En `src/features/whatsapp/runner.ts`:

a) Agregar imports (junto a los existentes de servicios y agent):

```ts
import { resumenTurnos } from '@/features/whatsapp/services/turnosService'
import { buildTurnosTools } from '@/features/whatsapp/agent/toolsTurnos'
```

b) Actualizar `AYUDA_MEDICO`:

```ts
const AYUDA_MEDICO = [
  '🩺 Soy su asistente. Comandos:',
  '• Reenvíeme el PDF de una receta para cargarla al cobro',
  "• 'precio 5000' — fija cuánto cobra cada receta",
  "• 'recetas' — estado de sus recetas",
  "• 'turnos' — su agenda de los próximos 7 días",
].join('\n')
```

c) En `handleMedico`, agregar el comando ANTES del fallback de ayuda (debajo del bloque de `/^(recetas|estado)$/i`):

```ts
  if (/^(turnos|agenda)$/i.test(texto)) {
    await responder(canal, incoming.from, await resumenTurnos(db, canal.medicoId))
    return
  }
```

d) En `handlePaciente`, donde hoy se construyen las tools:

```ts
  const tools = buildPacienteTools({
    db,
    medicoId: canal.medicoId,
    telefonoPaciente: incoming.from,
    contactoId,
  })
```

reemplazar por la composición recetas + turnos:

```ts
  const tools = {
    ...buildPacienteTools({
      db,
      medicoId: canal.medicoId,
      telefonoPaciente: incoming.from,
      contactoId,
    }),
    ...buildTurnosTools({
      db,
      medicoId: canal.medicoId,
      telefonoPaciente: incoming.from,
      contactoId,
    }),
  }
```

> `runAgentTurn` y `sanitizarReplyCobro` NO se tocan: las tools de turnos no generan links de pago, así que la barrera de plata sigue funcionando igual (si el modelo inventara un link en una charla de turnos, se reemplaza fail-closed como siempre).

- [ ] **Step 3: Verificar** — `npm run typecheck` → sin errores; `npm test` → todos verdes; `npm run build` → OK.
- [ ] **Step 4: Commit**

```bash
git add src/features/whatsapp/agent/systemPrompt.ts src/features/whatsapp/runner.ts
git commit -m "feat(turnos): agente con tools de turnos + comando 'turnos' del médico"
```

---

## Task 8: Seed de servicios y horarios del médico de prueba

**Files:**
- Create: `scripts/seed-wa-turnos.mjs`

- [ ] **Step 1: Implementar** (mismo patrón que `seed-wa-canal.mjs`; idempotente)

```js
// Siembra wa_servicios + wa_horarios del médico de prueba (idempotente:
// upsert del servicio por (medico_id, nombre); los horarios se borran y recrean).
// Uso: node --env-file=.env.local scripts/seed-wa-turnos.mjs <medico_uuid>
// Editá SERVICIOS y HORARIOS acá abajo si querés otros valores.
import { createClient } from '@supabase/supabase-js'

const SERVICIOS = [{ nombre: 'Consulta', duracion_min: 30, precio: null }]

// weekday: 0=domingo … 6=sábado. Lun-Vie, mañana y tarde (siesta en el medio).
const HORARIOS = [1, 2, 3, 4, 5].flatMap((weekday) => [
  { weekday, open_time: '09:00', close_time: '13:00' },
  { weekday, open_time: '17:00', close_time: '20:00' },
])

const [, , medicoId] = process.argv
if (!medicoId) {
  console.error('Uso: node --env-file=.env.local scripts/seed-wa-turnos.mjs <medico_uuid>')
  process.exit(1)
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

for (const s of SERVICIOS) {
  const { error } = await db
    .from('wa_servicios')
    .upsert({ medico_id: medicoId, ...s, activo: true }, { onConflict: 'medico_id,nombre' })
  if (error) {
    console.error('Error al sembrar wa_servicios:', error)
    process.exit(1)
  }
}

const { error: delError } = await db.from('wa_horarios').delete().eq('medico_id', medicoId)
if (delError) {
  console.error('Error al limpiar wa_horarios:', delError)
  process.exit(1)
}
const { error: insError } = await db
  .from('wa_horarios')
  .insert(HORARIOS.map((h) => ({ medico_id: medicoId, ...h })))
if (insError) {
  console.error('Error al sembrar wa_horarios:', insError)
  process.exit(1)
}

console.log(
  `✓ Sembrado para médico ${medicoId}: ${SERVICIOS.length} servicio(s), ${HORARIOS.length} bloques de horario`,
)
```

- [ ] **Step 2: Correr el seed** (requiere la migración de Task 1 aplicada):

```bash
node --env-file=.env.local scripts/seed-wa-turnos.mjs 924014ac-fb0a-4d9c-9028-49535e5e2e60
```

Expected: `✓ Sembrado para médico 924014ac-… : 1 servicio(s), 10 bloques de horario`

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-wa-turnos.mjs
git commit -m "chore(turnos): seed de servicios y horarios del médico de prueba"
```

---

## Task 9: Verificación integral + prueba E2E en vivo

- [ ] **Step 1: Suite completa**

```bash
npm test          # Expected: ~87 tests verdes (59 existentes + ~28 nuevos), 0 fallos
npm run typecheck # Expected: sin errores
npm run build     # Expected: build OK
```

> `npm run lint` sigue roto (Next 16 deprecó `next lint`) — NO usarlo como gate.

- [ ] **Step 2: Levantar la infra de prueba efímera** (igual que Fases 0/1):

```bash
cd ~/proyectos/Medicuenta-V2.0
nohup npm run dev > /tmp/medi_dev.log 2>&1 &
sleep 8 && grep -m1 "Local:" /tmp/medi_dev.log   # anotar el puerto (suele ser :3001)
nohup cloudflared tunnel --url http://localhost:3001 > /tmp/cf_tunnel.log 2>&1 &
sleep 6 && grep -m1 "trycloudflare.com" /tmp/cf_tunnel.log  # anotar la URL nueva
```

Gotchas conocidos (del HANDOFF, no re-descubrir):
- La URL del túnel CAMBIA en cada arranque → actualizar la URL del webhook en el panel de Meta (app "MediCuenta") y `PUBLIC_BASE_URL` en `.env.local` (lo usa el cobro de recetas; turnos no lo necesita) → reiniciar `npm run dev` si se cambió.
- El **token temporal de Meta vence en horas**: si Meta devuelve 401 al responder, renovarlo en el panel y re-correr `node --env-file=.env.local scripts/seed-wa-canal.mjs 924014ac-fb0a-4d9c-9028-49535e5e2e60 543834403010`.
- La app YA está suscripta a la WABA (`subscribed_apps`) — no hace falta repetirlo.

- [ ] **Step 3: Guion E2E por WhatsApp** (médico = `543834403010`, paciente de prueba = `543834222049`):

1. Paciente: *"hola, quiero un turno"* → el bot debe ofrecer horarios REALES (lun-vie 09:00-13:00 / 17:00-20:00, cada 30 min, sin horarios pasados).
2. Paciente elige un horario y da su nombre → el bot confirma SOLO tras `ok:true`, con día y hora exactos.
3. Médico: `turnos` → la agenda muestra el turno nuevo con nombre y servicio.
4. Paciente: *"quiero otro turno"* en el MISMO horario → el bot NO debe ofrecer ese slot (ya ocupado).
5. Paciente: *"no puedo ir, cancelalo"* → el bot lista/confirma → cancela → médico: `turnos` ya no lo muestra.
6. Paciente vuelve a pedir ese horario → ahora SÍ está disponible (el slot se liberó).
7. Chequeo de cobro intacto: paciente pide su receta (flujo Fase 1) → sigue funcionando con las tools compuestas.
8. Revisar `/tmp/medi_dev.log`: ver las líneas `[wa] agente steps=… tools=[consultar_disponibilidad,…]` y que no haya errores.

- [ ] **Step 4: Commit de cierre** (si hubo ajustes durante la prueba en vivo, commitearlos con mensaje descriptivo; si no, nada que commitear).

---

## Fuera de alcance de este plan (decidido, no re-debatir)

- **Recordatorios de confirmación** (cron + plantilla HSM): a producción, junto con Meta real / Vercel Pro / Supabase pago.
- **Panel/UI de agenda y carga de horarios self-service**: Fase 3 (ahí se escribe el camino con sesión, sobre el RLS que esta migración ya deja listo).
- **Google Calendar**: no se porta (la agenda vive en la DB).
- **`enviar_material` / catálogo con fotos**: era del SaaS general; un consultorio no lo necesita.
- **`derivar_a_humano`**: la toma humana sigue siendo `bot_pausado` manual (como Fases 0/1); la alarma `necesita_humano` end-to-end es Fase 3.

## Self-review (hecho al escribir el plan)

- **Spec §7 cubierto:** tablas re-keyeadas ✓ (Task 1) · `slots.ts` 1:1 ✓ (Task 2) · camino service-role del bot ✓ (Task 5; el de sesión va con la UI en Fase 3, anotado) · tools `consultar_disponibilidad`/`reservar_turno` ✓ (Task 6, + `cancelar_turno` por decisión del dueño) · constraint anti-overbooking EXCLUDE gist ✓ (Task 1) · cron de confirmaciones → diferido a producción por decisión del dueño ✓ · Google Calendar diferido ✓.
- **Tipos consistentes entre tasks:** `ServicioLite` (Task 4) lo importan Tasks 5 y 6 · `DayAvailability`/`esSlotOfrecido` (Task 2) los importan Tasks 5 y 6 · `armarStartsAtISO`/`fmtFechaLarga`/`fmtFechaCorta`/`fmtHora` (Task 3) los importan Tasks 5 y 6 · `crearTurno` devuelve `{ok:true}|{ok:false,error}` y así lo consume la tool ✓.
- **Sin placeholders:** todo el código está completo en cada step.

# Fase 3A · Parte 1 — Motor del consultorio (DB + bot) · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar el motor de la etapa 3A funcionando del lado del bot y de la base: migraciones (sobreturnos, pacientes, OS suspendidas, bitácora, trazabilidad), la base de pacientes que se arma sola, la alarma `necesita_humano`, el aviso de obras sociales suspendidas al reservar, y la bitácora estructurada — todo probable por WhatsApp sin tocar UI.

**Architecture:** Spec `docs/superpowers/specs/2026-06-11-fase3-panel-consultorio-design.md` (§3–§8, §10). Lógica decidible en libs puras TDD (`src/lib/consultorio/`); el bot (service-role) consume vía services existentes. **Parte 2 (las 4 pantallas del panel) se planifica al terminar esta parte** — mapeo de contexto real de los componentes de Gaby antes de escribirla. Etapa 3A NO toca ninguna policy RLS existente.

**Tech Stack:** Next.js 16 route handlers (nodejs) · `ai ^6` tools Zod · Supabase service-role + RLS molde MediCuenta · vitest.

**Prerrequisito externo (el dueño):** aplicar la migración (Task 1) en el SQL Editor de Supabase (proyecto `eylcrxhpccwobipcjzal`), como en Fases 0–2.

---

## Decisiones de implementación (concretan el spec — anotar si se discute)

- **Semáforo = ventana de Meta** (spec D13): `alerta` si `necesita_humano`; si no, `viva` si el último mensaje DEL PACIENTE fue hace <24 h; si no, `terminada`. Para no hacer N+1 sobre `wa_mensajes`, se agrega `wa_conversaciones.last_paciente_at` (la migración la backfillea y `addMensaje` la mantiene).
- **Alarma vía tool `avisar_consultorio`** (no heurística en el runner): el modelo la llama cuando el paciente pide humano / está disconforme / el bot no resuelve. Marca `necesita_humano = true` + bitácora. Se apaga desde el panel (parte 2).
- **OS suspendidas con confirmación en dos pasos** (mismo patrón que `nombre_confirmado` de Fase 2): `reservar_turno` gana el param `os_confirmada`; si la OS matchea la lista y no vino confirmación → devuelve aviso; el paciente decide y el modelo rellama con `os_confirmada:"si"`.
- **`upsertPacienteDesdeIdentidad` vive en `crearTurno`** (un solo lugar: el panel de parte 2 reusa `crearTurno`, así que cubre bot Y panel). Fire-and-forget: jamás rompe una reserva; si falla → bitácora.
- **Reglas de merge del paciente**: `nombre`/`apellido` existentes NO se pisan (una corrección manual del panel manda sobre lo que diga un turno nuevo); `obra_social` nueva SÍ pisa (la gente cambia de OS); `telefonos` acumula sin duplicar.
- **`paciente_telefono` pasa a nullable** en `wa_turnos` (turno manual del panel sin WhatsApp — spec §5.2). El bot no cambia: siempre lo manda. Tipos TS se ajustan en Task 6.
- **Bitácora never-throw**: `registrarEvento` traga todo error (loguea a consola). Un fallo de bitácora jamás afecta el flujo.
- **Sin tests unitarios de capa DB** (consistente con Fases 1–2): services se verifican con typecheck + prueba en vivo (Task 11). Lo decidible está en libs puras con TDD.

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `supabase/migrations/20260611_fase3a_consultorio.sql` | Crear | 4 tablas nuevas + ALTERs (origen/creado_por/teléfono nullable, `last_paciente_at` + backfill) |
| `src/lib/consultorio/asistencia.ts` (+test) | Crear | Puro: estado efectivo de un turno (pasado sin marca = atendido) |
| `src/lib/consultorio/semaforo.ts` (+test) | Crear | Puro: semáforo de conversación + ventana 24 h |
| `src/lib/consultorio/osSuspendidas.ts` (+test) | Crear | Puro: normalización + match tolerante de OS |
| `src/lib/consultorio/pacientes.ts` (+test) | Crear | Puro: `mergeTelefonos` |
| `src/features/whatsapp/services/bitacora.ts` | Crear | `registrarEvento` never-throw |
| `src/features/whatsapp/services/pacientesService.ts` | Crear | Upsert de `wa_pacientes` por (medico_id, dni) |
| `src/features/whatsapp/services/turnosService.ts` | Modificar | Hook upsert paciente en `crearTurno` + `getOsSuspendidas` + tipos teléfono nullable |
| `src/features/whatsapp/services/conversaciones.ts` | Modificar | `last_paciente_at` en `addMensaje` + `contarNecesitanAtencion` + `conAvisoAtencion` |
| `src/features/whatsapp/agent/toolsConsultorio.ts` | Crear | Tool `avisar_consultorio` (conversacionId inyectado) |
| `src/features/whatsapp/agent/toolsTurnos.ts` | Modificar | Aviso OS suspendida en `reservar_turno` (param `os_confirmada`) |
| `src/features/whatsapp/agent/systemPrompt.ts` | Modificar | Instrucciones: alarma + OS suspendida |
| `src/features/whatsapp/runner.ts` | Modificar | Componer tool nueva · bitácora en errores · aviso "N necesitan atención" en comandos |
| `scripts/backfill-wa-pacientes.mjs` | Crear | Carga inicial de `wa_pacientes` desde turnos existentes (idempotente) |

---

## Task 1: Migración — `wa_sobreturnos`, `wa_pacientes`, `wa_os_suspendidas`, `wa_bitacora` + ALTERs

**Files:**
- Create: `supabase/migrations/20260611_fase3a_consultorio.sql`

- [ ] **Step 1: Crear la migración**

```sql
-- ============================================================================
-- Fase 3A (parte 1) — motor del consultorio
-- Spec: docs/superpowers/specs/2026-06-11-fase3-panel-consultorio-design.md §4
-- Molde MediCuenta: RLS auth.uid()=medico_id (4 policies), índice por medico_id.
-- El bot escribe via service-role (bypass RLS) filtrando medico_id a mano.
-- ============================================================================

-- ── wa_sobreturnos: lista del día SIN hora (D3) — solo los crea el panel ─────
CREATE TABLE wa_sobreturnos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  paciente_nombre TEXT NOT NULL,
  paciente_apellido TEXT NOT NULL,
  paciente_dni TEXT,
  paciente_obra_social TEXT,
  paciente_telefono TEXT,
  cobro TEXT NOT NULL CHECK (cobro IN ('particular', 'sin_cargo')),
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'atendido', 'no_vino', 'cancelado')),
  notas TEXT,
  creado_por UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_sobreturnos_medico_fecha ON wa_sobreturnos(medico_id, fecha);
ALTER TABLE wa_sobreturnos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_sobreturnos_select" ON wa_sobreturnos FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "wa_sobreturnos_insert" ON wa_sobreturnos FOR INSERT WITH CHECK (auth.uid() = medico_id);
CREATE POLICY "wa_sobreturnos_update" ON wa_sobreturnos FOR UPDATE USING (auth.uid() = medico_id);
CREATE POLICY "wa_sobreturnos_delete" ON wa_sobreturnos FOR DELETE USING (auth.uid() = medico_id);

-- ── wa_pacientes: la base que se arma sola; el DNI unifica (D7) ──────────────
CREATE TABLE wa_pacientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dni TEXT NOT NULL CHECK (dni ~ '^[0-9]+$'), -- la llave que unifica: solo dígitos (la app normaliza)
  nombre TEXT,
  apellido TEXT,
  obra_social TEXT,
  telefonos JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (medico_id, dni)
);
CREATE INDEX idx_wa_pacientes_medico_id ON wa_pacientes(medico_id);
CREATE INDEX idx_wa_pacientes_medico_apellido ON wa_pacientes(medico_id, apellido);
ALTER TABLE wa_pacientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_pacientes_select" ON wa_pacientes FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "wa_pacientes_insert" ON wa_pacientes FOR INSERT WITH CHECK (auth.uid() = medico_id);
CREATE POLICY "wa_pacientes_update" ON wa_pacientes FOR UPDATE USING (auth.uid() = medico_id);
CREATE POLICY "wa_pacientes_delete" ON wa_pacientes FOR DELETE USING (auth.uid() = medico_id);

-- ── wa_os_suspendidas: fuente provisoria manual, "enchufable" al círculo (D9) ─
CREATE TABLE wa_os_suspendidas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre_os TEXT NOT NULL,
  nota TEXT,
  fuente TEXT NOT NULL DEFAULT 'manual' CHECK (fuente IN ('manual', 'circulo')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (medico_id, nombre_os)
);
CREATE INDEX idx_wa_os_suspendidas_medico_id ON wa_os_suspendidas(medico_id);
ALTER TABLE wa_os_suspendidas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_os_suspendidas_select" ON wa_os_suspendidas FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "wa_os_suspendidas_insert" ON wa_os_suspendidas FOR INSERT WITH CHECK (auth.uid() = medico_id);
CREATE POLICY "wa_os_suspendidas_update" ON wa_os_suspendidas FOR UPDATE USING (auth.uid() = medico_id);
CREATE POLICY "wa_os_suspendidas_delete" ON wa_os_suspendidas FOR DELETE USING (auth.uid() = medico_id);

-- ── wa_bitacora: trazas estructuradas (comida del futuro orquestador, §10/§12) ─
CREATE TABLE wa_bitacora (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  origen TEXT NOT NULL CHECK (origen IN ('agente', 'panel', 'webhook', 'gcal', 'mp')),
  nivel TEXT NOT NULL CHECK (nivel IN ('info', 'error')),
  evento TEXT NOT NULL,
  detalle JSONB NOT NULL DEFAULT '{}'::jsonb,
  conversacion_id UUID REFERENCES wa_conversaciones(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_bitacora_medico_created ON wa_bitacora(medico_id, created_at DESC);
ALTER TABLE wa_bitacora ENABLE ROW LEVEL SECURITY;
-- Lectura del médico; el panel (sesión) también inserta; el bot va por service-role.
CREATE POLICY "wa_bitacora_select" ON wa_bitacora FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "wa_bitacora_insert" ON wa_bitacora FOR INSERT WITH CHECK (auth.uid() = medico_id);

-- ── wa_turnos: trazabilidad (D2) + teléfono opcional para turno manual (§5.2) ─
ALTER TABLE wa_turnos
  ADD COLUMN origen TEXT NOT NULL DEFAULT 'bot' CHECK (origen IN ('bot', 'panel')),
  ADD COLUMN creado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE wa_turnos ALTER COLUMN paciente_telefono DROP NOT NULL;

-- ── wa_conversaciones: último mensaje DEL PACIENTE (semáforo/ventana 24h, D13) ─
ALTER TABLE wa_conversaciones ADD COLUMN last_paciente_at TIMESTAMPTZ;
UPDATE wa_conversaciones c SET last_paciente_at = (
  SELECT max(m.created_at) FROM wa_mensajes m
  WHERE m.conversacion_id = c.id AND m.direccion = 'entrante'
);
```

- [ ] **Step 2: Aplicar** — el dueño la pega en el SQL Editor de Supabase (`eylcrxhpccwobipcjzal`) → Run → "Success".

- [ ] **Step 3: Verificar** (cuando esté aplicada):

```sql
select tablename, rowsecurity from pg_tables
  where tablename in ('wa_sobreturnos','wa_pacientes','wa_os_suspendidas','wa_bitacora');
select column_name from information_schema.columns
  where table_name = 'wa_turnos' and column_name in ('origen','creado_por');
select column_name, is_nullable from information_schema.columns
  where table_name = 'wa_turnos' and column_name = 'paciente_telefono';
select column_name from information_schema.columns
  where table_name = 'wa_conversaciones' and column_name = 'last_paciente_at';
```

Expected: 4 tablas con `rowsecurity = true` · 2 filas (`origen`, `creado_por`) · `paciente_telefono` con `is_nullable = YES` · 1 fila `last_paciente_at`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260611_fase3a_consultorio.sql
git commit -m "feat(db): tablas Fase 3A (sobreturnos, pacientes, OS suspendidas, bitácora) + trazabilidad y last_paciente_at"
```

---

## Task 2: Lib pura — estado efectivo del turno (asistencia) (TDD)

Regla del spec §5.4: un turno pasado se asume atendido salvo marca `ausente` ("no vino").

**Files:**
- Create: `src/lib/consultorio/asistencia.ts`
- Test: `src/lib/consultorio/asistencia.test.ts`

- [ ] **Step 1: Test que falla**

```ts
import { describe, it, expect } from 'vitest'
import { estadoEfectivoTurno } from './asistencia'

const NOW = new Date('2026-06-15T15:00:00.000Z').getTime()

describe('estadoEfectivoTurno', () => {
  it('cancelado manda, pasado o futuro', () => {
    expect(estadoEfectivoTurno({ estado: 'cancelado', starts_at: '2026-06-15T12:00:00.000Z' }, NOW)).toBe('cancelado')
    expect(estadoEfectivoTurno({ estado: 'cancelado', starts_at: '2026-06-16T12:00:00.000Z' }, NOW)).toBe('cancelado')
  })

  it('ausente marcado → no_vino', () => {
    expect(estadoEfectivoTurno({ estado: 'ausente', starts_at: '2026-06-15T12:00:00.000Z' }, NOW)).toBe('no_vino')
  })

  it('futuro (reservado o confirmado) → proximo', () => {
    expect(estadoEfectivoTurno({ estado: 'reservado', starts_at: '2026-06-16T12:00:00.000Z' }, NOW)).toBe('proximo')
    expect(estadoEfectivoTurno({ estado: 'confirmado', starts_at: '2026-06-16T12:00:00.000Z' }, NOW)).toBe('proximo')
  })

  it('pasado sin marca → atendido (la regla anti-fricción del spec)', () => {
    expect(estadoEfectivoTurno({ estado: 'reservado', starts_at: '2026-06-15T12:00:00.000Z' }, NOW)).toBe('atendido')
    expect(estadoEfectivoTurno({ estado: 'completado', starts_at: '2026-06-15T12:00:00.000Z' }, NOW)).toBe('atendido')
  })

  it('starts_at inválido → proximo (no inventa asistencia con datos rotos)', () => {
    expect(estadoEfectivoTurno({ estado: 'reservado', starts_at: 'no-es-fecha' }, NOW)).toBe('proximo')
  })
})
```

- [ ] **Step 2: Correr y ver fallar** — `npm test -- src/lib/consultorio/asistencia.test.ts` → FAIL "Cannot find module './asistencia'".

- [ ] **Step 3: Implementar**

```ts
/** Estado efectivo de un turno para agenda/correlación (spec Fase 3 §5.4). */

export type EstadoEfectivoTurno = 'proximo' | 'atendido' | 'no_vino' | 'cancelado'

/**
 * Un turno pasado se asume atendido salvo marca explícita 'ausente'.
 * Así nadie tiene que marcar cada turno y la correlación turno→orden (3C)
 * puede confiar en "atendido".
 */
export function estadoEfectivoTurno(
  t: { estado: string; starts_at: string },
  nowMs: number,
): EstadoEfectivoTurno {
  if (t.estado === 'cancelado') return 'cancelado'
  if (t.estado === 'ausente') return 'no_vino'
  const inicio = new Date(t.starts_at).getTime()
  if (!Number.isFinite(inicio) || inicio > nowMs) return 'proximo'
  return 'atendido'
}
```

- [ ] **Step 4: Verde** — `npm test -- src/lib/consultorio/asistencia.test.ts` → PASS (5 tests).
- [ ] **Step 5: Commit**

```bash
git add src/lib/consultorio/asistencia.ts src/lib/consultorio/asistencia.test.ts
git commit -m "feat(consultorio): estado efectivo del turno — pasado sin marca = atendido (TDD)"
```

---

## Task 3: Lib pura — semáforo de conversación + ventana 24 h (TDD)

Spec D13: 🔴 `alerta` (necesita humano) > 🟢 `viva` (ventana abierta) > 🔵 `terminada`.

**Files:**
- Create: `src/lib/consultorio/semaforo.ts`
- Test: `src/lib/consultorio/semaforo.test.ts`

- [ ] **Step 1: Test que falla**

```ts
import { describe, it, expect } from 'vitest'
import { VENTANA_24H_MS, ventanaAbierta, msRestantesVentana, semaforoConversacion } from './semaforo'

const NOW = new Date('2026-06-15T12:00:00.000Z').getTime()
const HACE_1H = new Date(NOW - 3_600_000).toISOString()
const HACE_25H = new Date(NOW - 25 * 3_600_000).toISOString()

describe('ventanaAbierta', () => {
  it('abierta si el paciente escribió hace menos de 24 h', () => {
    expect(ventanaAbierta(HACE_1H, NOW)).toBe(true)
  })
  it('cerrada pasadas las 24 h, sin dato, o con fecha rota', () => {
    expect(ventanaAbierta(HACE_25H, NOW)).toBe(false)
    expect(ventanaAbierta(null, NOW)).toBe(false)
    expect(ventanaAbierta('no-es-fecha', NOW)).toBe(false)
  })
  it('borde exacto de 24 h → cerrada', () => {
    expect(ventanaAbierta(new Date(NOW - VENTANA_24H_MS).toISOString(), NOW)).toBe(false)
  })
})

describe('msRestantesVentana', () => {
  it('devuelve cuánto falta para que cierre', () => {
    expect(msRestantesVentana(HACE_1H, NOW)).toBe(VENTANA_24H_MS - 3_600_000)
  })
  it('cerrada o sin dato → 0', () => {
    expect(msRestantesVentana(HACE_25H, NOW)).toBe(0)
    expect(msRestantesVentana(null, NOW)).toBe(0)
  })
})

describe('semaforoConversacion', () => {
  it('necesita_humano gana siempre → alerta', () => {
    expect(semaforoConversacion({ necesita_humano: true, last_paciente_at: HACE_25H }, NOW)).toBe('alerta')
  })
  it('ventana abierta → viva', () => {
    expect(semaforoConversacion({ necesita_humano: false, last_paciente_at: HACE_1H }, NOW)).toBe('viva')
  })
  it('ventana cerrada → terminada (vuelve a viva sola cuando el paciente escriba)', () => {
    expect(semaforoConversacion({ necesita_humano: false, last_paciente_at: HACE_25H }, NOW)).toBe('terminada')
    expect(semaforoConversacion({ necesita_humano: false, last_paciente_at: null }, NOW)).toBe('terminada')
  })
})
```

- [ ] **Step 2: Correr y ver fallar** — `npm test -- src/lib/consultorio/semaforo.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```ts
/** Semáforo de la bandeja (spec Fase 3 D13/§6): la regla coincide con la ventana de Meta. */

export const VENTANA_24H_MS = 24 * 60 * 60 * 1000

export type Semaforo = 'alerta' | 'viva' | 'terminada'

export function ventanaAbierta(lastPacienteAt: string | null, nowMs: number): boolean {
  if (!lastPacienteAt) return false
  const t = new Date(lastPacienteAt).getTime()
  if (!Number.isFinite(t)) return false
  return nowMs - t < VENTANA_24H_MS
}

export function msRestantesVentana(lastPacienteAt: string | null, nowMs: number): number {
  if (!ventanaAbierta(lastPacienteAt, nowMs)) return 0
  return new Date(lastPacienteAt as string).getTime() + VENTANA_24H_MS - nowMs
}

export function semaforoConversacion(
  c: { necesita_humano: boolean; last_paciente_at: string | null },
  nowMs: number,
): Semaforo {
  if (c.necesita_humano) return 'alerta'
  return ventanaAbierta(c.last_paciente_at, nowMs) ? 'viva' : 'terminada'
}
```

- [ ] **Step 4: Verde** — `npm test -- src/lib/consultorio/semaforo.test.ts` → PASS (8 tests).
- [ ] **Step 5: Commit**

```bash
git add src/lib/consultorio/semaforo.ts src/lib/consultorio/semaforo.test.ts
git commit -m "feat(consultorio): semáforo de conversaciones alineado a la ventana de 24h de Meta (TDD)"
```

---

## Task 4: Lib pura — match tolerante de OS suspendidas (TDD)

**Files:**
- Create: `src/lib/consultorio/osSuspendidas.ts`
- Test: `src/lib/consultorio/osSuspendidas.test.ts`

- [ ] **Step 1: Test que falla**

```ts
import { describe, it, expect } from 'vitest'
import { normalizarOs, esOsSuspendida } from './osSuspendidas'

describe('normalizarOs', () => {
  it('minúsculas, sin acentos, espacios colapsados', () => {
    expect(normalizarOs('  OSEP   Catamarca ')).toBe('osep catamarca')
    expect(normalizarOs('Médife')).toBe('medife')
  })
})

describe('esOsSuspendida', () => {
  const lista = ['OSEP', 'Swiss Medical']

  it('match exacto, case/acentos-insensible', () => {
    expect(esOsSuspendida(lista, 'osep')).toBe(true)
    expect(esOsSuspendida(lista, 'SWISS MEDICAL')).toBe(true)
  })

  it('match parcial en ambas direcciones ("osep" vs "OSEP Catamarca")', () => {
    expect(esOsSuspendida(lista, 'OSEP Catamarca')).toBe(true)
    expect(esOsSuspendida(['OSEP Catamarca'], 'osep')).toBe(true)
  })

  it('sin match → false', () => {
    expect(esOsSuspendida(lista, 'PAMI')).toBe(false)
  })

  it('"particular" y vacío JAMÁS están suspendidos', () => {
    expect(esOsSuspendida(['particular'], 'particular')).toBe(false)
    expect(esOsSuspendida(lista, '')).toBe(false)
  })
})
```

- [ ] **Step 2: Correr y ver fallar** — `npm test -- src/lib/consultorio/osSuspendidas.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```ts
/** Match tolerante de obras sociales suspendidas (spec Fase 3 D9/§8.4). */

export function normalizarOs(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * ¿La OS que dijo el paciente está en la lista de suspendidas del médico?
 * Match exacto o parcial bidireccional ("osep" ↔ "OSEP Catamarca").
 * "particular" no es una obra social: nunca está suspendido.
 */
export function esOsSuspendida(suspendidas: string[], osPaciente: string): boolean {
  const os = normalizarOs(osPaciente)
  if (!os || os === 'particular') return false
  return suspendidas.some((s) => {
    const n = normalizarOs(s)
    if (!n || n === 'particular') return false
    return n === os || os.includes(n) || n.includes(os)
  })
}
```

- [ ] **Step 4: Verde** — `npm test -- src/lib/consultorio/osSuspendidas.test.ts` → PASS (6 tests).
- [ ] **Step 5: Commit**

```bash
git add src/lib/consultorio/osSuspendidas.ts src/lib/consultorio/osSuspendidas.test.ts
git commit -m "feat(consultorio): match tolerante de OS suspendidas (TDD)"
```

---

## Task 5: Bitácora — `registrarEvento` never-throw + errores del runner

**Files:**
- Create: `src/features/whatsapp/services/bitacora.ts`
- Modify: `src/features/whatsapp/runner.ts` (catch del agente, línea ~233-236; catch del OCR, línea ~127-131)

- [ ] **Step 1: Implementar el servicio**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export type BitacoraOrigen = 'agente' | 'panel' | 'webhook' | 'gcal' | 'mp'

export interface EventoBitacora {
  medicoId?: string | null
  origen: BitacoraOrigen
  nivel: 'info' | 'error'
  evento: string
  detalle?: unknown
  conversacionId?: string | null
}

/**
 * Traza estructurada del sistema (spec Fase 3 §10) — la comida del futuro
 * orquestador (§12). NUNCA lanza: un fallo de bitácora no puede afectar el flujo.
 */
export async function registrarEvento(db: SupabaseClient, ev: EventoBitacora): Promise<void> {
  try {
    const { error } = await db.from('wa_bitacora').insert({
      medico_id: ev.medicoId ?? null,
      origen: ev.origen,
      nivel: ev.nivel,
      evento: ev.evento,
      detalle: (ev.detalle as object) ?? {},
      conversacion_id: ev.conversacionId ?? null,
    })
    if (error) console.error('[bitacora] insert error:', error.message)
  } catch (e) {
    console.error('[bitacora] error inesperado:', e)
  }
}
```

- [ ] **Step 2: Integrar en el runner.** En `src/features/whatsapp/runner.ts`:

a) Agregar el import (junto a los demás de services):

```ts
import { registrarEvento } from '@/features/whatsapp/services/bitacora'
```

b) En `handlePaciente`, el catch del agente pasa de:

```ts
  } catch (e) {
    console.error('[wa] agent error:', e)
    return
  }
```

a:

```ts
  } catch (e) {
    console.error('[wa] agent error:', e)
    await registrarEvento(db, {
      medicoId: canal.medicoId,
      origen: 'agente',
      nivel: 'error',
      evento: 'agente_error',
      detalle: { error: String(e) },
      conversacionId,
    })
    return
  }
```

c) En `cargarRecetaDesdePdf`, el catch del OCR pasa de:

```ts
  } catch (e) {
    console.error('[wa] OCR receta error:', e)
    await responder(canal, incoming.from, '✖ No pude leer ese PDF. Reenviá el original que baja de la app de OSEP.')
    return
  }
```

a:

```ts
  } catch (e) {
    console.error('[wa] OCR receta error:', e)
    await registrarEvento(db, {
      medicoId: canal.medicoId,
      origen: 'agente',
      nivel: 'error',
      evento: 'ocr_receta_error',
      detalle: { error: String(e) },
    })
    await responder(canal, incoming.from, '✖ No pude leer ese PDF. Reenviá el original que baja de la app de OSEP.')
    return
  }
```

- [ ] **Step 3: Verificar** — `npm run typecheck` → sin errores; `npm test` → los existentes verdes.
- [ ] **Step 4: Commit**

```bash
git add src/features/whatsapp/services/bitacora.ts src/features/whatsapp/runner.ts
git commit -m "feat(consultorio): bitácora estructurada never-throw + trazas de errores del runner"
```

---

## Task 6: Pacientes — `mergeTelefonos` (TDD) + upsert por DNI + hook en `crearTurno`

**Files:**
- Create: `src/lib/consultorio/pacientes.ts`
- Test: `src/lib/consultorio/pacientes.test.ts`
- Create: `src/features/whatsapp/services/pacientesService.ts`
- Modify: `src/features/whatsapp/services/turnosService.ts` (tipos teléfono nullable + hook en `crearTurno`)

- [ ] **Step 1: Test que falla (mergeTelefonos)**

```ts
import { describe, it, expect } from 'vitest'
import { mergeTelefonos } from './pacientes'

describe('mergeTelefonos', () => {
  it('agrega un teléfono nuevo al final', () => {
    expect(mergeTelefonos(['543834222049'], '543834551234')).toEqual(['543834222049', '543834551234'])
  })
  it('no duplica', () => {
    expect(mergeTelefonos(['543834222049'], '543834222049')).toEqual(['543834222049'])
  })
  it('ignora vacío/null y tolera base no-array (jsonb roto)', () => {
    expect(mergeTelefonos(['543834222049'], '')).toEqual(['543834222049'])
    expect(mergeTelefonos(['543834222049'], null)).toEqual(['543834222049'])
    expect(mergeTelefonos(null, '543834222049')).toEqual(['543834222049'])
    expect(mergeTelefonos('basura' as unknown, '543834222049')).toEqual(['543834222049'])
  })
  it('filtra elementos no-string de la base', () => {
    expect(mergeTelefonos(['543834222049', 7 as unknown as string], '543834551234')).toEqual([
      '543834222049',
      '543834551234',
    ])
  })
})
```

- [ ] **Step 2: Correr y ver fallar** — `npm test -- src/lib/consultorio/pacientes.test.ts` → FAIL.

- [ ] **Step 3: Implementar la lib pura**

```ts
/** Helpers puros de la base de pacientes (spec Fase 3 §7). */

/** Acumula teléfonos sin duplicar; tolera jsonb roto (no-array, elementos no-string). */
export function mergeTelefonos(existentes: unknown, nuevo: string | null | undefined): string[] {
  const base = Array.isArray(existentes) ? existentes.filter((x): x is string => typeof x === 'string') : []
  const tel = (nuevo ?? '').trim()
  if (!tel || base.includes(tel)) return base
  return [...base, tel]
}
```

- [ ] **Step 4: Verde** — `npm test -- src/lib/consultorio/pacientes.test.ts` → PASS (4 tests).

- [ ] **Step 5: Implementar `pacientesService.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { mergeTelefonos } from '@/lib/consultorio/pacientes'

export interface IdentidadPaciente {
  nombre: string
  apellido: string
  /** Ya normalizado (solo dígitos) por el caller. Sin DNI no hay paciente (spec §5/§7). */
  dni: string
  obraSocial?: string | null
  telefono?: string | null
}

/**
 * La base de pacientes se arma sola: upsert por (medico_id, dni).
 * Reglas de merge (plan parte 1): nombre/apellido existentes NO se pisan (una
 * corrección manual del panel manda); la obra social nueva SÍ pisa (la gente
 * cambia de OS); los teléfonos se acumulan sin duplicar.
 */
export async function upsertPacienteDesdeIdentidad(
  db: SupabaseClient,
  medicoId: string,
  p: IdentidadPaciente,
): Promise<void> {
  if (!p.dni) return

  const { data: existente } = await db
    .from('wa_pacientes')
    .select('id, nombre, apellido, obra_social, telefonos')
    .eq('medico_id', medicoId)
    .eq('dni', p.dni)
    .maybeSingle()

  if (!existente) {
    const { error } = await db.from('wa_pacientes').insert({
      medico_id: medicoId,
      dni: p.dni,
      nombre: p.nombre.trim() || null,
      apellido: p.apellido.trim() || null,
      obra_social: p.obraSocial?.trim() || null,
      telefonos: mergeTelefonos([], p.telefono),
    })
    if (error) throw error
    return
  }

  const e = existente as {
    id: string
    nombre: string | null
    apellido: string | null
    obra_social: string | null
    telefonos: unknown
  }
  const { error } = await db
    .from('wa_pacientes')
    .update({
      nombre: e.nombre || p.nombre.trim() || null,
      apellido: e.apellido || p.apellido.trim() || null,
      obra_social: p.obraSocial?.trim() || e.obra_social || null,
      telefonos: mergeTelefonos(e.telefonos, p.telefono),
      updated_at: new Date().toISOString(),
    })
    .eq('medico_id', medicoId)
    .eq('id', e.id)
  if (error) throw error
}
```

- [ ] **Step 6: Hook en `crearTurno` + teléfono nullable.** En `src/features/whatsapp/services/turnosService.ts`:

a) Imports nuevos al tope:

```ts
import { upsertPacienteDesdeIdentidad } from '@/features/whatsapp/services/pacientesService'
import { registrarEvento } from '@/features/whatsapp/services/bitacora'
```

b) `TurnoRow.paciente_telefono` pasa de `string` a `string | null` (línea ~24).

c) `CrearTurnoInput.pacienteTelefono` pasa de `string` a `string | null` y su comentario queda: `/** Normalizado con normalizeRecipient, o null (turno manual sin WhatsApp). */`

d) En el insert de `crearTurno`, la línea `paciente_telefono: input.pacienteTelefono,` pasa a:

```ts
    paciente_telefono: input.pacienteTelefono || null,
```

e) El `return { ok: true }` final de `crearTurno` (después del insert exitoso) pasa a:

```ts
  // La base de pacientes se arma sola (spec §7). Jamás rompe la reserva.
  try {
    await upsertPacienteDesdeIdentidad(db, medicoId, {
      nombre: input.pacienteNombre,
      apellido: input.pacienteApellido,
      dni: input.pacienteDni,
      obraSocial: input.pacienteObraSocial,
      telefono: input.pacienteTelefono,
    })
  } catch (e) {
    await registrarEvento(db, {
      medicoId,
      origen: 'agente',
      nivel: 'error',
      evento: 'upsert_paciente_fallido',
      detalle: { error: String(e), dni: input.pacienteDni },
    })
  }
  return { ok: true }
```

f) En `resumenTurnos`, el fallback de `quien` pasa de `|| t.paciente_telefono` a `|| t.paciente_telefono || '(sin datos)'` (el teléfono ahora puede ser null).

- [ ] **Step 7: Verificar** — `npm run typecheck` → sin errores (si aparece un error de tipo por `paciente_telefono` en otro archivo, ese consumidor asume non-null: ajustarlo igual que el punto f). `npm test` → verdes.
- [ ] **Step 8: Commit**

```bash
git add src/lib/consultorio/pacientes.ts src/lib/consultorio/pacientes.test.ts src/features/whatsapp/services/pacientesService.ts src/features/whatsapp/services/turnosService.ts
git commit -m "feat(consultorio): base de pacientes auto-armada por DNI desde crearTurno (TDD en merge)"
```

---

## Task 7: `last_paciente_at` + aviso "N necesitan atención" en comandos del médico

**Files:**
- Modify: `src/features/whatsapp/services/conversaciones.ts`
- Modify: `src/features/whatsapp/runner.ts` (comandos `recetas` y `turnos`)

- [ ] **Step 1: Mantener `last_paciente_at` en `addMensaje`.** En `conversaciones.ts`, el update final de `addMensaje` pasa de:

```ts
  await db
    .from('wa_conversaciones')
    .update({ last_message_at: new Date().toISOString() })
    .eq('medico_id', args.medicoId)
    .eq('id', args.conversacionId)
```

a:

```ts
  const ahora = new Date().toISOString()
  const update: Record<string, string> = { last_message_at: ahora }
  if (args.direccion === 'entrante') update.last_paciente_at = ahora // ventana 24h (semáforo)
  await db
    .from('wa_conversaciones')
    .update(update)
    .eq('medico_id', args.medicoId)
    .eq('id', args.conversacionId)
```

- [ ] **Step 2: Agregar al final de `conversaciones.ts`:**

```ts
export async function contarNecesitanAtencion(db: SupabaseClient, medicoId: string): Promise<number> {
  const { count } = await db
    .from('wa_conversaciones')
    .select('id', { count: 'exact', head: true })
    .eq('medico_id', medicoId)
    .eq('necesita_humano', true)
  return count ?? 0
}

/** Suma al texto de un comando del médico el aviso de conversaciones esperando humano (spec §6). */
export async function conAvisoAtencion(db: SupabaseClient, medicoId: string, texto: string): Promise<string> {
  const n = await contarNecesitanAtencion(db, medicoId)
  if (n === 0) return texto
  return `${texto}\n\n⚠️ Además: ${n === 1 ? '1 conversación necesita' : `${n} conversaciones necesitan`} atención humana.`
}
```

- [ ] **Step 3: Usarlo en el runner.** En `runner.ts`:

a) Sumar `conAvisoAtencion` al import existente de `./services/conversaciones`:

```ts
import {
  ensureContacto,
  ensureConversacion,
  isBotPausado,
  addMensaje,
  loadHistorial,
  conAvisoAtencion,
} from '@/features/whatsapp/services/conversaciones'
```

b) Los dos comandos de resumen pasan de:

```ts
  if (/^(recetas|estado)$/i.test(texto)) {
    await responder(canal, incoming.from, await resumenRecetas(db, canal.medicoId))
    return
  }
  if (/^(turnos|agenda)$/i.test(texto)) {
    await responder(canal, incoming.from, await resumenTurnos(db, canal.medicoId))
    return
  }
```

a:

```ts
  if (/^(recetas|estado)$/i.test(texto)) {
    await responder(canal, incoming.from, await conAvisoAtencion(db, canal.medicoId, await resumenRecetas(db, canal.medicoId)))
    return
  }
  if (/^(turnos|agenda)$/i.test(texto)) {
    await responder(canal, incoming.from, await conAvisoAtencion(db, canal.medicoId, await resumenTurnos(db, canal.medicoId)))
    return
  }
```

- [ ] **Step 4: Verificar** — `npm run typecheck` → sin errores; `npm test` → verdes.
- [ ] **Step 5: Commit**

```bash
git add src/features/whatsapp/services/conversaciones.ts src/features/whatsapp/runner.ts
git commit -m "feat(consultorio): last_paciente_at para la ventana 24h + aviso de atención pendiente en comandos"
```

---

## Task 8: Tool `avisar_consultorio` — la alarma `necesita_humano`

**Files:**
- Create: `src/features/whatsapp/agent/toolsConsultorio.ts`
- Modify: `src/features/whatsapp/runner.ts` (componer la tool, pasar `conversacionId`)
- Modify: `src/features/whatsapp/agent/systemPrompt.ts` (instrucción en LÍMITES)

- [ ] **Step 1: Implementar la tool**

```ts
import { tool } from 'ai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { registrarEvento } from '@/features/whatsapp/services/bitacora'

export interface ConsultorioToolsCtx {
  db: SupabaseClient
  medicoId: string
  conversacionId: string | null
}

/** Tool de alarma (spec Fase 3 D6/§6): el bot levanta la mano; el panel la atiende. */
export function buildConsultorioTools(ctx: ConsultorioToolsCtx) {
  return {
    avisar_consultorio: tool({
      description:
        'Avisa al consultorio que esta conversación necesita atención HUMANA. Usala cuando el paciente pida hablar con una persona, esté disconforme/enojado, o no puedas resolver lo que necesita con tus otras tools.',
      inputSchema: z.object({
        motivo: z.string().describe('Motivo breve del aviso, tal como lo entendés (ej. "pide hablar con una persona").'),
      }),
      execute: async ({ motivo }) => {
        if (!ctx.conversacionId) {
          return { ok: true, mensaje: 'Aviso registrado. Decile que el consultorio fue notificado y le van a responder por acá.' }
        }
        const { error } = await ctx.db
          .from('wa_conversaciones')
          .update({ necesita_humano: true, updated_at: new Date().toISOString() })
          .eq('medico_id', ctx.medicoId)
          .eq('id', ctx.conversacionId)
        if (error) {
          console.error('[wa] avisar_consultorio error:', error.message)
          return { ok: false, error: 'No pude registrar el aviso. Decile al paciente que reintente en unos minutos.' }
        }
        await registrarEvento(ctx.db, {
          medicoId: ctx.medicoId,
          origen: 'agente',
          nivel: 'info',
          evento: 'necesita_humano',
          detalle: { motivo: motivo.trim().slice(0, 200) },
          conversacionId: ctx.conversacionId,
        })
        return {
          ok: true,
          mensaje: 'Aviso registrado. Decile al paciente que el consultorio ya fue notificado y le van a responder por este mismo chat.',
        }
      },
    }),
  }
}
```

- [ ] **Step 2: Componer en el runner.** En `runner.ts`:

a) Import nuevo (junto a los de agent):

```ts
import { buildConsultorioTools } from '@/features/whatsapp/agent/toolsConsultorio'
```

b) En `handlePaciente`, la composición de tools pasa de:

```ts
  const tools = { ...buildPacienteTools(toolsCtx), ...buildTurnosTools(toolsCtx) }
```

a:

```ts
  const tools = {
    ...buildPacienteTools(toolsCtx),
    ...buildTurnosTools(toolsCtx),
    ...buildConsultorioTools({ db, medicoId: canal.medicoId, conversacionId }),
  }
```

- [ ] **Step 3: Instrucción en el system prompt.** En `systemPrompt.ts`, dentro del bloque `LÍMITES:` y debajo de la línea de IDENTIDAD HONESTA, agregar:

```ts
    `- Si el paciente pide hablar con una PERSONA, está disconforme, o no podés resolver lo que necesita con tus tools: llamá a avisar_consultorio y decile que el consultorio ya fue avisado y le van a responder por este mismo chat. No insistas con seguir resolviéndolo vos.`,
```

- [ ] **Step 4: Verificar** — `npm run typecheck` → sin errores; `npm test` → verdes.
- [ ] **Step 5: Commit**

```bash
git add src/features/whatsapp/agent/toolsConsultorio.ts src/features/whatsapp/runner.ts src/features/whatsapp/agent/systemPrompt.ts
git commit -m "feat(consultorio): alarma necesita_humano — tool avisar_consultorio + instrucción del agente"
```

---

## Task 9: Aviso de OS suspendida en `reservar_turno` (confirmación en dos pasos)

**Files:**
- Modify: `src/features/whatsapp/services/turnosService.ts` (agregar `getOsSuspendidas`)
- Modify: `src/features/whatsapp/agent/toolsTurnos.ts` (param `os_confirmada` + check)
- Modify: `src/features/whatsapp/agent/systemPrompt.ts` (instrucción en TURNOS)

- [ ] **Step 1: Lectura de la lista en `turnosService.ts`** (agregar al final del archivo):

```ts
/** Lista de OS suspendidas del médico (fuente provisoria manual — spec D9). */
export async function getOsSuspendidas(db: SupabaseClient, medicoId: string): Promise<string[]> {
  const { data, error } = await db
    .from('wa_os_suspendidas')
    .select('nombre_os')
    .eq('medico_id', medicoId)
  if (error) {
    console.error('[turnos] os_suspendidas read error:', error.message)
    return [] // fallo de lectura ≠ bloquear reservas: sin aviso es el degradado seguro
  }
  return ((data as { nombre_os: string }[] | null) ?? []).map((r) => r.nombre_os)
}
```

- [ ] **Step 2: Check en `toolsTurnos.ts`.**

a) Imports nuevos:

```ts
import { esOsSuspendida } from '@/lib/consultorio/osSuspendidas'
import { registrarEvento } from '@/features/whatsapp/services/bitacora'
```

y sumar `getOsSuspendidas` al import existente de `turnosService`.

b) En el `inputSchema` de `reservar_turno`, debajo de `nombre_confirmado`, agregar:

```ts
        os_confirmada: z
          .string()
          .describe('"si" SOLO si la tool te avisó que la obra social está SUSPENDIDA y el paciente confirmó que igual quiere reservar (como particular). "" en cualquier otro caso.'),
```

c) La firma del `execute` suma el campo: `async ({ servicio, fecha, hora, nombre_paciente, apellido_paciente, dni_paciente, obra_social, motivo_consulta, nombre_confirmado, os_confirmada }) => {`

d) Inmediatamente DESPUÉS del bloque que valida `obra_social.trim()` (el `if (!obra_social.trim()) {...}`), agregar:

```ts
        // OS suspendida por el círculo (spec D9): avisar, no bloquear — el paciente decide.
        const suspendidas = await getOsSuspendidas(ctx.db, ctx.medicoId)
        if (esOsSuspendida(suspendidas, obra_social) && os_confirmada.trim().toLowerCase() !== 'si') {
          await registrarEvento(ctx.db, {
            medicoId: ctx.medicoId,
            origen: 'agente',
            nivel: 'info',
            evento: 'aviso_os_suspendida',
            detalle: { obra_social: obra_social.trim().slice(0, 60) },
          })
          return {
            ok: false,
            error: `AVISO: por el momento la atención por "${obra_social.trim()}" está suspendida — la consulta sería PARTICULAR (se abona en el consultorio). Explicáselo al paciente y preguntale si quiere reservar igual. SOLO si acepta, llamá de nuevo con os_confirmada:"si".`,
          }
        }
```

- [ ] **Step 3: Instrucción en el system prompt.** En `systemPrompt.ts`, dentro del bloque `TURNOS`, debajo de la línea que arranca con `- Si reservar_turno te avisa que el nombre parece MAL ESCRITO`, agregar:

```ts
    `- Si reservar_turno te avisa que la obra social está SUSPENDIDA: transmitile el aviso tal cual (la consulta sería particular, se abona en el consultorio) y preguntale si quiere reservar igual. SOLO si acepta, volvé a llamar con os_confirmada:"si". No lo decidas por él.`,
```

- [ ] **Step 4: Verificar** — `npm run typecheck` → sin errores; `npm test` → verdes (las tools no tienen suite propia; el match está testeado en Task 4).
- [ ] **Step 5: Commit**

```bash
git add src/features/whatsapp/services/turnosService.ts src/features/whatsapp/agent/toolsTurnos.ts src/features/whatsapp/agent/systemPrompt.ts
git commit -m "feat(consultorio): aviso de OS suspendida al reservar — informa, no bloquea (os_confirmada)"
```

---

## Task 10: Backfill de `wa_pacientes` desde los turnos existentes

**Files:**
- Create: `scripts/backfill-wa-pacientes.mjs`

- [ ] **Step 1: Implementar** (patrón `seed-wa-turnos.mjs`; idempotente — usa el mismo criterio de merge que el service):

```js
// Carga inicial de wa_pacientes desde wa_turnos existentes (spec Fase 3 §7).
// Idempotente: corre las veces que haga falta. El turno MÁS NUEVO de cada DNI
// aporta la obra social; nombre/apellido existentes en wa_pacientes no se pisan.
// Uso: node --env-file=.env.local scripts/backfill-wa-pacientes.mjs
import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data: turnos, error } = await db
  .from('wa_turnos')
  .select('medico_id, paciente_nombre, paciente_apellido, paciente_dni, paciente_obra_social, paciente_telefono, created_at')
  .not('paciente_dni', 'is', null)
  .order('created_at', { ascending: true })
if (error) {
  console.error('Error leyendo wa_turnos:', error)
  process.exit(1)
}

// Agrupar por (medico, dni): el más nuevo pisa OS; los teléfonos se acumulan.
const porClave = new Map()
for (const t of turnos ?? []) {
  const dni = (t.paciente_dni ?? '').trim()
  if (!dni) continue
  const clave = `${t.medico_id}|${dni}`
  const prev = porClave.get(clave)
  const telefonos = new Set(prev?.telefonos ?? [])
  if (t.paciente_telefono) telefonos.add(t.paciente_telefono)
  porClave.set(clave, {
    medico_id: t.medico_id,
    dni,
    nombre: prev?.nombre || t.paciente_nombre || null,
    apellido: prev?.apellido || t.paciente_apellido || null,
    obra_social: t.paciente_obra_social || prev?.obra_social || null,
    telefonos,
  })
}

let creados = 0
let actualizados = 0
for (const p of porClave.values()) {
  const { data: existente } = await db
    .from('wa_pacientes')
    .select('id, nombre, apellido, obra_social, telefonos')
    .eq('medico_id', p.medico_id)
    .eq('dni', p.dni)
    .maybeSingle()

  if (!existente) {
    const { error: insError } = await db.from('wa_pacientes').insert({
      medico_id: p.medico_id,
      dni: p.dni,
      nombre: p.nombre,
      apellido: p.apellido,
      obra_social: p.obra_social,
      telefonos: [...p.telefonos],
    })
    if (insError) {
      console.error(`Error insertando DNI ${p.dni}:`, insError)
      process.exit(1)
    }
    creados++
    continue
  }

  const telefonos = new Set([
    ...(Array.isArray(existente.telefonos) ? existente.telefonos : []),
    ...p.telefonos,
  ])
  const { error: updError } = await db
    .from('wa_pacientes')
    .update({
      nombre: existente.nombre || p.nombre,
      apellido: existente.apellido || p.apellido,
      obra_social: p.obra_social || existente.obra_social,
      telefonos: [...telefonos],
      updated_at: new Date().toISOString(),
    })
    .eq('id', existente.id)
  if (updError) {
    console.error(`Error actualizando DNI ${p.dni}:`, updError)
    process.exit(1)
  }
  actualizados++
}

console.log(`✓ Backfill wa_pacientes: ${creados} creados, ${actualizados} actualizados (${porClave.size} pacientes únicos)`)
```

- [ ] **Step 2: Correr** (requiere Task 1 aplicada):

```bash
node --env-file=.env.local scripts/backfill-wa-pacientes.mjs
```

Expected: `✓ Backfill wa_pacientes: N creados, 0 actualizados (...)` con N ≥ 1 (los turnos E2E de la Fase 2 tienen DNI). Re-corrida: `0 creados, N actualizados` (idempotente).

- [ ] **Step 3: Verificar en SQL Editor:**

```sql
select dni, nombre, apellido, obra_social, jsonb_array_length(telefonos) as tels from wa_pacientes;
```

Expected: una fila por DNI distinto usado en las pruebas de Fase 2.

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-wa-pacientes.mjs
git commit -m "chore(consultorio): backfill idempotente de wa_pacientes desde turnos existentes"
```

---

## Task 11: Verificación integral + prueba en vivo del bot

- [ ] **Step 1: Suite completa**

```bash
npm test          # Expected: ~132 tests verdes (109 existentes + ~23 nuevos), 0 fallos
npm run typecheck # Expected: sin errores
npm run build     # Expected: build OK
```

> `npm run lint` sigue roto (deuda conocida) — NO usarlo como gate.

- [ ] **Step 2: Levantar la infra efímera** (igual que Fase 2; gotchas del HANDOFF: URL de túnel nueva → webhook de Meta + `PUBLIC_BASE_URL` + reiniciar dev; token temporal de Meta probablemente vencido → renovar en el panel y re-correr `node --env-file=.env.local scripts/seed-wa-canal.mjs 924014ac-fb0a-4d9c-9028-49535e5e2e60 543834403010`):

```bash
cd ~/proyectos/Medicuenta-V2.0
nohup npm run dev > /tmp/medi_dev.log 2>&1 &
sleep 8 && grep -m1 "Local:" /tmp/medi_dev.log
nohup cloudflared tunnel --url http://localhost:3000 > /tmp/cf_tunnel.log 2>&1 &
sleep 6 && grep -m1 "trycloudflare.com" /tmp/cf_tunnel.log
```

- [ ] **Step 3: Sembrar una OS suspendida de prueba** (SQL Editor):

```sql
insert into wa_os_suspendidas (medico_id, nombre_os, nota)
values ('924014ac-fb0a-4d9c-9028-49535e5e2e60', 'OSEP', 'prueba en vivo 3A')
on conflict (medico_id, nombre_os) do nothing;
```

- [ ] **Step 4: Guion E2E por WhatsApp** (médico `543834403010`, paciente de prueba `543834222049`):

1. Paciente pide turno y al dar la obra social dice **"OSEP"** → el bot debe AVISAR que está suspendida (consulta particular) y preguntar si reserva igual. Decir "sí" → reserva OK. Verificar en SQL: `select evento from wa_bitacora order by created_at desc limit 5;` → aparece `aviso_os_suspendida`.
2. Verificar que el turno creó/actualizó el paciente: `select dni, telefonos from wa_pacientes;` → el DNI usado aparece con el teléfono del paciente de prueba.
3. Paciente escribe **"quiero hablar con una persona"** → el bot responde que avisó al consultorio. Verificar: `select necesita_humano from wa_conversaciones;` → `true`, y `wa_bitacora` tiene `necesita_humano`.
4. Médico manda `turnos` → el resumen termina con "⚠️ Además: 1 conversación necesita atención humana."
5. Paciente con OS NO suspendida (decir "PAMI") reserva sin aviso → flujo normal intacto.
6. Apagar la alarma a mano para dejar limpio (el botón llega en parte 2): `update wa_conversaciones set necesita_humano = false;`
7. Borrar la OS de prueba: `delete from wa_os_suspendidas where nota = 'prueba en vivo 3A';`

- [ ] **Step 5: Commit de cierre** (si hubo ajustes en vivo; si no, nada que commitear).

---

## Fuera de alcance de este plan (decidido — no re-debatir)

- **Las 4 pantallas del panel** (/agenda, /conversaciones, /pacientes, /consultorio/config) + servicios de datos con sesión + API de respuesta humana: **plan parte 2**, que se escribe al cerrar esta parte mapeando los componentes reales de Gaby.
- **Sobreturnos**: la tabla queda creada acá; su CRUD es 100% panel (parte 2). El bot no los toca jamás.
- **Etapa 3B** (secretaria/RLS delegada) y **3C** (GCal, correlación, pulido): planes propios según el spec.

## Self-review (hecho al escribir el plan)

- **Spec §4 cubierto**: 4 tablas ✓ (T1) · ALTERs origen/creado_por/teléfono ✓ (T1) · `last_paciente_at` no estaba en el spec pero es la implementación sin N+1 del semáforo D13 — anotada como decisión de implementación ✓.
- **Spec §5–§8 (lado bot)**: asistencia ✓ (T2) · semáforo ✓ (T3) · OS suspendidas aviso ✓ (T4+T9) · pacientes auto + backfill ✓ (T6+T10) · alarma ✓ (T8) · aviso en comandos ✓ (T7) · bitácora ✓ (T5). Lo visual → parte 2 (explícito).
- **Tipos consistentes**: `esOsSuspendida(string[], string)` (T4) = uso en T9 ✓ · `registrarEvento(db, EventoBitacora)` (T5) = usos en T6/T8/T9 ✓ · `IdentidadPaciente.dni` ya normalizado — `crearTurno` recibe `pacienteDni` ya normalizado por la tool (Fase 2) ✓ · `pacienteTelefono: string | null` consistente en input/insert/resumen ✓.
- **Sin placeholders**: todo el código completo en cada step.

# Rama médico del bot = agente de IA — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir la rama de texto del médico en el bot de WhatsApp (parser de 4 comandos regex) en un agente de IA conversacional que consulta agenda/recetas, fija el precio (con confirmación) y da ayuda de plataforma.

**Architecture:** Espejo de la rama paciente (`handlePaciente`): `handleMedico` (texto) → conversación propia + historial → `runAgentTurn({ systemPrompt: buildSystemPromptMedico(...), historial, tools: buildMedicoTools(ctx) })` → responder + persistir + bitácora + usoIa. El PDF sigue determinístico (`cargarRecetaDesdePdf`, sin cambios).

**Tech Stack:** Vercel AI SDK (`generateText`/`tool`), Zod, Supabase (service-role), TypeScript.

## Global Constraints

- **Testing (convención del repo):** solo funciones puras (`src/lib/`, prompt-builders) se unit-testean; los tools (services con Supabase) y `runner.ts` NO. Verificación = `npm run typecheck` + `npm run test` (**385 tests baseline**). NO tests con mock de Supabase.
- **Cada task queda con typecheck VERDE.** Tareas 1 y 2 son ADITIVAS (archivos nuevos); la Task 3 hace el wiring y limpia lo muerto.
- **Alcance (no-objetivos del spec):** NO se cargan órdenes/débitos/cirugías por WhatsApp; NO OCR de foto de orden; NO se toca la rama paciente ni el flujo de PDF de recetas del médico.
- **Prompt del médico = administrativo, NO clínico.** Confirmar el monto ANTES de fijar el precio. La carga pesada se deriva a la app.
- **Idioma/tono:** español rioplatense (voseo), breve (WhatsApp).
- Rama: `mejoras-post-checklist`. Un commit por task.

---

### Task 1: `buildSystemPromptMedico` + test

**Files:**
- Create: `src/features/whatsapp/agent/systemPromptMedico.ts`
- Create: `src/features/whatsapp/agent/systemPromptMedico.test.ts`

**Interfaces:**
- Produces: `buildSystemPromptMedico(opts: { nombreMedico?: string | null }): string`

- [ ] **Step 1: Escribir el test (TDD)**

Crear `src/features/whatsapp/agent/systemPromptMedico.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildSystemPromptMedico } from './systemPromptMedico'

describe('buildSystemPromptMedico', () => {
  const prompt = buildSystemPromptMedico({ nombreMedico: 'Juan Pérez' })

  it('es administrativo y explícitamente NO clínico', () => {
    expect(prompt).toMatch(/administrativo/i)
    expect(prompt).toMatch(/no.*cl[íi]nic/i)
  })

  it('obliga a confirmar el precio antes de fijarlo', () => {
    expect(prompt).toMatch(/confirm/i)
    expect(prompt).toContain('fijar_precio_receta')
  })

  it('deriva la carga pesada (órdenes/débitos/cirugías) a la app', () => {
    expect(prompt).toMatch(/órdenes|d[ée]bitos|cirug/i)
    expect(prompt).toMatch(/en la app|desde MediCuenta/i)
  })

  it('incluye el nombre del médico', () => {
    expect(prompt).toContain('Juan Pérez')
  })
})
```

- [ ] **Step 2: Correr el test → falla**

Run: `npx vitest run src/features/whatsapp/agent/systemPromptMedico.test.ts`
Expected: FAIL (`Cannot find module './systemPromptMedico'`).

- [ ] **Step 3: Implementar el prompt-builder**

Crear `src/features/whatsapp/agent/systemPromptMedico.ts`:

```ts
import { fmtFechaHoraLarga } from '@/lib/turnos/formato'

/** System prompt del asistente ADMINISTRATIVO que atiende al MÉDICO por WhatsApp (no clínico). */
export function buildSystemPromptMedico(opts: { nombreMedico?: string | null }): string {
  const nombre = opts.nombreMedico?.trim()
  const dueño = nombre ? `del Dr./Dra. ${nombre}` : 'de tu consultorio'
  return [
    `Sos el asistente ADMINISTRATIVO de MediCuenta ${dueño}, hablando con el médico por WhatsApp.`,
    `Hoy es ${fmtFechaHoraLarga(Date.now())} (hora argentina). Usá esta fecha para interpretar "hoy", "mañana", etc.`,
    `Tono cordial, claro y BREVE (es WhatsApp).`,
    ``,
    `NO sos un asistente clínico: no das contenido médico. Tu trabajo es la operatoria de facturación y agenda del consultorio.`,
    ``,
    `TUS CAPACIDADES (tools):`,
    `- consultar_agenda: la agenda de turnos de los próximos 7 días.`,
    `- estado_recetas: el estado de las recetas cargadas (pendientes, pagadas, entregadas).`,
    `- fijar_precio_receta: fija cuánto se le cobra al paciente por gestionar cada receta.`,
    `- ayuda_plataforma: cómo usar MediCuenta.`,
    ``,
    `La carga pesada (órdenes de consulta, débitos, cirugías) se hace en la APP, no por WhatsApp. Si el médico te la pide, decile que la haga desde MediCuenta.`,
    ``,
    `REGLAS:`,
    `- Antes de fijar el precio: CONFIRMÁ el monto con el médico ("¿Te fijo la receta en $X?") y recién con el sí llamá a fijar_precio_receta. Si el médico dice "sí" sin que vos hayas propuesto antes un monto en esta charla, preguntá cuál.`,
    `- Nunca inventes datos: usá SIEMPRE las tools. Si una tool devuelve { error }, explicáselo.`,
    `- No afirmes que hiciste algo (fijar el precio) sin que la tool lo haya confirmado en este turno.`,
    `- Si el médico manda un PDF de receta, el sistema lo procesa solo — vos no hacés nada con eso.`,
    `- Para dudas de cómo usar la plataforma, usá ayuda_plataforma.`,
  ].join('\n')
}
```

- [ ] **Step 4: Correr el test → pasa**

Run: `npx vitest run src/features/whatsapp/agent/systemPromptMedico.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Typecheck + suite**

Run: `npm run typecheck && npm run test`
Expected: sin errores, `389 passed` (385 + 4 nuevos).

- [ ] **Step 6: Commit**

```bash
git add src/features/whatsapp/agent/systemPromptMedico.ts src/features/whatsapp/agent/systemPromptMedico.test.ts
git commit -m "feat(bot): buildSystemPromptMedico (agente administrativo del médico) + test"
```

---

### Task 2: `buildMedicoTools`

**Files:**
- Create: `src/features/whatsapp/agent/toolsMedico.ts`

**Interfaces:**
- Consumes: `resumenTurnos(db, medicoId)`, `resumenRecetas(db, medicoId)`, `setPrecioReceta(db, medicoId, monto)`, `PLATFORM_KNOWLEDGE`.
- Produces: `interface MedicoToolsCtx { db: SupabaseClient; medicoId: string }`; `buildMedicoTools(ctx: MedicoToolsCtx)` → objeto con las tools `consultar_agenda`, `estado_recetas`, `fijar_precio_receta`, `ayuda_plataforma`.

Aditivo (no se cablea hasta la Task 3) → typecheck verde.

- [ ] **Step 1: Crear el archivo de tools**

Crear `src/features/whatsapp/agent/toolsMedico.ts`:

```ts
import { tool } from 'ai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resumenTurnos } from '@/features/whatsapp/services/turnosService'
import { resumenRecetas } from '@/features/whatsapp/services/recetasService'
import { setPrecioReceta } from '@/features/whatsapp/services/configAgente'
import { PLATFORM_KNOWLEDGE } from '@/features/assistant/config/platformKnowledge'

export interface MedicoToolsCtx {
  db: SupabaseClient
  medicoId: string
}

/** Tools del agente que atiende al MÉDICO por WhatsApp. medico_id INYECTADO (webhook sin sesión). */
export function buildMedicoTools(ctx: MedicoToolsCtx) {
  return {
    consultar_agenda: tool({
      description: 'Muestra la agenda de turnos de los próximos 7 días del médico.',
      inputSchema: z.object({}),
      execute: async () => ({ resumen: await resumenTurnos(ctx.db, ctx.medicoId) }),
    }),

    estado_recetas: tool({
      description: 'Muestra el estado de las recetas cargadas por el médico (pendientes, pagadas, entregadas).',
      inputSchema: z.object({}),
      execute: async () => ({ resumen: await resumenRecetas(ctx.db, ctx.medicoId) }),
    }),

    fijar_precio_receta: tool({
      description:
        'Fija el monto que se le cobra al paciente por gestionar cada receta. CONFIRMÁ el monto con el médico ANTES de llamar a esta tool.',
      inputSchema: z.object({ monto: z.number().describe('Monto en pesos, ej: 5000') }),
      execute: async ({ monto }) => {
        if (!Number.isFinite(monto) || monto <= 0) return { error: 'El monto tiene que ser un número mayor a cero.' }
        await setPrecioReceta(ctx.db, ctx.medicoId, monto)
        return { ok: true as const, monto }
      },
    }),

    ayuda_plataforma: tool({
      description: 'Responde dudas del médico sobre cómo usar MediCuenta (la app).',
      inputSchema: z.object({ tema: z.string().describe('Sobre qué pregunta el médico') }),
      execute: async () => ({ info: PLATFORM_KNOWLEDGE }),
    }),
  }
}
```

- [ ] **Step 2: Typecheck + suite**

Run: `npm run typecheck && npm run test`
Expected: sin errores (los 4 imports se usan; `buildMedicoTools` exportado aunque todavía sin usar), `389 passed`.

- [ ] **Step 3: Commit**

```bash
git add src/features/whatsapp/agent/toolsMedico.ts
git commit -m "feat(bot): buildMedicoTools (agenda, recetas, fijar precio, ayuda) para el agente médico"
```

---

### Task 3: Cablear `handleMedico` al agente + limpiar el parser

**Files:**
- Modify: `src/features/whatsapp/runner.ts`

**Interfaces:**
- Consumes: `buildSystemPromptMedico` (Task 1), `buildMedicoTools` (Task 2). Ya importados en `runner.ts`: `ensureContacto`, `ensureConversacion`, `addMensaje`, `loadHistorial`, `runAgentTurn`, `registrarEvento`, `registrarUsoIa`, `responder`, `cargarRecetaDesdePdf`.

- [ ] **Step 1: Agregar los dos imports nuevos**

En `src/features/whatsapp/runner.ts`, junto a los imports del agente (cerca de `runAgentTurn`):

```ts
import { buildMedicoTools } from '@/features/whatsapp/agent/toolsMedico'
import { buildSystemPromptMedico } from '@/features/whatsapp/agent/systemPromptMedico'
```

- [ ] **Step 2: Reescribir `handleMedico` (rama texto → agente)**

Reemplazar TODO el cuerpo de `handleMedico` (desde `async function handleMedico(...)` hasta su `}` de cierre, ANTES de `cargarRecetaDesdePdf`) por:

```ts
async function handleMedico(db: Db, canal: CanalResuelto, incoming: IncomingMessage): Promise<void> {
  if (incoming.type === 'document') {
    await cargarRecetaDesdePdf(db, canal, incoming)
    return
  }

  // Rama texto = agente de IA administrativo (espejo del paciente, sin toma-humana ni entrega).
  const contactoId = await ensureContacto(db, canal.medicoId, incoming.from, incoming.contactName)
  const conversacionId = await ensureConversacion(db, canal.medicoId, contactoId)
  await addMensaje(db, {
    medicoId: canal.medicoId,
    conversacionId,
    direccion: 'entrante',
    origen: 'medico',
    contenido: incoming.text ?? '',
    wamid: incoming.messageId,
  })

  const { data: cfgRow } = await db
    .from('wa_config_agente')
    .select('nombre_medico')
    .eq('medico_id', canal.medicoId)
    .maybeSingle()
  const nombreMedico = (cfgRow as { nombre_medico: string | null } | null)?.nombre_medico ?? null

  const historial = await loadHistorial(db, canal.medicoId, conversacionId, 12)
  const tools = buildMedicoTools({ db, medicoId: canal.medicoId })
  const systemPrompt = buildSystemPromptMedico({ nombreMedico })

  let reply: string
  try {
    const turno = await runAgentTurn({ systemPrompt, historial, tools })
    reply = turno.text
    await registrarUsoIa(db, {
      medicoId: canal.medicoId,
      origen: 'whatsapp',
      modelo: turno.modelo,
      usage: turno.usage,
      conversacionId,
    })
    if (turno.resumen.tools.length > 0) {
      await registrarEvento(db, {
        medicoId: canal.medicoId,
        origen: 'agente',
        nivel: 'info',
        evento: 'agente_medico_turno',
        detalle: { ...turno.resumen },
        conversacionId,
      })
    }
  } catch (e) {
    console.error('[wa] agente médico error:', e)
    await registrarEvento(db, {
      medicoId: canal.medicoId,
      origen: 'agente',
      nivel: 'error',
      evento: 'agente_medico_error',
      detalle: { error: String(e) },
      conversacionId,
    })
    await responder(canal, incoming.from, 'Perdoná, tuve un problema para procesar tu mensaje 🙏 Probá de nuevo en un ratito.')
    return
  }

  if (!reply) return
  await responder(canal, incoming.from, reply)
  await addMensaje(db, {
    medicoId: canal.medicoId,
    conversacionId,
    direccion: 'saliente',
    origen: 'ia',
    contenido: reply,
  })
}
```

- [ ] **Step 3: Borrar el menú de ayuda muerto**

Eliminar la constante `AYUDA_MEDICO` (el array/string con `"• 'precio 5000' …"`, `"• 'recetas' …"`, `"• 'turnos' …"`).

- [ ] **Step 4: Limpiar imports que quedaron sin uso**

Correr para ver qué quedó sin referencias en `runner.ts`:

```bash
cd /Users/hector/proyectos/Medicuenta-V2.0
for sym in resumenRecetas resumenTurnos parseMontoArs setPrecioReceta conAvisoAtencion AYUDA_MEDICO; do
  echo "$sym: $(grep -c "\b$sym\b" src/features/whatsapp/runner.ts)"; done
```

Para cada símbolo cuyo conteo sea 1 (solo la línea del import/definición, sin uso), eliminar ese import/definición. Notas esperadas:
- `resumenRecetas`: quitar del import (mantener `crearRecetaDesdeOcr` de la misma línea).
- `resumenTurnos`: quitar el import.
- `parseMontoArs`: quitar del import (mantener `normalizarDni`).
- `setPrecioReceta`: quitar del import.
- `getPrecioReceta`: **NO tocar** (lo usa `cargarRecetaDesdePdf`).
- `conAvisoAtencion`: si quedó en 0/1 usos, quitar su import/definición; si sigue usándose en otra rama, dejarlo.

- [ ] **Step 5: Typecheck + suite + build**

Run: `npm run typecheck && npm run test`
Expected: sin errores, `389 passed`.

Run: `npm run build`
Expected: build limpio (compila el webhook `/api/whatsapp`).

- [ ] **Step 6: Commit**

```bash
git add src/features/whatsapp/runner.ts
git commit -m "feat(bot): rama médico del bot = agente de IA (reemplaza el parser de comandos)

handleMedico (texto) pasa a runAgentTurn con buildMedicoTools + buildSystemPromptMedico
(espejo del paciente): conversación propia + historial + bitácora + usoIa. Elimina los
4 regex y AYUDA_MEDICO. El PDF sigue determinístico. Cierra el gap 'la rama médico no
escribe wa_mensajes'."
```

---

## Cierre

Al terminar: el médico le habla al bot en lenguaje natural (agenda, recetas, precio con confirmación, ayuda), no a un parser. El PDF de recetas sigue igual. Pendiente: **E2E manual** por WhatsApp (multi-turno + confirmación de precio; y verificar que un schema de tool sin params —`z.object({})`— no rompa con el proveedor de IA; si rompe, agregar un param trivial opcional). Los writes pesados (órdenes/débitos) siguen en la app (posible follow-up con Fase 9).

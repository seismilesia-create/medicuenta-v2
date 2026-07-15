# Rama médico del bot = agente de IA — Diseño

**Fecha:** 2026-07-15
**Backlog:** item #14 de `docs/superpowers/specs/2026-07-10-backlog-post-e2e.md`
**Rama:** `mejoras-post-checklist`

## Contexto

En el bot de WhatsApp, la rama del PACIENTE ya es un agente de IA (`handlePaciente` →
`runAgentTurn` con tools de cobro/turnos). La rama del MÉDICO (`handleMedico` en
`src/features/whatsapp/runner.ts`) es un **parser de 4 comandos regex**: `precio N`, `recetas`,
`turnos`/`agenda`, y PDF; cualquier otra cosa → menú de ayuda fijo (`AYUDA_MEDICO`). Héctor lo
critica fuerte: el paciente le habla a un agente, el médico a un parser. Alinea con la visión
agéntica del proyecto convertirlo en agente.

## Objetivo

Convertir la rama de TEXTO del médico en un **agente de IA conversacional** que cubra, en lenguaje
natural, lo que hoy hacen los comandos: consultar la agenda, ver el estado de las recetas, fijar el
precio de la receta (con confirmación), y ayuda de plataforma. El agente es **administrativo, no
clínico**.

## No-objetivos (fuera de alcance — decisión de alcance del brainstorm)

- **No** se cargan órdenes/débitos/cirugías por WhatsApp (writes pesados con inputs complejos → se
  siguen haciendo en la app). No se reusan los tools de escritura del asistente in-app.
- **No** entra el OCR de foto de orden (`analizar_imagen_orden`) — eso es Fase 9 del E2E, ítem
  aparte.
- **No** se toca la rama del PACIENTE ni el flujo de PDF de recetas del médico (queda determinístico).
- **No** se agrega agenda por fecha puntual: `consultar_agenda` devuelve el resumen de próximos 7
  días (la fecha-específica es mejora futura).

## Estado actual relevante (verificado)

- `handleMedico(db, canal, incoming)` (`runner.ts:82`): si `document` → `cargarRecetaDesdePdf`
  (determinístico, se conserva); si texto → 4 regex + `AYUDA_MEDICO`.
- Patrón de agente ya existente (rama paciente, `runner.ts:222-290`):
  `runAgentTurn({ systemPrompt, historial, tools })` → `{ text, cobros, resumen, usage, modelo }`
  (`agent/runAgentTurn.ts:24,68`); tools vía `build*Tools(ctx)` con `ctx.db` (service-role) +
  `ctx.medicoId` inyectado; historial vía `loadHistorial`; logging de bitácora + `registrarUsoIa`.
- Servicios reutilizables (todos `(db, medicoId)`):
  - `resumenTurnos(db, medicoId): Promise<string>` (`services/turnosService.ts:325`).
  - `resumenRecetas(db, medicoId): Promise<string>` (`services/recetasService.ts`).
  - `getPrecioReceta(db, medicoId): Promise<number|null>` / `setPrecioReceta(db, medicoId, monto): Promise<void>` (`services/configAgente.ts:3,13`).
  - `ensureContacto`/`ensureConversacion`/`addMensaje`/`loadHistorial` (`services/conversaciones.ts`).
- El asistente **in-app** (`src/features/assistant/config/tools.ts`) NO es reutilizable tal cual:
  sus tools usan `createClient()` (sesión del médico, RLS). El bot corre en webhook **sin sesión**
  (service-role + medicoId inyectado). Solo es reutilizable lo PURO: `PLATFORM_KNOWLEDGE`
  (`assistant/config/platformKnowledge.ts`, const string).
- Ruteo: `resolverIngreso` decide médico-vs-paciente por `numero_personal` (nodos.ts) **antes** de
  cualquier lógica de contacto → representar al médico como contacto para el historial NO afecta el
  ruteo.
- Gap conocido (memoria): "la rama médico no escribe wa_mensajes". Este diseño lo cierra.

## Diseño

### Arquitectura — `handleMedico`

```
handleMedico(db, canal, incoming):
  if incoming.type === 'document': return cargarRecetaDesdePdf(...)   // SIN CAMBIOS
  // texto → agente médico (espejo de handlePaciente, sin toma-humana ni entrega):
  contactoId = ensureContacto(db, medicoId, incoming.from, incoming.contactName)
  conversacionId = ensureConversacion(db, medicoId, contactoId)
  addMensaje(entrante)
  historial = loadHistorial(db, medicoId, conversacionId, 12)
  tools = buildMedicoTools({ db, medicoId })
  systemPrompt = buildSystemPromptMedico({ nombreMedico, ... })
  turno = runAgentTurn({ systemPrompt, historial, tools })   // try/catch → fallback
  responder(turno.text); addMensaje(saliente)
  registrarUsoIa(...); if turno.resumen.tools.length: registrarEvento(bitácora)
```

- Se **eliminan** los 4 regex y `AYUDA_MEDICO` (el agente cubre todo en lenguaje natural).
- **No** hay `isBotPausado` (el takeover humano no aplica: es el médico con su propio bot).
- **No** hay entrega de recetas pendientes (eso es del paciente).

### Tools — `buildMedicoTools(ctx)` (nuevo `src/features/whatsapp/agent/toolsMedico.ts`)

`ctx = { db: SupabaseClient; medicoId: string }`. Cuatro tools (patrón AI SDK `tool({...})`):

1. **`consultar_agenda`** — sin args. `execute` → `{ resumen: await resumenTurnos(db, medicoId) }`.
   Devuelve el resumen de próximos 7 días.
2. **`estado_recetas`** — sin args. `execute` → `{ resumen: await resumenRecetas(db, medicoId) }`.
3. **`fijar_precio_receta`** — `{ monto: number }`. `execute` → `setPrecioReceta(db, medicoId, monto)`
   y devuelve `{ ok: true, monto }`. **Write con efecto**: el system prompt obliga al agente a
   CONFIRMAR el monto con el médico (segundo turno, usando el historial) ANTES de llamarla. La tool
   valida `monto` finito y > 0; si no, `{ error }`.
4. **`ayuda_plataforma`** — `{ tema: string }`. `execute` → `{ info: PLATFORM_KNOWLEDGE }` (reusa el
   const del in-app; el agente extrae del texto lo relevante al `tema`).

Todas sin dependencia de sesión (solo `db` service-role + `medicoId`).

### System prompt — `buildSystemPromptMedico(...)` (nuevo `src/features/whatsapp/agent/systemPromptMedico.ts`)

Función pura que arma el prompt. Contenido:
- **Identidad:** "Sos el asistente administrativo de MediCuenta del Dr./Dra. {nombre}, por WhatsApp."
  Tono cordial, claro y **breve** (es WhatsApp). Incluye la fecha de hoy (hora AR) para interpretar
  "hoy/mañana".
- **Es administrativo, NO clínico:** no da contenido médico; su trabajo es la operatoria de
  facturación/agenda.
- **Capacidades (tools):** consultar agenda, estado de recetas, fijar precio de receta, ayuda de la
  plataforma. Aclara que **la carga pesada (órdenes, débitos, cirugías) se hace en la app**, no por
  WhatsApp; si el médico lo pide, lo deriva a la app.
- **Reglas duras:**
  - CONFIRMÁ el monto antes de llamar `fijar_precio_receta` ("¿Te fijo la receta en $X?" → recién con
    el sí, llamás la tool).
  - Nunca inventes datos: usá SIEMPRE las tools; si una devuelve `{ error }`, explicalo.
  - Si el médico manda un **PDF de receta**, el sistema lo procesa solo — vos no hacés nada con eso.
  - No afirmes que hiciste algo (fijar precio) sin que la tool lo haya confirmado en este turno.
- El prompt NO embebe el conocimiento de plataforma: toda la ayuda sale de la tool
  `ayuda_plataforma` (que devuelve `PLATFORM_KNOWLEDGE`). El prompt solo instruye a usar esa tool
  cuando el médico pregunta cómo usar MediCuenta.

### Persistencia / historial

- El médico obtiene **conversación propia** reutilizando `wa_conversaciones`/`wa_mensajes` vía
  `ensureContacto`/`ensureConversacion` con su `numero_personal` (representado como contacto de su
  propio número). Habilita el multi-turno (confirmación de precio) y **cierra el gap de wa_mensajes**
  (bonus: auditoría/bitácora del lado médico). El ruteo no se ve afectado (médico se decide por
  número, upstream).
- Se cargan ~12 mensajes de contexto (`loadHistorial`).
- Bitácora `origen:'agente'` cuando el turno usó tools + `registrarUsoIa` (mismos best-effort que el
  paciente).

### Error handling

- `try/catch` alrededor de `runAgentTurn` con un mensaje de fallback (espejo del paciente:
  "Perdón, tuve un problema. Probá de nuevo en un momento.").
- Las tools devuelven `{ error }` ante fallos; el agente los transmite.

### Testing

- Convención del repo: solo funciones puras en `src/lib/`/prompt-builders se unit-testean; los tools
  (services con Supabase) no.
- **`buildSystemPromptMedico`** es puro → test (`systemPromptMedico.test.ts`) que verifique que el
  prompt incluye las reglas clave: "confirmá … antes de fijar el precio", "administrativo" / no
  clínico, y "la carga pesada … en la app". Espeja `systemPrompt.test.ts` del paciente.
- Comportamiento del agente (multi-turno, confirmación) → E2E manual por WhatsApp (queda para el
  checklist).

## Riesgos / edge cases

- **Conversación médico-self:** crear un `wa_contacto` para el número del médico es semánticamente
  raro pero inofensivo y zero-migración; el ruteo médico está upstream. Si a futuro molesta, se puede
  separar en una conversación flagged (migración) — no ahora.
- **Confirmación de precio:** depende del historial. Si el médico dice "sí" en un mensaje suelto sin
  contexto reciente, el agente no debe fijar nada (el prompt exige que la confirmación siga a un "¿te
  fijo $X?" propio en el historial).
- **Costo IA:** cada mensaje de texto del médico ahora es un turno de agente (antes, regex gratis).
  Aceptable (volumen bajo; criterio del dueño "IA sobrada"). Se registra en `registrarUsoIa`.
- **Regresión de comandos:** quien tipeaba `precio 5000` / `recetas` / `turnos` textual sigue
  funcionando (el agente lo interpreta). Se pierde la respuesta instantánea sin IA, a cambio de
  lenguaje natural.

## Cambios por archivo

- `src/features/whatsapp/agent/toolsMedico.ts` (NUEVO): `buildMedicoTools(ctx)` con las 4 tools.
- `src/features/whatsapp/agent/systemPromptMedico.ts` (NUEVO): `buildSystemPromptMedico(...)` +
  su tipo de opts.
- `src/features/whatsapp/agent/systemPromptMedico.test.ts` (NUEVO): test de estructura del prompt.
- `src/features/whatsapp/runner.ts` (MODIFICAR): `handleMedico` rama texto → agente; eliminar los 4
  regex y `AYUDA_MEDICO`; agregar imports; reusar el patrón de `handlePaciente` (conversación,
  historial, runAgentTurn, bitácora, usoIa) sin toma-humana ni entrega.
- (Reuso, sin cambios) `resumenTurnos`, `resumenRecetas`, `getPrecioReceta`/`setPrecioReceta`,
  `ensureContacto`/`ensureConversacion`/`addMensaje`/`loadHistorial`, `runAgentTurn`,
  `PLATFORM_KNOWLEDGE`.

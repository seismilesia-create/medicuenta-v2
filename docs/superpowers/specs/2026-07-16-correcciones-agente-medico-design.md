# Correcciones del agente médico post-E2E — Diseño

**Fecha:** 2026-07-16
**Origen:** hallazgos del E2E manual del #14 (agente médico del bot) corrido contra prod.
**Rama:** `fix/agente-medico-post-e2e`

## Contexto

El #14 convirtió la rama médico del bot en un agente de IA (mergeado + deployado a prod 2026-07-16). El E2E manual encontró dos problemas. Los dos son consecuencia de decisiones tomadas conscientemente en el spec del #14 — no son regresiones.

### 1. `consultar_agenda` corta a 7 días

Héctor preguntó por los turnos de "la otra semana" y después por "el jueves 23". El bot contestó honestamente que su acceso llega a 7 días (no alucinó: reportó el límite de su tool). El límite sale de `DIAS_RESUMEN_MEDICO = 7` (`turnosService.ts:20`), heredado del comando tonto `turnos`, diseñado como "visibilidad mínima": un volcado compacto con tope de 30 líneas para no pasar los 4096 chars de WhatsApp. El spec del #14 lo dejó explícito como no-objetivo: *"No se agrega agenda por fecha puntual… la fecha-específica es mejora futura"*. Esta es esa mejora.

Detalle que agrava el corte: la ventana es **rodante de 7×24hs desde el instante de la consulta**, no 7 días de calendario (`.lte('starts_at', Date.now() + 7*86_400_000)`). Preguntando 12:08 del jueves 16, el corte cayó 12:08 del jueves 23 → un turno de las 18:20 de ese día quedó afuera. Por eso el bot dijo "hasta el miércoles 22".

### 2. La conversación médico↔bot aparece en la bandeja de Conversaciones

Queda mezclada con los pacientes, arrastra botones que no le aplican ("Pausar asistente", "Liberar receta por orden de consulta"), y **la ve la secretaria**. Es consecuencia directa del diseño del #14 (darle al médico conversación propia reusando `wa_conversaciones` vía `ensureContacto`/`ensureConversacion`), riesgo que el propio spec anotó: *"crear un `wa_contacto` para el número del médico es semánticamente raro pero inofensivo… si a futuro molesta, se puede separar en una conversación flagged (migración) — no ahora"*. Molesta. Y choca con la copy de invitación de la secretaria, que dice que "nunca verá tu facturación ni las recetas".

## Objetivo

1. Que el agente conteste por la agenda de **cualquier fecha o rango** que el médico pregunte.
2. Que la conversación médico↔bot **no aparezca en la bandeja de Conversaciones** (para nadie), sin perder el historial que el agente necesita para el multi-turno.

## No-objetivos

- **No** se toca la rama paciente ni el flujo de PDF de recetas.
- **No** se agrega RLS para la conversación médico↔bot: se la oculta de la UI; no es una barrera de seguridad (ver Riesgos).
- **No** se agregan tools de escritura de agenda por WhatsApp (reservar/cancelar desde el bot del médico sigue fuera de alcance).
- **No** se toca el tope de 30 líneas / 4096 chars de WhatsApp.

## Estado actual verificado

- `resumenTurnos(db, medicoId): Promise<string>` (`turnosService.ts:325`) — **consumidor único: `toolsMedico.ts:20`**. El caller del parser viejo se borró en el #14 Task 3, así que cambiar su firma no afecta a nadie más.
- Constantes: `DIAS_RESUMEN_MEDICO = 7` (`:20`), `MAX_LINEAS_RESUMEN = 30` (`:22`).
- Query actual: `.gt('starts_at', now).lte('starts_at', now + 7d).order('starts_at').limit(30)`, estados `reservado|confirmado`.
- Helpers de hora AR ya existentes y testeados: `armarStartsAtISO(fecha, hora): string | null` (`lib/turnos/formato.ts:12` — ancla `YYYY-MM-DD` + `HH:MM` a hora AR y valida), `fmtFechaLarga(iso)` (`:28`), `AR_OFFSET = '-03:00'` / `AR_TZ` (`lib/turnos/slots.ts:6-7`).
- `getBandeja(db, medicoId)` (`panelService.ts:304`) — query a `wa_conversaciones` filtrada **solo por `medico_id`**, sin gating por rol. Consumidor único: `conversaciones-view.tsx:28`.
- `wa_conversaciones` (`migrations/20260609_whatsapp_fase0.sql:42`): `id, medico_id, contacto_id, estado, bot_pausado, necesita_humano, last_message_at, created_at, updated_at`. **Sin flag de tipo.**
- `wa_asignaciones.numero_personal` (`migrations/20260614_fase1_nodos_dinamicos.sql:38`, comment: *"para clasificar remitente médico vs paciente"*) — el número del médico. `nodos.ts:96-117` ya tiene el reverse-lookup teléfono→médico.

## Diseño — Parte 1: agenda por rango

### `resumenTurnos` parametrizado

```ts
resumenTurnos(db, medicoId, rango?: { desde?: string; hasta?: string }): Promise<string>
```

`desde`/`hasta` = fecha calendario AR, formato `YYYY-MM-DD`.

Semántica de límites — todo en **día calendario AR**, no ventana rodante:

| Caso | Piso | Techo |
|---|---|---|
| Sin `desde` ni `hasta` | **ahora** (no muestra turnos pasados) | `23:59` AR del día `hoy + DIAS_DEFAULT` |
| Solo `desde` | `00:00` AR de `desde` | `23:59` AR del día `desde + DIAS_DEFAULT` |
| `desde` + `hasta` | `00:00` AR de `desde` | `23:59` AR de `hasta` (inclusive) |
| Solo `hasta` | **ahora** | `23:59` AR de `hasta` |

El techo siempre es `23:59` del día AR correspondiente (la query usa `.lte`, así que ese minuto entra). Los turnos caen en slots de agenda, no a las 23:59:30, así que la precisión al minuto alcanza.

`DIAS_DEFAULT = 14` reemplaza a `DIAS_RESUMEN_MEDICO = 7`.

El piso es "ahora" solo cuando NO se pidió `desde`: la pregunta genérica no debe mostrar turnos pasados, pero un `desde` explícito se honra tal cual (permite "¿qué turnos tuve el lunes?" y permite pedir un día puntual completo).

**Validación:** si `armarStartsAtISO` devuelve `null` (fecha inválida) o si `hasta < desde`, `resumenTurnos` devuelve un mensaje de error legible; la tool lo transmite y el agente se lo explica al médico.

El resto de la query no cambia (estados `reservado|confirmado`, orden por `starts_at`, `limit(MAX_LINEAS_RESUMEN)`).

### Encabezado según el rango real

Hoy el encabezado es un literal hardcodeado (`📅 Turnos de los próximos 7 días (N):`), que mentiría con un rango parametrizado.

**El descriptor viaja junto con el rango, no aparte.** El bug que estamos arreglando es precisamente un encabezado desincronizado de la query que lo respalda; separar "resolver el rango" de "describirlo" deja esa misma clase de bug abierta. Por eso una sola función pura los devuelve juntos, computados de los mismos inputs:

```ts
resolverRangoAgenda(
  rango: { desde?: string; hasta?: string },
  ahoraMs: number,
): { desdeISO: string; hastaISO: string; descriptor: string } | { error: string }
```

El `descriptor` se decide sobre el **rango ya resuelto** — así los cuatro casos de entrada de la tabla anterior quedan cubiertos por tres formas de salida, sin huecos:

| Condición (sobre el rango resuelto) | Descriptor |
|---|---|
| No se pidió ni `desde` ni `hasta` | `los próximos 14 días` |
| Piso y techo caen en el **mismo día AR** | `el jueves 23 de julio` |
| Cualquier otro caso | `del lunes 20 de julio al domingo 26 de julio` |

**Las dos frases usan guion, no preposición.** El mismo `descriptor` tiene que servir en el encabezado y en el caso vacío, y en español una preposición fija no funciona en ambos: "Turnos de **el** jueves" pediría contracción ("del") mientras "para **de** los próximos" no. El guion evita la preposición en los dos lugares:

- Encabezado: `📅 Turnos — ${descriptor} (${cuenta}):` → *"📅 Turnos — el jueves 23 de julio (2):"* · *"📅 Turnos — los próximos 14 días (3):"*
- Caso vacío: `📅 No hay turnos — ${descriptor}.` → *"📅 No hay turnos — el jueves 23 de julio."*

### Tool `consultar_agenda`

```ts
consultar_agenda: tool({
  description:
    'Agenda de turnos del médico. Pasá desde/hasta (YYYY-MM-DD) para una fecha o rango puntual ' +
    '("el jueves 23", "la otra semana", "septiembre"). Sin argumentos devuelve los próximos 14 días.',
  inputSchema: z.object({
    desde: z.string().optional().describe('Fecha AR YYYY-MM-DD. Inicio del rango.'),
    hasta: z.string().optional().describe('Fecha AR YYYY-MM-DD. Fin del rango, inclusive.'),
  }),
  execute: async ({ desde, hasta }) => ({ resumen: await resumenTurnos(ctx.db, ctx.medicoId, { desde, hasta }) }),
})
```

`buildSystemPromptMedico` ya le inyecta al agente la fecha de hoy en hora AR (`fmtFechaHoraLarga(Date.now())`), así que puede resolver "el jueves 23" / "la otra semana" a fechas concretas sin ayuda extra. No hace falta tocar el prompt.

## Diseño — Parte 2: la conversación médico↔bot fuera de la bandeja

La conversación **sigue existiendo**: el agente necesita el historial para el multi-turno (la confirmación de precio depende de él). Solo se la oculta de la bandeja.

**Por qué no la ve nadie —ni el propio médico— en la app (decisión de Héctor, 2026-07-16):** el médico conversa con el bot desde su propio celular; si quiere releer lo que habló, lo lee ahí. Ese hilo no tiene por qué existir en el dashboard. Por eso NO se gatea por rol (que era la alternativa "médico sí / secretaria no"): simplemente no aparece para nadie. Es además lo más robusto en privacidad — lo que no se lista, ningún bug futuro de roles lo expone.

### Migración — `supabase/migrations/20260716_conversacion_medico.sql`

```sql
ALTER TABLE wa_conversaciones ADD COLUMN es_medico BOOLEAN NOT NULL DEFAULT false;

-- Backfill: marcar las conversaciones cuyo contacto es el numero_personal del médico.
-- Comparación por los ÚLTIMOS 10 DÍGITOS (= número nacional argentino), NO por el string
-- completo: `wa_contactos.telefono` llega crudo del webhook (`549…`, 13 dígitos) y
-- `wa_asignaciones.numero_personal` pasa por `normalizarWhatsappAr` (`54…`, 12 dígitos, SIN
-- el 9 de móvil). Comparar los strings enteros matchea 0 filas SIEMPRE — el 9 es un dígito,
-- así que `regexp_replace(…, '\D', …)` no lo saca. Los últimos 10 son inmunes a las variantes
-- de prefijo (54 / 549 / 0 / 15), igual que hace `normalizeRecipient` en el código.
UPDATE wa_conversaciones c
SET es_medico = true
FROM wa_contactos ct, wa_asignaciones a
WHERE c.contacto_id = ct.id
  AND c.medico_id = a.medico_id
  AND right(regexp_replace(ct.telefono, '\D', '', 'g'), 10)
    = right(regexp_replace(a.numero_personal, '\D', '', 'g'), 10);
```

### Escritura — `handleMedico` marca la conversación

```ts
ensureConversacion(db, medicoId, contactoId, esMedico = false)
```

El default preserva la rama paciente byte-idéntica — mismo patrón que el `userOrigen` de `loadHistorial` que introdujo el #14. `handleMedico` pasa `true`. El flag se setea en el INSERT; las conversaciones médico-self pre-existentes las cubre el backfill.

### Lectura — `getBandeja` la excluye

`getBandeja` agrega `.eq('es_medico', false)`. La segunda query (preview de `wa_mensajes`) filtra por los `conversacion_id` ya filtrados, así que no necesita cambios. `hilo-panel` no se toca: si la conversación no está en la bandeja, no hay por dónde entrar.

## Riesgos / edge cases

- **⚠️ El ocultamiento es de UI, NO una barrera de RLS.** La conversación sigue existiendo y la RLS actual (que le da a la secretaria vinculada acceso a las conversaciones del médico) no cambia: una secretaria con acceso directo a la API podría leerla igual. **Decisión consciente**: Héctor pidió que no *aparezca*, y eso lo resuelve. Si se quiere una barrera real, es un follow-up de RLS sobre `wa_conversaciones`/`wa_mensajes` filtrando `es_medico = true` — nada en este diseño lo impide (el flag es justamente lo que esa policy necesitaría).
- **Rango muy amplio** ("todo el año") → se trunca a 30 líneas con el aviso que ya existe ("… mostrando los primeros 30"). El agente puede sugerir achicar el rango. No se agrega un cap (YAGNI).
- **Fecha pasada explícita** → permitida (piso = 00:00 de ese día). Es la lectura honesta de "¿qué turnos tuve el lunes?".
- **Zona horaria** → todo ancla a hora AR vía `armarStartsAtISO`. Argentina no tiene DST y `AR_OFFSET` ya es la convención del repo.
- **Backfill y normalización** → los dos lados se guardan en formatos distintos por diseño (`wa_contactos.telefono` crudo del webhook = `549…`; `numero_personal` normalizado = `54…` sin el 9), así que la comparación DEBE ser por los últimos 10 dígitos. Comparar los strings completos matchea 0 filas y falla **en silencio** — es la misma clase de bug que arregló el #6 de la tanda anterior, y el docstring de `normalizarWhatsappAr` ya la narra. **Verificado contra la base real** (read-only): con la comparación completa → 0 filas; con los últimos 10 → 1 fila (la conversación médico↔bot que existe hoy). Si a futuro fallara igual, el efecto es cosmético (esa conversación sigue en la bandeja) y se corrige a mano.
- **Alucinación de fechas** → si el agente arma un `desde`/`hasta` inválido, la validación devuelve `{ error }` legible en vez de una query rara.

## Testing

Convención del repo: solo funciones puras se unit-testean; los services con Supabase y `runner.ts` van a E2E.

- **`resolverRangoAgenda(rango, ahoraMs)`** (puro, nuevo) — es donde vive toda la lógica arreglada, así que se testea a fondo:
  - Default (sin args) → piso = `ahoraMs`, techo = `23:59` de hoy+14, descriptor `los próximos 14 días`.
  - Solo `desde` → piso = `00:00` de `desde`, techo = `23:59` de `desde`+14.
  - Solo `hasta` → piso = `ahoraMs`, techo = `23:59` de `hasta`.
  - `desde` == `hasta` (día único) → descriptor `el <día>`, y **el techo incluye todo ese día** (la regresión concreta del E2E: un turno 18:20 del día pedido debe entrar).
  - `desde` != `hasta` → descriptor `del <A> al <B>`.
  - Fecha inválida (`armarStartsAtISO` → null) → `{ error }`.
  - `hasta` < `desde` → `{ error }`.
  - **Anti-regresión de la ventana rodante**: con `ahoraMs` al mediodía y `desde`=`hasta`=hoy, el techo debe ser `23:59` de hoy — no `mediodía + 24h`.
- `resumenTurnos` (query), `ensureConversacion`, `getBandeja` → E2E manual (convención del repo).

## Cambios por archivo

- `src/lib/turnos/rangoAgenda.ts` (NUEVO) — `resolverRangoAgenda` (pura): rango + descriptor juntos.
- `src/lib/turnos/rangoAgenda.test.ts` (NUEVO) — sus tests.
- `src/features/whatsapp/services/turnosService.ts` — `resumenTurnos` acepta `rango`; `DIAS_DEFAULT = 14` reemplaza `DIAS_RESUMEN_MEDICO`; usa `resolverRangoAgenda` para la query Y el encabezado.
- `src/features/whatsapp/agent/toolsMedico.ts` — `consultar_agenda` con `{ desde?, hasta? }`.
- `supabase/migrations/20260716_conversacion_medico.sql` (NUEVO) — columna `es_medico` + backfill.
- `src/features/whatsapp/services/conversaciones.ts` — `ensureConversacion(..., esMedico = false)`.
- `src/features/whatsapp/runner.ts` — `handleMedico` pasa `esMedico: true`.
- `src/features/consultorio/services/panelService.ts` — `getBandeja` filtra `es_medico = false`.

## Cierre

Al terminar: el médico le pregunta por cualquier fecha ("¿y el jueves 23?", "¿cómo viene septiembre?") y el agente contesta; y su chat administrativo con el bot deja de ensuciar —y de filtrarse por— la bandeja de conversaciones de pacientes. Pendiente después: E2E manual de ambos + la migración aplicada a prod.

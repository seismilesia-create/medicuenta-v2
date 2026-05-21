# PRP-005: Historial persistente del asistente con búsqueda full-text

> **Estado**: PENDIENTE
> **Fecha**: 2026-05-11
> **Proyecto**: Medicuenta V2.0

---

## Objetivo

Persistir todas las conversaciones del asistente IA (mensajes + tool calls + outputs) en Supabase con linkeo a registros creados (orden/cirugia/debito), y exponer una UI estilo ChatGPT en `/asistente` con sidebar de conversaciones y búsqueda full-text en español que permita al médico verificar qué registró y cuándo.

## Por Qué

| Problema | Solución |
|----------|----------|
| El chat actual es efímero — al recargar `/asistente` el médico pierde todo el contexto y no puede verificar si ya registró cierta orden/cirugía/débito | Persistencia completa en Supabase + búsqueda full-text por paciente/OS/práctica que linkea de vuelta al registro creado |
| Cuando el médico delega tareas al agente (ej: "registrá orden de Pérez"), no tiene forma de auditar lo que el agente hizo realmente | Cada tool call guarda input/output/id del registro creado → trazabilidad total |
| Re-explicarle contexto al asistente cada sesión es fricción y mata la UX agéntica | Conversaciones agrupadas por fecha (Hoy/Ayer/Últ. 7 días) con título auto-generado, reanudables con un click |

**Valor de negocio**: Convierte al asistente de "novedad de demo" en "herramienta diaria auditable". Es lo que separa un chatbot juguete de una bitácora médica usable. Refuerza el pitch de venta a médicos: "el agente registra y vos verificás cuándo quieras". Cero retrabajo: si el médico duda de haber cargado algo, lo busca y salta al registro.

## Qué

### Criterios de Éxito
- [ ] Cada mensaje (user + assistant + tool calls con su input/output) se persiste en `chat_mensajes` vía `onFinish` del AI SDK sin bloquear el streaming
- [ ] Cuando `registrar_orden`/`registrar_cirugia`/`registrar_debito` devuelven `success:true`, el `id` se guarda en la columna correspondiente (`orden_id`/`cirugia_id`/`debito_id`) del mensaje del tool result
- [ ] Sidebar izquierdo en `/asistente` muestra conversaciones del médico autenticado agrupadas por: Hoy / Ayer / Últimos 7 días / Este mes / Anteriores, ordenadas por `last_message_at` desc
- [ ] Click en una conversación carga sus mensajes en el panel derecho y permite continuar el chat (mismo `conversacion_id`)
- [ ] Búsqueda con input full-text (español, tsvector + GIN) sobre contenido + tool_input + tool_result; chips de filtros activos: fecha, tool, paciente
- [ ] Resultado de búsqueda permite saltar al mensaje exacto dentro de su conversación (scroll + highlight)
- [ ] Si un registro linkeado fue eliminado de la tabla original, el mensaje muestra badge "registro eliminado" sin romper la UI
- [ ] RLS aislada por `medico_id` — un médico no puede leer conversaciones de otro
- [ ] Título de conversación se auto-genera del primer mensaje del usuario (primeros ~50 chars, truncado)

### Comportamiento Esperado

**Happy path 1 — Nueva conversación**:
1. Médico entra a `/asistente` por primera vez del día → sidebar muestra historial pasado, panel derecho vacío con sugerencias
2. Escribe "Registrá una consulta de Pérez con OSEP" → se crea fila en `chat_conversaciones` con `titulo_auto = "Registrá una consulta de Pérez..."` y se envía el mensaje
3. El streaming corre normal; al terminar (`onFinish`), el server route persiste user message + assistant text + tool calls (1 fila por step) en `chat_mensajes` linkeando al `orden_id` que devolvió la tool
4. Sidebar refresca y la conversación nueva aparece en grupo "Hoy"

**Happy path 2 — Búsqueda**:
1. Médico escribe "Pérez OSEP" en el input de búsqueda del sidebar
2. Backend hace query `to_tsquery('spanish', ...)` contra el índice GIN sobre `content || tool_input::text || tool_result::text`
3. Resultados muestran snippets con highlight de la palabra buscada y a qué conversación pertenecen
4. Click en un resultado → abre la conversación + scrollea al mensaje + lo highlightea por 2s
5. Si el resultado tiene `orden_id`, muestra link "Ver orden →" que va a `/ordenes/{id}`

**Edge case — Registro eliminado**:
1. El médico eliminó la orden 123 de `/ordenes`
2. Al abrir una conversación vieja donde el agente registró esa orden, el message bubble muestra badge gris "registro eliminado" en lugar del link "Ver orden"
3. La búsqueda sigue funcionando sobre el contenido textual

---

## Contexto

### Referencias
- `src/app/api/chat/route.ts` — POST handler actual con `streamText` + tools. Hay que agregar `onFinish` callback para persistir.
- `src/features/assistant/components/AssistantPanel.tsx` — UI actual fullscreen. Hay que envolver con sidebar.
- `src/features/assistant/components/AssistantMessages.tsx` — Renderiza messages del `useChat`. Reutilizable.
- `src/features/assistant/components/ToolCallCard.tsx` — Renderiza cada tool call. Agregar badge "registro eliminado".
- `src/features/assistant/config/tools.ts` — 6 tools, las 3 de registro devuelven `{ success: true, id, ... }` que hay que capturar.
- `src/lib/supabase/server.ts` — Cliente server (usado en tools). Necesario para insertar en el route.
- AI SDK v5 docs: `streamText` con `onFinish({ messages, toolCalls, toolResults })` permite persistir post-stream.
- Postgres FTS docs: `to_tsvector('spanish', ...)`, `tsquery`, `GIN` index, `ts_headline` para snippets con highlight.

### Arquitectura Propuesta (Feature-First)

```
src/features/assistant/
├── components/
│   ├── AssistantPanel.tsx              # Refactor: ahora orquesta sidebar + chat
│   ├── AssistantSidebar.tsx            # NUEVO: lista conversaciones agrupadas + búsqueda
│   ├── AssistantSearchPanel.tsx        # NUEVO: input + chips de filtros + resultados
│   ├── ConversationItem.tsx            # NUEVO: row en sidebar (título + fecha + delete)
│   ├── AssistantMessages.tsx           # Sin cambios estructurales
│   └── ToolCallCard.tsx                # Update: soporta flag "registro_eliminado"
│
├── hooks/                              # NUEVO
│   ├── useConversations.ts             # Fetch + cache lista de conversaciones del médico
│   ├── useConversationMessages.ts      # Fetch mensajes de una conversación
│   └── useChatSearch.ts                # Debounced full-text search
│
├── services/                           # NUEVO
│   ├── conversations.ts                # CRUD conversaciones (server-only)
│   ├── messages.ts                     # Persistir mensajes + lookup de registros linkeados
│   └── search.ts                       # Full-text query con filtros
│
├── config/
│   └── tools.ts                        # Sin cambios (ya devuelven id)
│
└── types/
    └── chat-history.ts                 # NUEVO: tipos de conversación, mensaje, search result

src/app/api/chat/
└── route.ts                            # Update: recibe conversacionId, persiste en onFinish

src/app/api/chat/conversations/
├── route.ts                            # NUEVO: GET lista, POST crear
├── [id]/route.ts                       # NUEVO: GET mensajes, DELETE conversación
└── search/route.ts                     # NUEVO: GET con query + filtros
```

### Modelo de Datos

```sql
-- ============================================================================
-- Tabla 1: chat_conversaciones
-- ============================================================================
CREATE TABLE chat_conversaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo_auto TEXT NOT NULL DEFAULT 'Nueva conversación',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_conv_medico_last ON chat_conversaciones (medico_id, last_message_at DESC);

ALTER TABLE chat_conversaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "medico_owns_conversaciones"
ON chat_conversaciones FOR ALL
USING (medico_id = auth.uid())
WITH CHECK (medico_id = auth.uid());

-- ============================================================================
-- Tabla 2: chat_mensajes
-- ============================================================================
CREATE TABLE chat_mensajes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id UUID NOT NULL REFERENCES chat_conversaciones(id) ON DELETE CASCADE,
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- denormalizado para RLS rápida
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content TEXT,                            -- texto plano (user prompt o assistant response)
  tool_name TEXT,                          -- ej: 'registrar_orden'
  tool_input JSONB,                        -- argumentos que recibió la tool
  tool_result JSONB,                       -- respuesta que devolvió la tool
  orden_id UUID REFERENCES ordenes(id) ON DELETE SET NULL,
  cirugia_id UUID REFERENCES cirugias(id) ON DELETE SET NULL,
  debito_id UUID REFERENCES debitos(id) ON DELETE SET NULL,
  step_index INT,                          -- orden dentro de la conversación
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- FTS: columna generada que concatena content + tool data
  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('spanish', COALESCE(content, '')), 'A') ||
    setweight(to_tsvector('spanish', COALESCE(tool_input::text, '')), 'B') ||
    setweight(to_tsvector('spanish', COALESCE(tool_result::text, '')), 'B')
  ) STORED
);

CREATE INDEX idx_chat_msg_conv_created ON chat_mensajes (conversacion_id, created_at ASC);
CREATE INDEX idx_chat_msg_medico ON chat_mensajes (medico_id, created_at DESC);
CREATE INDEX idx_chat_msg_search ON chat_mensajes USING GIN (search_vector);
CREATE INDEX idx_chat_msg_tool ON chat_mensajes (medico_id, tool_name) WHERE tool_name IS NOT NULL;

ALTER TABLE chat_mensajes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "medico_owns_mensajes"
ON chat_mensajes FOR ALL
USING (medico_id = auth.uid())
WITH CHECK (medico_id = auth.uid());

-- ============================================================================
-- Trigger: actualizar last_message_at en conversación
-- ============================================================================
CREATE OR REPLACE FUNCTION bump_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chat_conversaciones
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversacion_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bump_conv_last_message
AFTER INSERT ON chat_mensajes
FOR EACH ROW
EXECUTE FUNCTION bump_conversation_last_message();
```

**Decisiones clave**:
- `search_vector` es `GENERATED ALWAYS AS ... STORED` — Postgres lo recalcula solo al insert/update, índice GIN siempre coherente. Cero código de mantenimiento.
- Pesos A/B: `content` pesa más (A) que el JSON de tools (B) — un nombre de paciente en el prompt rankea más alto que el mismo nombre en un dump de resultados.
- FKs a `ordenes`/`cirugias`/`debitos` con `ON DELETE SET NULL` → si el médico borra un registro, el mensaje queda pero pierde el link → de ahí sale el badge "registro eliminado".
- `medico_id` denormalizado en `chat_mensajes` → RLS por `auth.uid()` directa sin JOIN, queries de búsqueda mucho más rápidas.
- Tool calls se guardan como rows separadas con `role='tool'` → el render iterando por `step_index` reconstruye el flujo exacto que vio el médico.

---

## Blueprint (Assembly Line)

> Solo fases. Las subtareas se generan en bucle-agentico al entrar a cada fase, mapeando contexto real.

### Fase 1: Persistencia (BD + onFinish)
**Objetivo**: Crear tablas `chat_conversaciones` y `chat_mensajes` con RLS + FTS, y modificar `/api/chat/route.ts` para que:
- Reciba `conversacionId` opcional en el body (si no viene, crea una nueva)
- Persista user message antes de stream
- En `onFinish`, persista assistant text + cada tool call (input + result + id linkeado si aplica)
- No bloquee el streaming (persistencia es side-effect)

**Validación**:
- `mcp__supabase__list_tables` muestra las 2 tablas con RLS habilitada
- `mcp__supabase__get_advisors` no reporta warnings de seguridad
- Mandar un mensaje desde `/asistente` y verificar con SQL que se guardaron user + assistant + tool rows con `orden_id`/`cirugia_id`/`debito_id` poblado correctamente
- RLS aislada: un médico no ve mensajes de otro (probar con 2 cuentas)

### Fase 2: Sidebar de conversaciones
**Objetivo**: Refactorizar `AssistantPanel` para layout 2-columnas (sidebar 280px + chat). Nuevo `AssistantSidebar` con:
- Lista de conversaciones del médico autenticado, agrupadas por fecha (Hoy / Ayer / Últ. 7 días / Este mes / Anteriores)
- Botón "+ Nueva conversación" arriba
- Click en una row carga sus mensajes en el panel derecho usando `useChat`'s initial messages
- Hover muestra botón de delete (con confirm)
- Estado activo highlight en la conversación actual
- Responsive: en mobile el sidebar es drawer con icono hamburger

**Validación**:
- Playwright: navegar a `/asistente`, crear 3 conversaciones distintas, verificar que aparecen en sidebar agrupadas
- Reload de página mantiene la conversación activa (URL `?c={id}`)
- Click en conversación vieja → mensajes cargan + se puede continuar escribiendo

### Fase 3: Búsqueda full-text con filtros
**Objetivo**: Input de búsqueda en el sidebar que muestra resultados con:
- Query a `/api/chat/conversations/search?q=...&tool=...&from=...&to=...&paciente=...`
- Backend usa `to_tsquery('spanish', q)` + `ts_headline` para snippets con highlight
- Chips de filtros: dropdown "Tool" (las 6 tools), date range, input "Paciente"
- Cada resultado muestra: snippet con `<mark>` highlight, fecha, título de conversación, link al registro (si tiene id)
- Click → abre la conversación + scrollea al mensaje + lo highlightea 2s

**Validación**:
- Buscar "Pérez" devuelve solo mensajes donde aparece, ordenados por `ts_rank`
- Filtro tool=registrar_orden devuelve solo tool calls de esa tool
- Click en resultado salta al mensaje correcto
- Badge "registro eliminado" aparece cuando `orden_id` no existe en `ordenes` (LEFT JOIN devuelve null)
- Performance: query con 1000 mensajes responde <200ms

### Fase 4: Validación Final
**Objetivo**: Sistema funcionando end-to-end con auditoría real
**Validación**:
- [ ] `npm run typecheck` pasa
- [ ] `npm run build` exitoso
- [ ] `npm run lint` sin warnings nuevos
- [ ] Playwright screenshot: `/asistente` con sidebar + chat + search funcionando
- [ ] Flujo completo: registrar 3 órdenes vía chat → cerrar tab → reabrir → buscar "OSEP" → ver los 3 resultados → click → jump al mensaje → click "Ver orden" → carga `/ordenes/{id}`
- [ ] Edge case probado: eliminar manualmente una orden, recargar `/asistente`, verificar badge "registro eliminado"
- [ ] RLS verificada con 2 cuentas de prueba

---

## 🧠 Aprendizajes (Self-Annealing / Neural Network)

### 2026-05-11: `unaccent` en columna `GENERATED ALWAYS AS STORED`
- **Error**: `to_tsvector('spanish', unaccent(...))` no se acepta directamente en columnas generadas porque `unaccent` es `STABLE`, no `IMMUTABLE`.
- **Fix**: wrapper SQL marcado explícitamente `IMMUTABLE`: `f_unaccent(text)` que invoca `extensions.unaccent('extensions.unaccent', $1)`. Patrón estándar de Supabase para este caso.
- **Aplicar en**: cualquier feature que use FTS español con unaccent en columnas generadas o índices funcionales.

### 2026-05-11: Funciones con `SET search_path = ''` necesitan calificar todo
- **Error**: la función `search_chat_messages` falló al aplicar: `function public.websearch_to_tsquery(unknown, text) does not exist`.
- **Fix**: calificar built-ins con `pg_catalog.websearch_to_tsquery`, `pg_catalog.ts_headline`, `pg_catalog.ts_rank`. Para configuraciones de FTS, usar `'spanish'::pg_catalog.regconfig`.
- **Aplicar en**: cualquier función SQL con `SET search_path = ''` (recomendado para SECURITY) — todas las built-ins deben prefijarse con `pg_catalog.`.

### 2026-05-11: Trigger functions y advisor `anon_security_definer_function_executable`
- **Error**: trigger function como `SECURITY DEFINER` se expuso vía RPC.
- **Fix**: cambiar a `SECURITY INVOKER` (el médico tiene RLS UPDATE en su propia conversación) + `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`. Triggers ignoran las ACLs de la función, sigue ejecutando.
- **Aplicar en**: TODOS los trigger functions nuevos en este proyecto.

### 2026-05-11: AI SDK v6 `useChat` requiere `transport` para custom body
- **Error**: `useChat()` por default solo envía `messages` en el body; no hay forma de inyectar `conversationId`.
- **Fix**: usar `DefaultChatTransport` con `prepareSendMessagesRequest` que devuelve `{ body: { ...body, messages, conversationId } }`. Para conversaciones existentes, recortar `messages` al último user message porque el server reconstruye historial desde BD.
- **Aplicar en**: cualquier futura extensión del chat (ej: enviar metadata por turno, archivos por separado, etc.).

### 2026-05-11: `useChat` no escucha cambios reactivos en `messages` prop
- **Error/Patrón**: cambiar de conversación pasando un nuevo `initialMessages` no actualiza el chat.
- **Fix**: `<AssistantPanel key={conversationId ?? 'new'} />` fuerza remount cuando cambia.
- **Aplicar en**: cualquier UI que cargue distintas sesiones del mismo hook.

### 2026-05-11: Persistir el user message ANTES de cargar historial
- **Error**: si persistís user message antes de cargar historial, queda duplicado en el contexto del LLM.
- **Fix**: cargar historial primero (refleja el estado antes de este turno), luego persistir user, luego pasar al LLM `[...historial, ...newTurn]`.
- **Aplicar en**: cualquier pipeline server-side con persistencia + reconstrucción de contexto.

---

## Gotchas

- [ ] **AI SDK v5 `onFinish` shape**: el callback recibe `{ text, toolCalls, toolResults, finishReason, usage, response }`. Los `toolResults` vienen como array; hay que matchear con `toolCalls` por `toolCallId` para reconstruir cada step.
- [ ] **`convertToModelMessages` en route**: al cargar una conversación existente, el frontend manda los `UIMessage[]` históricos + el nuevo. NO duplicar la persistencia — solo persistir el último user message + lo que sale del stream.
- [ ] **`useChat` initial messages**: AI SDK v5 acepta `initialMessages` pero al cambiar de conversación hay que forzar remount (key=conversacionId) porque el hook no escucha cambios reactivos del initial.
- [ ] **FTS español requiere extensión**: verificar que `CREATE EXTENSION IF NOT EXISTS unaccent` esté habilitada si se quiere búsqueda sin acentos. Por ahora con `'spanish'` config es suficiente; si los médicos buscan "perez" sin tilde y los datos tienen "Pérez", agregar unaccent en un v2.
- [ ] **Tool result puede ser `{ success: false }`**: NO guardar `orden_id` si `success !== true`. Validar en el código antes del insert.
- [ ] **Streaming + persistencia race**: persistir el user message ANTES de iniciar el stream (sincrónico), persistir assistant + tools en `onFinish` (asincrónico). Si `onFinish` falla, no romper el response al cliente — loguear y seguir.
- [ ] **`step_index` con multi-step (`stopWhen: stepCountIs(5)`)**: cada step puede tener N tool calls. Usar índice global incrementado por cada row insertada para que el orden de render coincida con lo que vio el médico en vivo.
- [ ] **GIN index size**: con 10k+ mensajes el índice puede crecer. Monitorear con `pg_size_pretty(pg_relation_size('idx_chat_msg_search'))`. Si crece mucho, considerar índice parcial `WHERE content IS NOT NULL OR tool_input IS NOT NULL`.
- [ ] **Sidebar performance**: si un médico acumula 500+ conversaciones, paginar el sidebar (infinite scroll con cursor por `last_message_at`). Por ahora `LIMIT 50` es suficiente.
- [ ] **`ts_headline` con HTML**: devuelve `<b>palabra</b>` por default. Sanitizar o configurar `StartSel`/`StopSel` para `<mark>` y escapar el resto del snippet en el cliente.

## Anti-Patrones

- NO persistir desde el cliente (`AssistantPanel`) — el cliente solo lee del stream. Toda persistencia es server-side en `route.ts`.
- NO duplicar mensajes: si el cliente manda el histórico completo en `messages`, persistir solo el último user + el output nuevo.
- NO usar `any` para el shape de `UIMessage` — importar tipos de `ai` package.
- NO hacer JOINs en RLS policies (uso de subqueries a `chat_conversaciones`): por eso `medico_id` está denormalizado en `chat_mensajes`.
- NO guardar tokens/secrets en `tool_input` o `tool_result` (revisar el dump JSONB de las tools — actualmente no hay riesgo pero ojo si se agregan tools nuevas).
- NO bloquear el stream esperando la persistencia — `onFinish` es fire-and-forget con try/catch + log.
- NO crear una columna `search_vector` actualizada por trigger — usar `GENERATED ALWAYS AS STORED` (Postgres 12+), menos código y siempre coherente.
- NO buscar con `ILIKE '%x%'` cuando hay FTS disponible — es 10-100x más lento y no rankea por relevancia.

---

*PRP pendiente aprobación. No se ha modificado código.*

# PRP-002: Agente Unificado con Function Calling + OCR (Fase 2)

> **Estado**: PENDIENTE
> **Fecha**: 2026-04-20
> **Proyecto**: MediCuenta V2
> **Referencia negocio**: validado con Dr. Miguel Moreno el 2026-04-16
> **Depende de**: PRP-001 Reportes (Fase 1) — completada. Requiere columnas `agente_facturador`, `nivel`, `fecha_alta_paciente`, `aplicado_por` ya creadas.

---

## Objetivo

Convertir el asistente conversacional actual (Q&A puro, streaming con `google/gemini-2.5-flash-lite`) en un **agente unificado con function calling + visión** que permita al médico registrar cirugías, órdenes y débitos por conversación natural, consultar el nomenclador OSEP, escanear fotos de órdenes en papel (OCR con Gemini Vision) y recibir ayuda contextual sobre la plataforma — todo desde un solo endpoint, accesible vía widget flotante (consultas rápidas) o página completa `/asistente` (conversaciones largas).

## Por Qué

| Problema | Solución |
|----------|----------|
| El médico tipea manualmente cada orden/cirugía/débito en formularios de 8-15 campos | El médico dice "registrá consulta de Juan Pérez hoy OSEP, token 123456, firmó" y el agente ejecuta el INSERT |
| Cargar 30+ órdenes de papel a mano después de una jornada consume 1-2 horas | Tomar una foto con el celular pre-carga el formulario en segundos |
| El asistente actual solo responde preguntas teóricas sobre facturación, no hace nada accionable | Convertirlo en agente con tools lo vuelve un co-piloto real que ejecuta acciones |
| Consultar el nomenclador (1148 filas) requiere ir a `/nomenclador` y perder contexto | El agente busca por código o descripción dentro del mismo chat |
| El médico no recuerda dónde está cada sección ni cómo cambiar estado de una orden | Tool `ayuda_plataforma` con base de conocimiento de rutas y flujos |

**Valor de negocio**:
- Reduce tiempo de carga por orden de ~90 seg a ~15 seg (conversación) o ~10 seg (OCR + confirmación).
- Multiplica por 5-10x la productividad de facturación diaria del médico.
- Es el diferenciador core del producto: la razón por la que un médico paga MediCuenta en vez de usar una planilla de Excel. Sin agente inteligente, MediCuenta V2 es solo un CRUD más.
- Habilita captura masiva de órdenes de papel (caso real: algunos médicos acumulan órdenes y facturan al fin de mes desde fotos del celular).

## Qué

### Criterios de Éxito
- [ ] `npm run typecheck` y `npm run build` pasan sin errores.
- [ ] Existe la ruta `/asistente` con chat full-screen funcional, preservando el widget flotante en el resto de la app.
- [ ] El input del chat acepta texto + imágenes (múltiples), con preview antes de enviar.
- [ ] Enviando "registrá una consulta para Juan Pérez hoy OSEP token 123456 firmó, código 420101" el agente llama a `registrar_orden`, inserta en `ordenes` con `medico_id = auth.uid()`, `agente_facturador='circulo_medico'` por defecto, y devuelve card de confirmación con el ID.
- [ ] Enviando "cirugía de 2° Nivel de María López el 10 de abril en Pasteur, OSEP, vesícula, código 450301" llama a `registrar_cirugia` con `nivel=2`, `institucion='Pasteur'` y respeta validación Zod (institución requerida en nivel 2).
- [ ] Enviando "débito de falta de token por 5000 pesos en una orden de ayer" llama a `registrar_debito` con `aplicado_por` inferido.
- [ ] Enviando "cuánto paga OSEP por una consulta?" llama a `consultar_nomenclador` con ILIKE y devuelve tabla de resultados.
- [ ] Subiendo foto de orden papel con texto "cargala", llama a `analizar_imagen_orden`, extrae {paciente, OS, nro afiliado, código práctica, diagnóstico, token OSEP, firma, horario}, devuelve JSON y sugiere "confirmar y registrar".
- [ ] En `/ordenes/nueva` existe botón "Escanear orden" que abre cámara/file picker, analiza con el mismo endpoint (o uno derivado), pre-carga el formulario y resalta en amarillo los campos con confianza < 0.7.
- [ ] Preguntando "dónde veo mis débitos?" llama a `ayuda_plataforma` y explica la ruta `/debitos` en lenguaje argentino informal.
- [ ] Se muestra indicador "Pensando..." visible durante `status === 'submitted'` antes del primer token.
- [ ] Cada tool call renderiza una card visual (éxito/error) con ícono, nombre de acción, detalles clave y link al recurso creado.
- [ ] El modelo configurado es `google/gemini-2.5-flash` (no lite — el lite no soporta tools+vision según OpenRouter docs).
- [ ] Todo INSERT vía tool respeta multi-tenancy: `medico_id` se inyecta server-side desde `supabase.auth.getUser()`, **nunca** se acepta del payload del tool.
- [ ] Playwright smoke test: navegar a `/asistente`, enviar mensaje de texto simple, verificar respuesta streameada.
- [ ] El system prompt refleja el modelo de negocio real: 3 agentes facturadores, 2 niveles, plus privado confidencial, OSEP token+firma, lenguaje argentino informal.

### Comportamiento Esperado

**Happy path 1 — Registro conversacional**:
1. Médico abre widget flotante al final del día.
2. Escribe "registrá 3 consultas OSEP: Juan Pérez token 123456 firmó código 420101, María García token 234567 firmó código 420101, Pedro Sánchez token 345678 firmó código 420101".
3. Agente ejecuta 3 veces `registrar_orden` en paralelo (o secuencial si el SDK no soporta parallel tools). Cada llamada resuelve con un ID.
4. UI muestra 3 cards de éxito: "Orden #abc creada — Juan Pérez — OSEP — 420101".
5. Agente responde en texto: "Listo, registré las 3 consultas. ¿Querés verlas en `/ordenes`?".

**Happy path 2 — OCR desde chat**:
1. Médico abre el widget, toca ícono de clip, sube foto de orden OSEP en papel.
2. Escribe "cargala" y envía.
3. Agente llama a `analizar_imagen_orden` con la imagen, Gemini Vision devuelve JSON estructurado.
4. Agente responde: "Extraje de la foto: paciente María López, OSEP, afiliado 123/01, código 420101 (consulta), token 654321, firmó. ¿Registro?".
5. Médico responde "sí" → agente llama a `registrar_orden` con los datos extraídos.
6. Card de confirmación aparece.

**Happy path 3 — OCR desde `/ordenes/nueva`**:
1. Médico va a `/ordenes/nueva`, toca botón "Escanear orden".
2. Selecciona foto desde cámara o archivos.
3. Endpoint dedicado (POST a `/api/chat/ocr` o invocación directa del tool `analizar_imagen_orden`) devuelve JSON.
4. Formulario se pre-carga con los campos extraídos.
5. Campos con confianza < 0.7 muestran borde amarillo y tooltip "Verificá este campo".
6. Médico corrige lo que haga falta y envía el form normalmente (createOrden existente).

**Happy path 4 — Consulta + acción combinada**:
1. Médico: "cuánto paga OSEP por ecografía abdominal?".
2. Agente llama a `consultar_nomenclador({ query: 'ecografia abdominal', obra_social: 'OSEP' })`.
3. Devuelve tabla con 3 matches. Agente resume: "Ecografía abdominal OSEP: código 340102, honorarios $X, gastos $Y, total $Z".
4. Médico: "registrala para Ana Torres, afiliado 99/03, token 555666, firmó".
5. Agente llama a `registrar_orden` con los datos de la práctica ya conocida.

---

## Contexto

### Referencias

**Código existente a reusar (NO duplicar)**:
- `src/actions/ordenes.ts` → `createOrden(formData)` — ya valida Zod, ya inyecta `medico_id`, ya aplica reglas OSEP. Las tools deben invocar esta función, no re-implementar INSERT.
- `src/actions/cirugias.ts` → `createCirugia(formData)` — ya calcula `total_calculado` con la regla OSEP de múltiples prácticas.
- `src/actions/debitos.ts` → `createDebito(formData)` — ya auto-marca refacturable para motivos conocidos.
- `src/features/nomenclador/hooks/useNomencladorSearch.ts` — patrón de query ILIKE en `prestaciones`. La tool `consultar_nomenclador` debe replicar esta lógica pero server-side con `@/lib/supabase/server`.
- `src/features/ordenes/types/ordenes.ts` → `ordenSchema`, `OrdenFormData`, `AGENTES_FACTURADORES`, `OBRAS_SOCIALES`. Las tools usan estos schemas.
- `src/features/cirugias/types/cirugias.ts` → `cirugiaSchema`, `CirugiaFormData`, `NIVELES_CIRUGIA`.
- `src/features/debitos/types/debitos.ts` → `debitoSchema`, `DebitoFormData`, `MOTIVOS_DEBITO`.
- `src/app/api/chat/route.ts` — el endpoint actual. Se extiende con tools. **No se crea uno nuevo**.
- `src/features/assistant/components/AssistantWidget.tsx` — widget flotante con `useChat`. Hay que evolucionarlo, no reemplazarlo.
- `src/features/assistant/components/AssistantInput.tsx` — input texto puro. Agregar attachments.
- `src/features/assistant/components/AssistantMessages.tsx` — render de `UIMessage[]`. Agregar render de tool parts.

**Catálogo de rutas (para `ayuda_plataforma`)**:
- `/dashboard` — métricas globales.
- `/ordenes` — listado + filtros. `/ordenes/nueva` — crear. `/ordenes/[id]` — detalle/edición.
- `/cirugias` — listado. `/cirugias/nuevo` — crear.
- `/debitos` — listado. `/debitos/[id]` — detalle.
- `/liquidaciones` — agrupar órdenes para presentar.
- `/reportes` — análisis de tendencias (Fase 1).
- `/nomenclador` — búsqueda OSEP.
- `/perfil` — config del médico.

**Vercel AI SDK v6 — tool calling + vision**:
- https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling
- https://sdk.vercel.ai/docs/guides/multi-modal-chatbot
- `streamText({ model, system, messages, tools: { ... } })` con `tool({ description, inputSchema: z.object(...), execute: async (args) => {...} })`.
- `toUIMessageStreamResponse()` ya stream-ea las tool parts al cliente.
- Para vision: `messages: [{ role: 'user', content: [{ type: 'text', text }, { type: 'image', image: base64OrUrl }] }]` — el `convertToModelMessages` ya lo soporta si los `UIMessage.parts` traen `{ type: 'image', ... }`.

**OpenRouter model**:
- Cambio en `src/lib/ai/openrouter.ts`: `free: 'google/gemini-2.5-flash'` (no `-lite`). El `-lite` **no soporta function calling + vision combinados**.
- Costo estimado por interacción: $0.001–0.005 texto, ~$0.01 con imagen. (Confirmar con owner al proveer API key.)

### Arquitectura Propuesta (Feature-First)

```
src/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts              # Extender con tools (NO crear endpoint nuevo)
│   └── (main)/
│       └── asistente/
│           └── page.tsx              # Nueva: chat full-screen
│
├── features/
│   └── assistant/
│       ├── components/
│       │   ├── AssistantWidget.tsx   # Evolucionar: soporta tool cards + attachments
│       │   ├── AssistantPage.tsx     # NEW: layout full-screen reutilizable
│       │   ├── AssistantInput.tsx    # Evolucionar: file picker + image preview
│       │   ├── AssistantMessages.tsx # Evolucionar: render de tool-call / tool-result parts
│       │   ├── ToolCallCard.tsx      # NEW: card visual por tool (éxito/error)
│       │   ├── ThinkingIndicator.tsx # NEW: "Pensando..." antes del primer token
│       │   └── ImagePreview.tsx      # NEW: preview de attachments antes de enviar
│       ├── tools/                    # NEW: definiciones de tools (server-only)
│       │   ├── index.ts              # export tools {} para streamText
│       │   ├── registrar-orden.ts
│       │   ├── registrar-cirugia.ts
│       │   ├── registrar-debito.ts
│       │   ├── consultar-nomenclador.ts
│       │   ├── analizar-imagen-orden.ts
│       │   └── ayuda-plataforma.ts
│       ├── lib/
│       │   ├── system-prompt.ts      # NEW: system prompt largo con modelo de negocio
│       │   └── knowledge-base.ts     # NEW: rutas + flujos para ayuda_plataforma
│       └── types/
│           └── assistant.ts          # SUGGESTED_QUESTIONS actualizados
│
├── features/ordenes/
│   └── components/
│       └── EscanearOrdenButton.tsx   # NEW: en /ordenes/nueva
│
└── lib/
    └── ai/
        └── openrouter.ts             # Editar: cambiar modelo a gemini-2.5-flash
```

### Modelo de Datos

**Sin cambios de schema**. Todas las tablas relevantes (`ordenes`, `cirugias`, `debitos`, `prestaciones`) ya están configuradas tras PRP-001 (Fase 1.5):
- `ordenes.agente_facturador` ✅
- `cirugias.nivel`, `cirugias.agente_facturador`, `cirugias.institucion`, `cirugias.fecha_alta_paciente` ✅
- `debitos.aplicado_por` ✅
- RLS con `medico_id = auth.uid()` ✅ en todas.

### Definición de las 6 tools (alto nivel, schemas detallados se escriben en su fase)

| Tool | Input Schema (resumen) | Execute hace | Devuelve al modelo |
|------|------------------------|--------------|--------------------|
| `registrar_orden` | Subset de `ordenSchema` sin `medico_id` | Invoca `createOrden(formData)` server-side | `{ success, orden_id, error? }` |
| `registrar_cirugia` | Subset de `cirugiaSchema` sin `medico_id` | Invoca `createCirugia(formData)` | `{ success, cirugia_id, total_calculado, error? }` |
| `registrar_debito` | Subset de `debitoSchema` + `aplicado_por` | Invoca `createDebito(formData)` | `{ success, debito_id, error? }` |
| `consultar_nomenclador` | `{ query: string, obra_social?: string, limit?: number }` | `supabase.from('prestaciones').select(...).ilike(...)` | `{ results: Prestacion[] }` |
| `analizar_imagen_orden` | `{ image_url_or_base64: string }` | Invoca sub-call al mismo Gemini con prompt de extracción estructurada (Zod schema de salida) | `{ paciente, obra_social, nro_afiliado, codigo_practica, diagnostico, token_osep, firma, horario, confianzas: Record<field, 0-1> }` |
| `ayuda_plataforma` | `{ tema: string }` | Consulta knowledge-base estático | `{ respuesta: string, ruta?: string }` |

**CRÍTICO de seguridad**: ninguna tool acepta `medico_id` del modelo. `execute` lee la sesión con `createClient()` + `auth.getUser()` server-side.

**CRÍTICO de validación**: cada `execute` corre `XxxSchema.safeParse(formData)` antes de delegar a la server action, porque el modelo puede alucinar campos fuera del schema.

---

## Blueprint (Assembly Line)

> IMPORTANTE: Solo FASES. Las subtareas se generan en cada fase con el bucle agéntico tras mapear contexto real.

### Fase 0: Pre-flight y modelo
**Objetivo**: Confirmar con owner que `OPENROUTER_API_KEY` está configurada en `.env.local` y cambiar el modelo a `google/gemini-2.5-flash`. Dejar ping de salud verificando que tools + vision funcionan contra OpenRouter.
**Validación**:
- [ ] `.env.local` tiene `OPENROUTER_API_KEY` válida (verificable con curl o test script descartable).
- [ ] `MODELS.free === 'google/gemini-2.5-flash'` en `src/lib/ai/openrouter.ts`.
- [ ] `npm run dev` arranca sin errores; el chat actual sigue respondiendo preguntas simples.

### Fase 1: System prompt + knowledge base
**Objetivo**: Escribir el system prompt definitivo que refleje el modelo de negocio real (3 agentes, 2 niveles, plus confidencial, OSEP token+firma, lenguaje argentino informal, reglas de seguridad sobre no dar consejos clínicos ni exponer plus en egresos). Construir `knowledge-base.ts` con el catálogo de rutas y flujos para que `ayuda_plataforma` tenga contenido. Actualizar `SUGGESTED_QUESTIONS` con ejemplos que muestren tools (ej: "Registrame una consulta de Juan Pérez OSEP").
**Validación**:
- [ ] Revisar system prompt manualmente: cubre agentes, niveles, plus, token/firma, lenguaje, límites.
- [ ] `knowledge-base.ts` tiene entradas para todas las rutas de `/app/(main)/*`.
- [ ] `npm run typecheck` pasa.

### Fase 2: Definir las 6 tools server-side
**Objetivo**: Crear `src/features/assistant/tools/*` con las definiciones `tool({ description, inputSchema, execute })` de Vercel AI SDK. Cada `execute` invoca la server action correspondiente (o la query directa en `consultar_nomenclador` / `ayuda_plataforma`). Inyectar `medico_id` desde sesión en cada tool. Manejar errores devolviendo `{ success: false, error }` sin throw.
**Validación**:
- [ ] Las 6 tools existen y exportan un objeto `tools` consumible por `streamText`.
- [ ] Cada tool usa el Zod schema correspondiente (o un subset derivado) como `inputSchema`.
- [ ] Ninguna tool acepta `medico_id` en input.
- [ ] Test manual (script temporal o route handler): llamar a cada `execute` con input válido e inválido, confirmar que el wrapper de errores funciona.

### Fase 3: Endpoint `/api/chat/route.ts` con tools + multimodal
**Objetivo**: Extender el handler actual para pasar `tools` al `streamText`, agregar soporte multimodal en `convertToModelMessages` (imágenes vienen en `UIMessage.parts`), aumentar `maxSteps` para multi-turn tool calling. Mantener retrocompatibilidad con preguntas de solo texto.
**Validación**:
- [ ] POST a `/api/chat` con mensaje de texto simple → responde como antes.
- [ ] POST con mensaje + image part → no crashea, procesa.
- [ ] POST con "registrá consulta de X" → stream contiene tool-call part + tool-result part.

### Fase 4: UI — Widget + tool cards + thinking indicator
**Objetivo**: Evolucionar `AssistantMessages.tsx` para renderizar los tool parts (`tool-call`, `tool-result`) como cards visuales con íconos (✅/❌), nombre de acción legible, detalles clave (ej: nombre paciente, OS, monto), y link al recurso creado (`/ordenes/[id]`). Agregar `ThinkingIndicator` distinto del "escribiendo…" actual (un spinner + texto "Pensando…" durante `status==='submitted'`). Crear `ToolCallCard.tsx` reutilizable.
**Validación**:
- [ ] Enviar mensaje que dispare `registrar_orden` → aparece card verde "✅ Orden creada" con link clickeable.
- [ ] Enviar mensaje que falle validación → card roja "❌ Error: [motivo]".
- [ ] "Pensando…" aparece antes del primer token y desaparece al empezar a streamear.

### Fase 5: UI — Attachments (imágenes) en el input
**Objetivo**: Agregar a `AssistantInput.tsx` un botón clip / ícono de cámara que abra file picker (`accept="image/*"` + `capture="environment"` para móvil). Mostrar preview de las imágenes seleccionadas antes de enviar (`ImagePreview.tsx`). Convertir a base64 y enviar en `sendMessage({ text, files })` según la API del `useChat` v6, o armar parts manualmente.
**Validación**:
- [ ] Seleccionar imagen desde desktop → aparece preview con opción de remover.
- [ ] Seleccionar imagen desde móvil con cámara → preview.
- [ ] Enviar "cargala" + imagen → llega al endpoint con part `{type:'image', ...}`.

### Fase 6: Página `/asistente` full-screen
**Objetivo**: Crear `src/app/(main)/asistente/page.tsx` con layout que use el mismo `useChat` pero en contenedor full-height. Navegación en sidebar o header para llegar ahí. Reutilizar `AssistantMessages`, `AssistantInput`, `ToolCallCard`. El widget flotante se oculta cuando estás en `/asistente` (para no duplicar).
**Validación**:
- [ ] Ir a `/asistente` → ver chat full-screen.
- [ ] El widget flotante **no aparece** en `/asistente`.
- [ ] El widget flotante **sí aparece** en el resto de las rutas.
- [ ] `SUGGESTED_QUESTIONS` se renderizan igual con estado vacío.

### Fase 7: Botón "Escanear orden" en `/ordenes/nueva`
**Objetivo**: Agregar `EscanearOrdenButton.tsx` en la parte superior del formulario `NuevaOrdenForm.tsx`. Al tocarlo abre file picker. Llama a un endpoint dedicado (p. ej. `/api/chat/ocr`) que invoca internamente la lógica de `analizar_imagen_orden` y devuelve JSON. Pre-carga campos del form con los datos extraídos usando los setters existentes. Resalta en amarillo (border + icon tooltip) los campos con `confianza < 0.7`.
**Validación**:
- [ ] Subir foto de orden OSEP en papel → formulario se auto-llena.
- [ ] Campos ambiguos (firma dudosa, token borroso) aparecen en amarillo.
- [ ] El usuario puede editar cualquier campo antes de enviar.
- [ ] Enviando el form pre-cargado → `createOrden` funciona igual que siempre.

### Fase 8: Validación final (end-to-end)
**Objetivo**: Smoke test completo del sistema.
**Validación**:
- [ ] `npm run typecheck` pasa sin errores.
- [ ] `npm run build` exitoso.
- [ ] Playwright CLI: navegar a `/asistente`, enviar "hola", verificar respuesta.
- [ ] Manual: "registrá consulta Juan Pérez OSEP token 123456 firmó código 420101" → crea orden → visible en `/ordenes`.
- [ ] Manual: subir foto de orden real → OCR devuelve datos razonables.
- [ ] Manual: `/ordenes/nueva` → "Escanear orden" → form pre-cargado.
- [ ] Manual: preguntar "dónde veo los débitos?" → respuesta con ruta `/debitos`.
- [ ] Manual: preguntar "cuánto paga OSEP por consulta?" → consulta nomenclador y responde.
- [ ] Criterios de Éxito (arriba) todos tildados.

---

## Aprendizajes (Self-Annealing)

> Esta sección CRECE con cada error encontrado durante la implementación. El conocimiento persiste para futuros PRPs. El mismo error NUNCA ocurre dos veces.

*(Vacía al momento de creación del PRP. Se documenta en cada fase.)*

---

## Gotchas

- [ ] **Modelo crítico**: `google/gemini-2.5-flash-lite` NO soporta tools + vision. Confirmar cambio a `google/gemini-2.5-flash` antes de implementar tools. Probar con 1 request antes de avanzar.
- [ ] **OPENROUTER_API_KEY**: owner debe proveerla. Sin ella, toda la Fase 2 no arranca. Verificar en Fase 0.
- [ ] **Multi-tenancy server-side**: `medico_id` SIEMPRE se obtiene de `supabase.auth.getUser()` dentro del `execute` de cada tool. Aunque el modelo intente pasarlo como arg, ignorarlo. RLS es el último cinturón de seguridad, no el único.
- [ ] **Plus privado confidencial**: El system prompt debe explicitar "NUNCA menciones el plus en emails, PDFs, egresos de la plataforma o en nada que salga a terceros. Solo es visible en la app para el médico dueño". El agente puede consultarlo/editarlo pero no exponerlo.
- [ ] **Reuso de server actions**: `createOrden`, `createCirugia`, `createDebito` hacen `redirect()` al final. Cuando las invocamos desde una tool, el redirect no aplica (no estamos en contexto de request-response de form). Revisar: o se extraen las partes de INSERT sin redirect, o se capturan y se ignoran. Probablemente mejor crear helpers `insertOrdenData`, `insertCirugiaData`, `insertDebitoData` sin redirect, y que los server actions existentes los usen.
- [ ] **Vercel AI SDK v6 cambios**: `inputSchema` es el nombre nuevo (antes `parameters`). `toUIMessageStreamResponse` ya maneja tool parts. `maxSteps` (o `stopWhen`) es requerido para que el modelo pueda hacer multi-turn tool calling; sin eso, después de una tool call el stream termina sin respuesta final.
- [ ] **Redirect en server actions rompe en tools**: si `createOrden` llama a `redirect()`, lanza una excepción tipo `NEXT_REDIRECT` que hay que capturar en el `execute` del tool. Preferir refactor a helper sin redirect.
- [ ] **Zod schemas con `discriminatedUnion`**: `ordenSchema` es discriminated union (`tipo: 'obra_social' | 'particular'`). Cuando se usa como `inputSchema` del tool, el modelo debe saber los 2 shapes. Considerar describirlo con ejemplos en el `description` del tool.
- [ ] **OCR confianzas**: Gemini Vision no devuelve confianzas nativas. Hay que pedírselas explícitamente en el prompt de extracción ("para cada campo devolvé un número 0-1 de qué tan seguro estás") y validarlas con Zod.
- [ ] **Tamaño de imagen**: fotos de celular son 3-8 MB. Considerar compresión client-side antes de enviar (canvas.toDataURL con quality 0.7). Si no, el base64 infla a 5-12 MB y rompe el payload.
- [ ] **Costos**: cada OCR ~$0.01, cada interacción texto ~$0.001-0.005. Owner debe monitorear. No hay rate-limit client-side en esta fase (se verá en Fase 5 del roadmap cuando se suban pagos).
- [ ] **Widget vs `/asistente`**: usar un solo `useChat` por instancia no comparte historial entre ambos (son 2 hooks independientes). Si el usuario pide persistencia de conversación entre widget y página completa, necesitamos Zustand o sesiones server-side. Por ahora se definen independientes y se menciona en aprendizajes.
- [ ] **Renderizar tool parts**: los `UIMessage.parts` en v6 incluyen `{type: 'tool-<nombre>', state, input, output}`. El switch en `AssistantMessages` debe cubrir `'text'`, `'reasoning'`, y todos los `'tool-*'`. Default a nada para partes desconocidas (forward-compatible).
- [ ] **Vision input en el SDK**: `UIMessage.parts` soporta `{type: 'file', mediaType, url}`. Revisar la doc exacta de v6 porque la API evolucionó entre v4→v5→v6.

## Anti-Patrones

- NO crear un endpoint distinto para cada tool (el SDK resuelve todo en `/api/chat`).
- NO re-implementar INSERT en tools — reusar server actions / helpers.
- NO aceptar `medico_id` en el input de ninguna tool bajo ningún concepto.
- NO confiar en el modelo para validar — siempre Zod antes de tocar DB.
- NO hacer OCR con otro proveedor (OpenAI, Claude) — consistencia con Gemini, menos deps, menos costo.
- NO duplicar `AssistantWidget` para `/asistente`: extraer componentes compartidos.
- NO exponer `OPENROUTER_API_KEY` al cliente — solo server actions / route handlers.
- NO saltearse el `ThinkingIndicator`: sin feedback visual el usuario piensa que se colgó.
- NO poner lógica de negocio en los componentes UI de tool cards — solo rendering.
- NO usar `any`. Si el tipo es desconocido, `unknown` + type guard.
- NO hardcodear strings de rutas en `ayuda_plataforma` — centralizar en `knowledge-base.ts`.

---

*PRP pendiente aprobación. No se ha modificado código.*

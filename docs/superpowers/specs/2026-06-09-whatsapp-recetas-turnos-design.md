# Diseño: Agente de WhatsApp dentro de MediCuenta V2 (cobro de recetas + turnos)

- **Fecha:** 2026-06-09
- **Rama:** `feat/whatsapp-recetas-turnos` (basada en `dev/gaby`)
- **Autor del diseño:** Héctor (médico/dueño) + Claude (arquitectura)
- **Estado:** Borrador para aprobación
- **Repos:** ORIGEN (motor a copiar, NO se toca) `~/proyectos/Agente_Whatsapp` · DESTINO (hogar) `~/proyectos/Medicuenta-V2.0`

---

## 1. Objetivo en una frase

Convertir a MediCuenta en **un solo producto para médicos de Catamarca** que, además de facturar a OSEP, **cobra recetas por WhatsApp** y **agenda turnos**: el médico genera la receta electrónica en la app de OSEP (PDF), la reenvía al bot por WhatsApp, y cuando el paciente escribe, el bot le manda un link de pago de MercadoPago; al pagar, el bot le entrega el PDF. La plata va **directo a la cuenta de cada médico**.

Esto se logra **copiando el motor de WhatsApp** desde `Agente_Whatsapp` hacia MediCuenta, **re-keyeado** de `organization_id` → `medico_id`, siguiendo el patrón de RLS que MediCuenta ya usa. `Agente_Whatsapp` no se migra ni se modifica: sigue siendo el SaaS multi-tenant general para otros rubros.

---

## 2. Hallazgos contra el código real (qué confirmamos y qué hay que ajustar del brief)

Antes de diseñar, dos agentes leyeron los dos repos completos (runner, agente, tools, OCR, las 11 migraciones del motor y las 6 de MediCuenta, clientes de Supabase, etc.). Resultado: **el diseño cerrado es sólido, pero el brief tenía dos datos técnicos internos que el código contradice, y el motor resultó menos "listo para portar" de lo que parecía.** Esto NO cambia las decisiones de producto; sí ajusta el alcance real de la Fase 0.

### 2.1. Correcciones de stack (datos del brief que el código desmiente)

| En el brief | Realidad del código | Qué hacemos |
|---|---|---|
| "Stack origen: Vercel AI SDK" | El motor **no usa** Vercel AI SDK. Hace `fetch` crudo a una API OpenAI-compat con tools en JSON Schema y un loop `for(step<5)` manual (`Agente_Whatsapp/src/features/ai-agent/agent.ts`, importa de `lib/openrouter.ts`). | **No se porta** el loop. Se **reescribe** el agente sobre el AI SDK v6 que MediCuenta ya usa (`ai ^6.0.158` + `tool()` + Zod + `stopWhen`). |
| "Stack destino: Gemini Vision (OCR)" | El OCR/visión real de MediCuenta es **Claude Haiku 4.5 vía OpenRouter** (`src/lib/ai/openrouter.ts:10-12`). Gemini solo figura como alternativa A/B (`ASSISTANT_MODEL=gemini`). | El OCR de recetas usa **Claude Haiku 4.5** (lo que ya funciona, con un schema optimizado para Claude). Gemini queda opcional. |

> El `CLAUDE.md` del proyecto también está algo desactualizado (dice "Vercel AI SDK v5" y "pagos con Polar"). El código real usa `ai ^6` + OpenRouter, y para Argentina + plata directa al médico usamos **MercadoPago**, no Polar. La skill `add-payments` (Polar) **no aplica** acá.

### 2.2. El motor es un MVP de **demo de un solo número**, no un multi-tenant

La pieza que el brief asumía resuelta — "cada médico conecta su número" — **no existe** en el motor. El runner real:

- Responde con **un único número global** tomado de variables de entorno (`WHATSAPP_TEST_PHONE_NUMBER_ID` / `WHATSAPP_TEST_ACCESS_TOKEN`) y **descarta** cualquier mensaje que no venga a ese número (`runner.ts:39`).
- Resuelve "qué organización responde" leyendo `whatsapp_channels.active_organization_id`, que es un **interruptor manual** que el super-admin cambia a mano desde `/demo` (`switch-actions.ts`). No hay mapeo `phone_number_id → tenant`.
- La tabla `whatsapp_config` (un número + token cifrado por organización) **existe en el schema pero está muerta**: ningún código la lee. El script de cifrado que menciona (`gen-encryption-key.mjs`) **no existe**.

**Consecuencia:** la "conexión del número por médico" de la Fase 0 es **construcción nueva**, no un port. Hay que crear: el mapeo `phone_number_id → medico_id`, el almacenamiento del token de Meta **cifrado por médico**, la capa de cifrado, y la bifurcación remitente médico-vs-paciente (tampoco existe ninguna noción de "número dueño").

### 2.3. Faltantes del motor que el subsistema prioritario (recetas) necesita

- **Recibir PDFs:** el PDF entrante no se captura en **dos** lugares: el parser `parseIncomingMessage` (`lib/whatsapp.ts`) colapsa `document` a `'other'` y no extrae su `mediaId`, **y** el runner solo procesa `text`/`image` (`runner.ts:33`). Hay que tocar parser **y** runner.
- **Enviar PDFs:** el cliente Meta solo tiene `sendWhatsAppText` y `sendWhatsAppImage` (por URL pública). **No** hay `sendDocument`, **no** hay subida de media, **no** hay envío de plantilla (HSM).
- **OCR de PDF:** el OCR de MediCuenta es 100% imagen; no acepta PDFs todavía. Y su schema modela una **orden de práctica de OSEP**, no una **receta de medicamentos** → hace falta un schema/prompt nuevo.
- **MercadoPago:** no existe nada (ni SDK, ni OAuth, ni tablas, ni `external_reference`). 100% nuevo.

### 2.4. Riesgos de seguridad heredados (a corregir al portar, no a portar tal cual)

- El webhook **no verifica la firma** de Meta (`X-Hub-Signature-256`) y consume el body con `req.json()` (no guarda el body crudo). En la demo es tolerable; acá el webhook **dispara cobros y entrega de PDFs con service-role** → un POST falso podría generar pagos/PDF a números arbitrarios. **Severidad alta.**
- **Sin idempotencia:** Meta reintenta los webhooks y el motor no registra el `wamid`. Para texto es tolerable; para cobros puede **duplicar pagos/PDF**.
- Estos mismos cuidados (validar origen + idempotencia) aplican al webhook de MercadoPago.

### 2.5. Colisiones y deudas a tener en cuenta

- **Colisión de nombres:** MediCuenta **ya tiene** `chat_conversaciones` y `chat_mensajes` (el historial del asistente de texto interno del médico). Las conversaciones de WhatsApp con pacientes son otra entidad → las tablas nuevas se nombran con prefijo **`wa_`** para no chocar.
- **Cimientos no versionados (a resolver antes de portar):** las tablas base de MediCuenta (`ordenes`, `perfiles`, `prestaciones`, `liquidaciones`, `chat_*`, bucket `comprobantes`) **no están en `supabase/migrations/`** (se crearon vía MCP/dashboard; solo hay 6 migraciones). Antes de portar hay que **dumpear el schema real** (vía Supabase MCP, project ref `eylcrxhpccwobipcjzal`) para tener el molde exacto y las policies reales — sobre todo de `perfiles` y `prestaciones`.

---

## 3. Arquitectura general

```
                          ┌─────────────────────────────────────────────┐
   Paciente (WhatsApp) ──▶ │  Meta Cloud API  ──▶  POST /api/whatsapp     │
   Médico   (WhatsApp) ──▶ │  (verifica firma, dedupe por wamid)          │
                          └───────────────────────┬─────────────────────┘
                                                  │ service-role (sin sesión)
                                                  ▼
                                       ┌──────────────────────┐
                                       │  Runner (re-keyeado)  │
                                       │  phone_number_id ──▶  │
                                       │  medico_id (wa_canales)│
                                       │  remitente médico vs  │
                                       │  paciente             │
                                       └───────┬──────────┬────┘
                              rama MÉDICO       │          │   rama PACIENTE
                       (carga receta)           ▼          ▼   (cobro)
                 ┌───────────────────────┐  ┌──────────────────────────────┐
                 │ OCR receta (Claude     │  │ Agente IA (ai ^6, Haiku 4.5) │
                 │ Haiku 4.5, soporta PDF)│  │ tools: cobrar_receta,        │
                 │ → crea fila `recetas`  │  │ consultar_disponibilidad,... │
                 └───────────┬───────────┘  └──────────────┬───────────────┘
                             ▼                             ▼
                  Storage bucket `recetas`        crea preferencia MercadoPago
                  (<medico_id>/<uuid>.pdf)        con token del médico (cifrado)
                                                          │  external_reference = receta:<id>
                                                          ▼
                                            Paciente paga ──▶ webhook MP
                                                          │  resuelve receta+médico
                                                          ▼
                                            Bot entrega PDF por WhatsApp (document)
```

**Principios de diseño:**

1. **El sistema (webhook/runner/crons) trabaja con `service-role`** porque no hay sesión de usuario (`auth.uid()` es null). Eso **bypassa el RLS**, así que cada query **filtra `medico_id` manualmente**, resuelto desde el número de WhatsApp (intake) o desde `external_reference` (pago). El RLS sigue protegiendo el acceso desde el dashboard (sesión del médico).
2. **Tablas nuevas, no reutilizar las del chat interno.** Prefijo `wa_` para el dominio WhatsApp; `recetas` y `mp_conexiones` como entidades de cobro.
3. **Re-key mecánico donde se puede, reescritura donde no.** El cliente Meta y el motor de slots son casi 1:1; el runner y el agente se reescriben.
4. **Una sola capa de cifrado** para los dos tokens sensibles (Meta y MercadoPago).
5. **Aditivo:** carpetas y migraciones nuevas, solapamiento bajo con `dev/gaby`. Rebasar sobre `dev/gaby` cada tanto.

---

## 4. Modelo de datos (tablas nuevas)

Todas siguen el molde canónico de MediCuenta (ver §9): `medico_id UUID NOT NULL REFERENCES auth.users(id)`, RLS de 4 policies `auth.uid() = medico_id`, índice por `medico_id`, `created_at/updated_at`. Se sigue el molde de `cirugias` (20260301, el más reciente y correcto); `debitos` (20260223) es **legacy** y diverge (sin `updated_at`, policies con nombre descriptivo) — no copiarlo.

### Fase 0 — cimientos

| Tabla | Propósito | Columnas clave |
|---|---|---|
| `wa_canales` | Conexión del número de WhatsApp de cada médico (reemplaza la muerta `whatsapp_config`). | `medico_id`, `phone_number_id` (UNIQUE, para el lookup del webhook), `display_phone_number`, `access_token_cifrado`, `numero_personal` (el número del médico dueño, para distinguir remitente médico vs paciente), `estado` (`conectado`/`pendiente`) — el verify token del webhook es **global** en el MVP (§10), no por médico |
| `wa_contactos` | Pacientes que escriben al bot (CRM). | `medico_id`, `telefono`, `nombre`, `UNIQUE(medico_id, telefono)` |
| `wa_conversaciones` | Hilo de WhatsApp por paciente. | `medico_id`, `contacto_id` (FK), `bot_pausado` (toma humana), `estado`, `necesita_humano` (si se implementa) |
| `wa_mensajes` | Mensajes del hilo. | `medico_id`, `conversacion_id` (FK), `direccion` (`entrante`/`saliente`), `origen` (`ia`/`humano`/`paciente`/`medico`), `contenido`, `wamid` (UNIQUE, para idempotencia) |
| `wa_config_agente` | Configuración del agente por médico (system prompt/tono/saludo/FAQs + precio de receta). | `medico_id` (UNIQUE), `system_prompt`, `tono`, `saludo`, `faqs`, `precio_receta_default` (el precio fijo configurable que se aplica a cada receta — D6) |
| `wa_eventos_webhook` | Dedupe/idempotencia de webhooks Meta. | `wamid` (UNIQUE), `medico_id`, `procesado_at` |

> `origen` incluye `medico` (nuevo respecto al motor) para registrar los mensajes del médico cargando recetas, sin mezclarlos con los del paciente.

### Fase 1 — cobro de recetas

| Tabla | Propósito | Columnas clave |
|---|---|---|
| `mp_conexiones` | OAuth de MercadoPago por médico (token cifrado). | `medico_id` (UNIQUE), `mp_user_id`, `access_token_cifrado`, `refresh_token_cifrado`, `expires_at`, `estado` |
| `recetas` | Receta + estado de cobro. | `medico_id`, `paciente_nombre` + `paciente_dni` (leídos del OCR — clave para identificar al paciente), `contacto_id` (FK, nullable; se asocia cuando el paciente escribe), `paciente_telefono` (nullable; se captura al escribir el paciente), `pdf_path` (Storage), `external_reference` (UNIQUE, `receta:<uuid>`), `monto` (del precio configurado), `estado` (`pendiente_pago`/`pagada`/`entregada`/`vencida`; `pendiente_datos` solo si el OCR quedó dudoso), `mp_preference_id`, `mp_payment_id`, `datos_ocr` (JSONB con lo extraído) |

> Bucket de Storage nuevo y **privado** `recetas`, path `<medico_id>/<uuid>.pdf`, policies `(storage.foldername(name))[1] = auth.uid()::text` (mismo patrón que `comprobantes`). Separado de `comprobantes` para no mezclar facturación-a-OS con cobro-de-receta.

### Fase 2 — turnos (re-key de las tablas del motor)

`wa_turnos` (appointments), `wa_horarios` (business_hours), `wa_excepciones` (schedule_exceptions), `wa_servicios` (catalog). Re-key `organization_id` → `medico_id`. La lógica de slots (`slots.ts`) es pura y se porta 1:1. Recomendado: constraint anti-overbooking `EXCLUDE USING gist (medico_id WITH =, tstzrange(inicio,fin) WITH &&) WHERE estado != 'cancelado'` (requiere `btree_gist`).

### Lo que se descarta del motor

`organizations`, `profiles`, `current_org_id()`, `whatsapp_channels` (el toggle de demo), `super_admin` (0007). El super-admin se porta más adelante (Fase 3), no bloquea el MVP.

---

## 5. Fase 0 — Cimientos

**Meta:** que un mensaje de WhatsApp entrante llegue al runner, se resuelva el médico dueño del número, se distinga si el remitente es el médico o un paciente, y el agente IA responda con texto — todo re-keyeado a `medico_id` y seguro. Sin cobro todavía.

**Se porta (re-key):** cliente Meta (`lib/whatsapp.ts`), estructura del webhook (GET verify + POST 200), patrón `ensureContact/ensureConversation/addMsg/loadHistory` del runner, `bot_pausado` (toma humana, que sí funciona).

**Se construye nuevo:**
1. **Tablas** `wa_canales`, `wa_contactos`, `wa_conversaciones`, `wa_mensajes`, `wa_config_agente`, `wa_eventos_webhook` (con migraciones versionadas).
2. **Capa de cifrado** app-level **AES-256-GCM** con `ENCRYPTION_KEY` (env de Vercel). Helper `cifrar()/descifrar()` reutilizable para token Meta y MP. **Nonce aleatorio de 12 bytes por operación**, guardado junto al ciphertext (nunca reusar nonce con GCM); rotar `ENCRYPTION_KEY` implica re-cifrar las filas existentes.
3. **Webhook seguro** `POST /api/whatsapp`: leer **raw body** → verificar `X-Hub-Signature-256` con el app secret de Meta → dedupe por `wamid` (`wa_eventos_webhook`) → parsear → 200. GET verify contra `WHATSAPP_VERIFY_TOKEN`.
4. **Runner re-keyeado:** lookup `phone_number_id → medico_id` (vía `wa_canales`), responder con el token **descifrado de ese médico**; bifurcación: si `incoming.from == wa_canales.numero_personal` → rama médico; si no → rama paciente. Usa `createServiceClient()` (ya existe en `src/lib/supabase/server.ts:38`) y filtra `medico_id` a mano.
5. **Agente IA reescrito** sobre `ai ^6`: `generateText` + tools con `tool()`/Zod + `stopWhen: stepCountIs(5)`, modelo Claude Haiku 4.5. `medico_id` **inyectado** (patrón `AgentDeps`), no resuelto por sesión. En Fase 0 el agente solo charla (saludo + FAQs desde `wa_config_agente`).
6. **Conexión del número:** para el MVP con el número de prueba (D2) alcanza con **sembrar** la fila `wa_canales` del médico de prueba (`phone_number_id` + token cifrado + `numero_personal`). La pantalla mínima de carga / self-service queda para cuando haya alta multi-número (Fase 3).

**Prerrequisito antes de tocar código:** dumpear el schema real de MediCuenta (`perfiles`, `prestaciones`, `ordenes`, policies) vía Supabase MCP, para no re-keyear a ciegas.

---

## 6. Fase 1 — Cobro de recetas (MVP prioritario)

### Flujo en lenguaje simple

1. El médico genera las recetas en la app de OSEP y **reenvía al bot todos los PDFs del día, en lote** (sin datos del paciente).
2. El bot reconoce que el remitente es el médico (su `numero_personal`). Por cada PDF: lo **descarga**, lo **guarda** en Storage, le pasa el **OCR** (lee **nombre y DNI del paciente** + los datos de la receta) y crea una fila `recetas` en `pendiente_pago` con el **precio fijo configurado** por el médico. Le confirma el lote recibido.
3. El médico le dice **de palabra** al paciente que escriba al WhatsApp del bot (no carga su contacto).
4. El paciente escribe (**él inicia → gratis, abre la ventana de 24h**, sin plantilla). El bot le pide **nombre + DNI**, busca su receta y, si la encuentra, le manda el **link de pago de MercadoPago** (preferencia con el token del médico → la plata va a su cuenta). `external_reference = receta:<id>`.
5. El paciente paga **dentro de las 24h**. El webhook de MP confirma el pago y el bot **entrega el PDF como documento** (la ventana sigue abierta).
6. Si el pago se confirma con la ventana ya cerrada, la receta queda `pagada` sin entregar; **cuando el paciente vuelve a escribir** (gratis, reabre la ventana) el bot verifica el pago y entrega el PDF. Costo de mensajería cero.

### Componentes nuevos

- **OAuth MercadoPago por médico:** flujo de "Conectar MercadoPago" (una vez) → guarda `access_token`/`refresh_token` **cifrados** en `mp_conexiones`. Refresh automático cuando expira.
- **OCR ampliado para recetas:** ramificar el OCR por mimeType (imagen vs `{type:'file', mediaType:'application/pdf'}` para Claude vía OpenRouter — **verificar en runtime** que el provider propaga el content-part `file`). **Schema nuevo** de receta (**nombre y DNI del paciente**, medicamentos, droga, posología, prescriptor, nro de receta) — distinto del de orden de práctica. La rama del runner **no** pasa por el `compressImage` del frontend (que rompe PDFs).
- **Cliente Meta ampliado:** `uploadWhatsAppMedia` (subir el PDF y obtener `media_id`), `sendWhatsAppDocument` (entregar por `media_id`, link autenticado temporal de Meta — no URL propia adivinable), parseo de `document` entrante en `parseIncomingMessage`.
- **Tools del agente:** `buscar_receta_paciente(nombre, dni)` (identifica al paciente y trae su receta pendiente) y `cobrar_receta(receta_id)` (crea la preferencia MP y devuelve el link). `medico_id` inyectado en ambas.
- **Webhook MercadoPago** `POST /api/mercadopago/webhook`: valida origen + idempotencia por `payment_id`, consulta el pago con el token del médico, marca la receta y dispara la entrega del PDF.
- **Bucket `recetas`** (privado) + migración.

### 6.1. Carga de recetas en lote (médico → bot)

El médico manda los PDFs y listo; **no** carga teléfono ni datos del paciente:

1. El médico reenvía uno o varios PDFs. Por cada uno, el bot lo descarga, lo guarda en Storage, corre el OCR (lee `paciente_nombre`, `paciente_dni` y los datos de la receta) y crea `recetas` en estado `pendiente_pago` con `monto` = el **precio fijo configurado** del médico (`wa_config_agente.precio_receta_default`).
2. El bot le confirma al médico el lote: *"Recibí 8 recetas: Juan Pérez, María García, … Precio $5.000 c/u. Listas para cobrar."*.
3. Si el OCR quedó con `confianza: baja` o no pudo leer nombre/DNI de alguna, esa receta queda `pendiente_datos` y el bot le pide al médico que la confirme. **Nunca cobra con identidad dudosa.**

El precio se configura una vez (D6) y se puede cambiar; opcionalmente el médico lo sobrescribe para un lote puntual diciéndoselo al bot.

### 6.2. Identificación del paciente y matching de la receta

- El paciente, al escribir, se identifica con **nombre + DNI**. El bot **normaliza** (mayúsculas, acentos, espacios) y busca en las `recetas` `pendiente_pago` del médico dueño del número, matcheando por `paciente_dni` (clave fuerte) + `paciente_nombre`. El DNI evita confundir homónimos y entregar la receta equivocada.
- El `paciente_telefono` y el `contacto_id` se **capturan al escribir el paciente** (no se cargan antes).
- Si hay **varias recetas pendientes** para ese paciente: el bot las lista y cobra de a una (la más antigua primero) o sumadas (UX a afinar).
- Si **no encuentra** receta para ese nombre/DNI: responde amablemente (*"No encuentro una receta a tu nombre, verificá con tu médico"*) y, si querés, avisa al médico.

### 6.3. Estados de pago de MercadoPago (qué entrega el PDF y qué no)

- `approved` → marca `pagada` y **entrega el PDF**.
- `pending` / `in_process` → **no** entrega; espera el siguiente webhook.
- `rejected` → no entrega; el link sigue vivo para reintentar.
- `refunded` / `charged_back` (posterior a la entrega) → fuera del alcance automático: se marca y se **avisa al médico** (el PDF ya no se puede "des-entregar").

### 6.4. Expiración del link y de la receta

- La preferencia de MP se crea con `expiration_date_to` (default **7 días**). Vencido, el link no cobra.
- La receta pasa a `vencida` de forma perezosa (cuando el paciente escribe pasado el plazo) y/o con un cron diario. El PDF se conserva en Storage (el médico puede regenerar el link).

### 6.5. Entrega del PDF y la ventana de 24h (decisión del dueño: costo cero)

El objetivo es **no pagar nunca por mensajería**: todo es paciente-inicia. Diseño:

1. **Camino normal** (lo más común: el paciente paga apenas recibe el link): el webhook de MP confirma el pago y, como la ventana sigue abierta, el bot **entrega el documento de inmediato**.
2. **Pago con la ventana ya cerrada** (>24h desde el último mensaje del paciente): la receta queda `pagada` **sin entregar**. El bot **espera el próximo mensaje del paciente** — que reabre la ventana **gratis** — y ahí entrega el PDF. El paciente, que quiere su receta, naturalmente vuelve a escribir (*"ya pagué"*). **Sin plantilla paga.**

Dos disparadores de entrega: el **webhook de MP** (si la ventana está abierta) y el **próximo mensaje entrante del paciente** (el bot, al ver una receta `pagada` sin entregar de ese paciente, verifica y entrega). Decisión del dueño: priorizar costo cero sobre entrega proactiva inmediata.

### 6.6. Seguridad del webhook de MercadoPago

- **No confiar en el body** salvo el `payment_id`. Todo lo demás se **re-lee de la API de MP** con el token del médico.
- Validar que `payment.external_reference` corresponde a una `recetas` existente, que el **monto coincide** con `recetas.monto`, y que el cobro se hizo con la **cuenta MP del médico dueño** de esa receta (`collector_id`/`mp_user_id` == `mp_conexiones`) → evita confusión **cross-tenant** (que una preferencia con el `external_reference` ajeno entregue el PDF de otro médico).
- **Idempotencia** por `payment_id` (no entregar dos veces).

### 6.7. Refresh del token de MercadoPago (no romper el cobro en silencio)

- Antes de crear cada preferencia: si el token está por expirar, refrescarlo con `refresh_token`.
- Si el refresh falla (token revocado/usado): marcar `mp_conexiones.estado = 'reconectar'` y **avisar al médico**. El cobro de ese médico se pausa hasta que reconecte — nunca falla en silencio.

### 6.8. Visibilidad mínima para el médico (dentro del MVP)

Una vista simple (o una consulta al bot) del estado de cada receta (`pendiente_pago` / `pagada` / `vencida`), para que el médico sepa si cobró sin esperar al panel completo de la Fase 3. Cubre el caso "el paciente nunca escribió".

### 6.9. Spikes a cerrar ANTES de codear la Fase 1

- **OCR de PDF:** verificar que Claude vía OpenRouter acepta un content-part `file`/PDF dentro de `generateObject`. Si **no** funciona, plan B: renderizar la primera página del PDF a imagen en el server antes del OCR (agrega una dependencia; evaluar viabilidad en Vercel). El primer PDF de muestra (A1) sirve para este spike.
- **Ventana de 24h en la entrega** (§6.5): confirmar el comportamiento real de Meta (rechazo fuera de ventana) para implementar bien el reintento por re-mensaje. **No** requiere plantilla.

**Modelo de negocio:** las preferencias se crean **a nombre del médico** → la plata va directo a él. Héctor cobra su suscripción aparte (sin comisión por transacción por ahora).

---

## 7. Fase 2 — Turnos ("de yapa")

Re-key de las tablas y servicios del motor de turnos a `medico_id`. `slots.ts` (lógica pura) se porta 1:1. Re-keyear **ambos** caminos de datos (`services.ts` con sesión y `whatsapp/admin-data.ts` con service-role — el bot usa este último). Tools del agente `consultar_disponibilidad` / `reservar_turno`. Cron de confirmaciones re-keyeado; **ojo:** el recordatorio proactivo (bot escribe primero) cae **fuera** de la ventana de 24h → necesita **plantilla HSM aprobada** por Meta. Diferir Google Calendar (la demo usa un solo calendario compartido); portar solo la agenda interna (DB). Agregar constraint anti-overbooking.

---

## 8. Fase 3 — Plataforma / pulido

Super-admin (god-mode) re-keyeado, onboarding multi-número self-service por médico (verificación de negocio en Meta + alta de número productivo), plantillas HSM para mensajes proactivos, alarma `necesita_humano` end-to-end (en el motor está muerta: 0011 crea la columna pero nadie la escribe/lee), panel de recetas/cobros, métricas. Nada de esto bloquea el MVP.

---

## 9. Convención técnica: molde de migración (a copiar literal)

```sql
CREATE TABLE wa_<entidad> (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- ...campos; CHECK (col IN (...)) en vez de enums Postgres; espejo en TS as const
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()  -- lo setea la app (sin trigger)
);
CREATE INDEX idx_wa_<entidad>_medico_id ON wa_<entidad>(medico_id);
ALTER TABLE wa_<entidad> ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_<entidad>_select" ON wa_<entidad> FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "wa_<entidad>_insert" ON wa_<entidad> FOR INSERT WITH CHECK (auth.uid() = medico_id);
CREATE POLICY "wa_<entidad>_update" ON wa_<entidad> FOR UPDATE USING (auth.uid() = medico_id);
CREATE POLICY "wa_<entidad>_delete" ON wa_<entidad> FOR DELETE USING (auth.uid() = medico_id);
```

- Tablas hijas (`wa_mensajes`, `recetas`) llevan **tanto `medico_id` como FK al padre** (patrón `chat_mensajes`/`debitos`).
- El acceso del **sistema** (webhook/runner/crons) va por **service-role + filtro manual de `medico_id`**, no por policy adicional. El RLS protege solo el acceso desde el dashboard.
- Formato de archivo de migración: imitar el existente `YYYYMMDD_<descripcion>.sql` (ver decisión D5 si se prefiere el estándar de 14 dígitos).

---

## 10. Variables de entorno nuevas

| Variable | Para qué |
|---|---|
| `ENCRYPTION_KEY` | Clave AES-256-GCM para cifrar tokens (Meta + MP). |
| `WHATSAPP_VERIFY_TOKEN` | Handshake del webhook de Meta (GET). |
| `WHATSAPP_APP_SECRET` | Verificar firma `X-Hub-Signature-256` (POST). |
| `MP_CLIENT_ID` / `MP_CLIENT_SECRET` | App de MercadoPago para el OAuth por médico. |
| `MP_REDIRECT_URI` | Callback del OAuth de MercadoPago. |
| `SUPABASE_SERVICE_ROLE_KEY` | (ya leído en `server.ts:39`) — confirmar que está en el deploy de Vercel. |

> **Para la fase de prueba** reutilizamos las credenciales del número de prueba que ya existen en `Agente_Whatsapp/.env.local` (`WHATSAPP_TEST_PHONE_NUMBER_ID`, `WHATSAPP_TEST_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`) copiándolas a MediCuenta. Falta obtener **`WHATSAPP_APP_SECRET`** del panel de la App de Meta (el motor original nunca lo configuró → por eso no verificaba firma).
>
> **Infraestructura:** durante las pruebas, **Supabase y Vercel en plan gratis**. Pasar a **Vercel Pro** (uso comercial + flexibilidad de crons) y **Supabase Pro** (sin pausa por inactividad + backups, importante para datos médicos/pagos) recién al entrar en **producción**. MercadoPago: usar **modo sandbox** para las primeras pruebas antes de mover plata real.

---

## 11. Decisiones tomadas (confirmá si estás de acuerdo)

Como dijiste "vos decidís el cómo", tomé estas decisiones técnicas con su razón. Marcá si alguna no te cierra:

- **D1 — Tablas nuevas con prefijo `wa_`** (no reutilizar `chat_conversaciones`/`chat_mensajes` del asistente interno). *Razón:* son entidades distintas y ya existen con ese nombre.
- **D2 — Conexión del número en la Fase 0: UN número (el de prueba de Meta, ya agendado).** ✅ *Confirmado por el dueño.* Se enruta médico/paciente por remitente; el alta multi-número self-service por médico se difiere a Fase 3 (exige verificación de negocio en Meta). El número gratis de prueba se usa hasta producción.
- **D3 — El intake del médico va en un canal/origen aparte**, no como un "paciente" más en la bandeja; la receta se vincula al hilo del paciente recién cuando este escribe. *Razón:* no ensuciar la bandeja ni confundir el historial de cobro.
- **D4 — El PDF se entrega como documento por WhatsApp** (link autenticado temporal de Meta), no como URL propia pública. *Razón:* son datos médicos sensibles; una URL propia sería adivinable.
- **D5 — Migraciones versionadas en el repo** con formato `YYYYMMDD_` (el existente). *Razón:* consistencia con lo que ya hay.
- **D6 — Carga en lote + precio fijo + identidad por nombre/DNI.** ✅ *Confirmado por el dueño.* El médico manda los PDFs del día sin datos del paciente; el precio es **fijo configurable** (se setea una vez, se aplica a todas, editable); el paciente se identifica al escribir con **nombre + DNI** que el OCR leyó de la receta (§6.1, §6.2).
- **D7 — Entrega del PDF sin plantilla paga (costo cero).** ✅ *Confirmado por el dueño.* El pago debe ocurrir dentro de las 24h; si llega con la ventana cerrada, el PDF se entrega cuando el paciente vuelve a escribir (gratis). Se prioriza costo de mensajería cero sobre entrega proactiva (§6.5).

## 12. Lo que necesito de vos (acciones del dueño)

- **A1 — Recetas OSEP de ejemplo:** el dueño sube **1 PDF** de receta ahora (el que tiene) y conseguirá **más muestras** con un médico amigo. Con el primero se define el schema de OCR y se hace el spike de PDF (§6.9). Confirmar que el PDF trae **nombre + DNI** del paciente (clave para la identificación) y si tiene texto seleccionable o es imagen.
- **A2 — MercadoPago de prueba:** un **médico amigo** prestará su cuenta de MercadoPago; arrancamos en **modo sandbox** (plata de mentira) antes de mover plata real. Hay que crear/obtener las credenciales de la app MP (`MP_CLIENT_ID`/`MP_CLIENT_SECRET`).
- **A3 — Número de WhatsApp:** ✅ número de **prueba de Meta** (gratis) hasta producción.
- **A4 — `WHATSAPP_APP_SECRET`:** obtenerlo del panel de la App de Meta (Configuración → Básico) para activar la verificación de firma del webhook.

---

## 13. Fuera de alcance (YAGNI por ahora)

- Super-admin / god-mode (Fase 3).
- Onboarding multi-número self-service (Fase 3).
- Comisión por transacción de Héctor (la suscripción se cobra aparte).
- Google Calendar (la agenda vive en la DB).
- Migrar/tocar `Agente_Whatsapp` (sigue siendo el SaaS general, intacto).
- Plantillas HSM proactivas (solo cuando haga falta que el bot escriba primero — Fase 2/3).

---

## 14. Riesgos principales

| Riesgo | Mitigación |
|---|---|
| Webhook sin firma/idempotencia disparando cobros | Verificar `X-Hub-Signature-256` + dedupe por `wamid`/`payment_id` desde el día 1 de la Fase 0/1. |
| Schema real de MediCuenta no versionado | Dumpear vía Supabase MCP antes de portar. |
| OCR de PDF de receta no soportado aún | Verificar en runtime el content-part `file` con Claude vía OpenRouter; tener fallback. |
| Cifrado de tokens inexistente | Capa AES-256-GCM propia, probada, antes de guardar cualquier token. |
| Choque con `dev/gaby` (Gaby trabaja en paralelo) | Trabajo aditivo (carpetas/migraciones nuevas); rebasar sobre `dev/gaby` periódicamente. |
| Ventana de 24h en la **entrega del PDF** post-pago | El pago debe ocurrir dentro de las 24h; si no, el PDF se entrega cuando el paciente vuelve a escribir (gratis, reabre la ventana) — sin plantilla paga (§6.5). |
| Refresh del token de MercadoPago | Detectar expiración antes de cobrar; si falla, marcar `reconectar` y avisar al médico — nunca fallar en silencio (§6.7). |
| Webhook de MP / confusión cross-tenant | No confiar en el body; re-leer el pago de la API de MP con el token del médico y validar dueño + monto (§6.6). |
| OCR de PDF aún no verificado | Spike antes de codear; plan B PDF→imagen server-side (§6.9). |
| Mensajes proactivos fuera de ventana | Solo con plantilla HSM aprobada (Fase 2/3). |

---

## 15. Próximo paso

Tras tu aprobación de este spec → armar el **plan de implementación** (skill `writing-plans`) detallando la Fase 0 tarea por tarea, y recién ahí empezar a portar código.

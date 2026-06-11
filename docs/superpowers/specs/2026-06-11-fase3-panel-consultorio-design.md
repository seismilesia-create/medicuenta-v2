# Diseño: Fase 3 — Panel web del consultorio (agenda, conversaciones, pacientes, secretaria, integraciones)

- **Fecha:** 2026-06-11
- **Rama:** `feat/whatsapp-recetas-turnos` (rebase pendiente sobre `origin/dev/gaby` — commit `175efa4` — ANTES de implementar)
- **Autores:** Héctor (médico/dueño, decisiones de producto vía brainstorm con visual companion) + Claude (arquitectura)
- **Estado:** Diseño aprobado sección por sección en brainstorm; pendiente review final del archivo por el dueño
- **Specs previos:** `2026-06-09-whatsapp-recetas-turnos-design.md` (§8.1 fue la semilla de este diseño)

---

## 1. Objetivo en una frase

Darle al médico (y a su secretaria) un **panel web del consultorio** dentro de la app MediCuenta actual — agenda con calendario y sobreturnos, bandeja de conversaciones del asistente con intervención humana, base de pacientes auto-armada y configuración self-service — más tres integraciones que cruzan dominios: espejo a Google Calendar, **correlación turno→orden** (la agenda como fuente de verdad de la fecha/hora real de atención que hoy el médico inventa al facturar) y pulido desktop de la facturación existente.

**Qué NO es esta fase:** ni rediseño de facturación (decisión: pulir, no rediseñar), ni el dashboard superadmin/orquestador de Héctor (próximo brainstorm, ver §12), ni infra productiva (al final de todo, decisión del dueño).

---

## 2. Decisiones del brainstorm (con su porqué — no re-debatir)

| # | Decisión | Por qué |
|---|---|---|
| D1 | **Facturación: pulir la app actual para desktop, NO rediseñar.** | El dueño recorrió la app real (rama de Gaby) y validó la estructura: en PC da todas las opciones; en celular se enfoca en carga (fotos/manual/oral nivel 2). |
| D2 | **Secretaria con usuario propio invitado por el médico** (no sesión compartida, no PIN). | Única opción que protege los números del médico a nivel base de datos + trazabilidad de quién hizo qué + revocable sin cambiar contraseñas. |
| D3 | **Sobreturnos: lista aparte del día, SIN horario.** Solo los crean secretaria o médico desde el panel (el aviso al médico es protocolo humano, no flujo de la app). El médico decide cuándo lo hace pasar. Llevan **modalidad de cobro propia**: `particular` (efectivo, aunque tenga OS) o `sin_cargo` (amigos). | Así funcionan los consultorios reales según el dueño. El bot JAMÁS da sobreturnos. |
| D4 | **Google Calendar: espejo unidireccional best-effort.** Evento mínimo: "Turno: Apellido, Nombre — servicio" (sin DNI/OS/motivo). | El médico VE su agenda en el celular (pidió expresamente "vista semana" → se la da GCal gratis); bidireccional = dos fuentes de verdad y conflictos. Datos sensibles no van a Google. |
| D5 | **Token OSEP como pago de recetas: EN ESTUDIO, fuera de Fase 3.** | El dueño va a investigar en campo (médicos amigos + secretarias que gestionan la orden de consulta). Lo conocido: la receta tendría dos modalidades de pago — MercadoPago (hoy) u orden de consulta con token OSEP. `ordenes.token_osep` ya existe. |
| D6 | **Conversaciones: bandeja + intervención + alarma "necesita humano".** | El bot detecta solo cuándo levantar la mano; sin alarma habría que vigilar la bandeja todo el día. La columna `necesita_humano` existe desde Fase 0 esperando esto. |
| D7 | **Pacientes: ficha auto-armada, nada clínico.** | La base se construye sola con la identidad que el bot ya captura (DNI como llave). Notas clínicas informales = pseudo-historia clínica sin diseño legal (Ley 26.529) → NO. La HC futura se adhiere acá. |
| D8 | **Correlación turno→orden + control de 15 minutos.** | Dolor real: al presentar, el médico inventa fecha/hora de atención; OSEP exige ≥15 min entre atenciones; errores = débitos. La agenda tiene los datos reales y las órdenes ya tienen los campos (`nro_documento`, `fecha_atencion`, `horario_realizacion`). |
| D9 | **OS suspendidas: aviso del bot YA, con lista manual del médico como fuente provisoria "enchufable".** | El problema existe hoy. El dueño natural del dato es el círculo médico → cuando exista la app del círculo (producto B2B), pasa a ser la fuente oficial. Argumento de venta incluido. |
| D10 | **Enfoque: integrado a la app actual, por etapas 3A → 3B → 3C.** | Un solo producto (visión), cada etapa se prueba en vivo por separado (método Fase 2), y el riesgo de permisos delegados queda contenido en 3B. |
| D11 | **Agenda: layout "día protagonista"** (lista del día + sobreturnos al costado + tira semanal arriba). La vista semana-grilla NO se construye en el panel: la da el espejo GCal en el celular. | Elegido sobre mockups en el visual companion. Como la agenda de papel de un consultorio. Menos para construir. |
| D12 | **Config muestra "Duración de la consulta", NO un catálogo de servicios.** | Corrección de dominio del dueño: el turno médico es uno solo (la consulta; una cirugía menor entra en la consulta; prácticas nivel 1 casi no pasan por consultorio). El motor multi-servicio de Fase 2 QUEDA (probado, sirve al futuro multi-profesión: psicólogo 50 min, kinesiólogo con varios tipos) — solo no se muestra en la UI del médico. |
| D13 | **Semáforo de conversaciones + colores por actor** (pedido visual del dueño). | Bandeja: 🔴 necesita atención · 🟢 viva (= ventana 24h abierta, se puede escribir) · 🔵 terminada (vuelve a verde si el paciente escribe). Hilo: paciente gris (izquierda) · asistente azul · humano verde, con etiqueta de quién y hora. |

---

## 3. Arquitectura general

```
                        App MediCuenta (una sola, Next.js 16)
   ┌─────────────────────────────────────────────────────────────────┐
   │  FACTURACIÓN (existente, médico-only)   CONSULTORIO (nuevo)      │
   │  /dashboard /reportes /ordenes          /agenda                  │
   │  /cirugias /debitos /liquidaciones      /conversaciones          │
   │  /nomenclador /asistente /perfil        /pacientes               │
   │                                         /consultorio/config      │
   └────────────────────────┬────────────────────────┬───────────────┘
                            │ sesión (RLS)           │ sesión (RLS;
                            ▼                        ▼  3B: delegada)
                       Supabase ◀── service-role ── Webhook/Runner (bot, intacto)
                            │
                            └──▶ espejo best-effort ──▶ Google Calendar (3C)
```

- **El panel entra por la sesión del usuario** (médico o secretaria) → lo protege el RLS. El bot sigue por service-role con filtro manual de `medico_id` (patrón Fases 0–2, intacto).
- **Etapa 3A no toca NINGUNA policy existente**: las pantallas nuevas usan el RLS `auth.uid() = medico_id` que ya está. La delegación de la secretaria es un cambio aparte y acotado (3B, §7).
- **Navegación**: en desktop, sidebar fija con dos grupos (Facturación / Consultorio); en mobile sigue la navegación actual de Gaby. La secretaria ve SOLO el grupo Consultorio (y el RLS la respalda: esconder el menú no es la seguridad, es la cortesía).

### Etapas

| Etapa | Contenido | Prueba en vivo |
|---|---|---|
| **3A** | Migraciones + Agenda + Conversaciones (bot aprende `necesita_humano` y aviso OS suspendidas) + Pacientes (con backfill) + Config | El dueño solo, con su consultorio de prueba |
| **3B** | Secretaria: vínculo + invitación + RLS delegada + navegación por rol + **tests de seguridad obligatorios** | Usuario-secretaria de prueba |
| **3C** | Espejo GCal + correlación turno→orden + control 15 min + pulido desktop facturación | Google real del dueño + órdenes reales |

Cada etapa tiene su propio plan de implementación (writing-plans) al momento de construirla. **Prerrequisito de todo: rebase sobre `origin/dev/gaby` (`175efa4`).**

---

## 4. Modelo de datos

Molde canónico MediCuenta para todas las tablas nuevas (spec Fase 2 §9): `medico_id REFERENCES auth.users`, RLS 4 policies, índice por `medico_id`, `created_at/updated_at`, CHECK en vez de enums.

### Tablas nuevas

| Tabla | Etapa | Columnas clave |
|---|---|---|
| `wa_sobreturnos` | 3A | `medico_id`, `fecha DATE` (sin hora — D3), `paciente_nombre`, `paciente_apellido`, `paciente_dni` (nullable), `paciente_obra_social`, `paciente_telefono` (nullable), `cobro` CHECK (`particular`,`sin_cargo`), `estado` CHECK (`pendiente`,`atendido`,`no_vino`,`cancelado`), `notas`, `creado_por UUID NOT NULL` (siempre lo crea un humano del panel) |
| `wa_pacientes` | 3A | `medico_id`, `dni` (llave fuerte), `nombre`, `apellido`, `obra_social`, `telefonos JSONB` (todos los números vistos), `UNIQUE(medico_id, dni)`. **Upsert automático** al crearse turno/sobreturno con DNI; **backfill** inicial desde `wa_turnos` existentes. Editable desde el panel. |
| `wa_os_suspendidas` | 3A | `medico_id`, `nombre_os`, `nota` (nullable), `fuente` DEFAULT `'manual'` (D9: el día que exista la app del círculo, otra fuente la alimenta), `UNIQUE(medico_id, nombre_os)` |
| `wa_bitacora` | 3A | Bitácora estructurada del sistema (§10): `medico_id` (nullable), `origen` (`agente`,`panel`,`webhook`,`gcal`,`mp`), `nivel` (`info`,`error`), `evento`, `detalle JSONB`, `conversacion_id` (nullable). **Es la comida del futuro orquestador (§12).** |
| `equipo_consultorio` | 3B | `medico_id`, `invitado_email`, `miembro_id UUID` (nullable hasta que se registre), `rol` CHECK (`secretaria`), `estado` CHECK (`activa`,`revocada`), `UNIQUE(medico_id, invitado_email)`. RLS: el médico CRUD sus filas; el miembro SELECT la suya. |
| `gcal_conexiones` | 3C | `medico_id UNIQUE`, `refresh_token_cifrado` (misma capa AES-256-GCM de Meta/MP), `calendar_id`, `estado`, `last_sync_at` |

### Columnas nuevas en tablas existentes

| Tabla | Columna | Etapa | Para qué |
|---|---|---|---|
| `wa_turnos` | `origen` CHECK (`bot`,`panel`) DEFAULT `'bot'` + `creado_por UUID` (nullable; null = bot) | 3A | Trazabilidad: quién dio el turno (D2) |
| `wa_turnos` | `paciente_telefono` pasa a **nullable** | 3A | Turno manual de paciente sin WhatsApp. Los turnos del bot siempre lo tienen (su flujo no cambia); la cancelación del bot sigue candada por teléfono. |
| `wa_turnos` | `gcal_event_id` (nullable) | 3C | Gestión del espejo (crear/borrar el evento correcto) |
| `ordenes` | `turno_id UUID` (nullable, FK `wa_turnos`) | 3C | El enlace de la correlación (D8). Para sobreturnos NO hay FK: se sugiere solo la fecha. |

### Reusos (ya estaban esperando esto)

- `wa_conversaciones.necesita_humano` — existe desde Fase 0; el bot ahora la escribe, el panel la lee.
- `wa_conversaciones.bot_pausado` — la palanca existe y funciona; el panel le pone botón.
- Estados de turno `completado`/`ausente` (Fase 2) — **asistencia**: un turno pasado se asume atendido salvo marca `ausente` ("no vino"). Sin fricción de marcar cada uno.
- Motor multi-servicio (`wa_servicios` + `resolverServicio`) — queda intacto bajo el capó (D12); la UI solo edita la duración del único servicio "Consulta".
- Capa de cifrado AES-256-GCM — la misma caja fuerte para el token de Google.
- `ordenes.nro_documento` / `fecha_atencion` / `horario_realizacion` / `token_osep` — los campos de la correlación y del futuro token OSEP ya existen.

---

## 5. Agenda (`/agenda`) — etapa 3A

**Layout (D11): el día como protagonista.** Tira semanal arriba (días con contador de turnos, para saltar); lista cronológica del día al centro; **panel de sobreturnos del día siempre visible al costado**.

Funcionalidad:

1. **Ver turnos** con identidad completa (apellido, nombre, DNI, OS, motivo) — la versión visual del comando `turnos`.
2. **Turno manual**: click en hueco libre → mini-form (nombre, apellido, DNI **opcional**, OS, teléfono opcional, motivo). Usa el MISMO motor de slots del bot; el constraint EXCLUDE de la DB protege a ambos caminos de la carrera. **Los candados anti-acaparamiento (3 por número, 1/día por DNI) siguen aplicando SOLO al bot** — el criterio humano no necesita candados.
3. **Sobreturno**: botón aparte → paciente + cobro (`particular`/`sin_cargo`) + nota. A la lista del día, sin hora (D3). Se marca `atendido`/`no_vino`.
4. **Asistencia**: turnos pasados se asumen atendidos; botón "no vino" → `ausente`. Alimenta la correlación (3C) y métricas de ausentismo.
5. **Bloquear día/rango** ("congreso la semana que viene") → crea `wa_excepciones` `closed`; el bot deja de ofrecer esos días al instante.
6. **Actualización sin recargar**: si el bot da un turno con la agenda abierta, aparece (Supabase Realtime o polling — decidir en el plan).
7. **Corregir datos del paciente de un turno** desde la agenda (p. ej., completar el DNI que faltó en un turno manual → recién ahí alimenta `wa_pacientes`).

Turno manual **sin DNI**: se da igual (la vida real manda), pero no alimenta `wa_pacientes` hasta que alguien complete el DNI (punto 7). El bot sigue exigiendo DNI siempre. *Mejor un turno sin DNI que un DNI inventado.*

---

## 6. Conversaciones (`/conversaciones`) — etapa 3A

**Bandeja con semáforo (D13):** 🔴 necesita atención (siempre arriba, badge) · 🟢 viva = ventana 24h abierta · 🔵 terminada = ventana cerrada (típico: turno agendado y se fue contento); vuelve a 🟢 sola si el paciente escribe. *La regla del semáforo coincide con la ventana de Meta: verde = podés escribir; azul = solo lectura hasta que vuelva.*

**Hilo:** burbujas por actor — paciente gris (izquierda), asistente azul, humano verde — con etiqueta de quién y hora. Indicador de ventana ("● abierta, cierra en 22 h").

**Intervención:**
- Botón **"Pausar asistente"** → el bot se calla en esa conversación; el humano escribe desde el panel y sale por el MISMO número de WhatsApp. Mensajes registrados con `origen: 'humano'` + quién (médico o secretaria) → el bot, al reactivarse, tiene todo el contexto en el historial.
- Si la ventana está cerrada: campo deshabilitado con explicación ("vas a poder responderle cuando vuelva a escribir"). Plantillas HSM = producción, como ya está decidido.
- Si Meta rechaza el envío: mensaje marcado **"no enviado"** con motivo visible. Nada falla en silencio.

**Alarma `necesita_humano` (D6):** el bot la enciende cuando el paciente pide una persona, está disconforme, o él no puede resolver (mecanismo concreto — tool o detección en el runner — se define en el plan; el system prompt ya derivará "le aviso al consultorio"). Se apaga al intervenir/resolver desde el panel. **Detalle barato:** cuando el médico usa cualquier comando (`turnos`, `recetas`), el bot agrega "⚠️ Además: N conversaciones necesitan atención".

---

## 7. Pacientes (`/pacientes`) — etapa 3A · Secretaria — etapa 3B

### Pacientes

- **El paciente NO es quien escribe** (lección Fase 2: nieto→abuela). La base se construye con la identidad del *paciente del turno*, no con los contactos de WhatsApp. **El DNI unifica** aunque reserve desde dos teléfonos.
- **Lista** buscable (apellido / DNI / teléfono) con última visita. **Ficha**: identidad editable, teléfonos conocidos, historial de turnos/sobreturnos/ausencias, chip de asistencia ("vino a 8 de 9"), botón → su conversación de WhatsApp, botón → dar turno.
- **Recetas en la ficha: SOLO el médico** (medicamentos y montos jamás a la secretaria). Cruza por DNI con las `recetas` del bot.
- **Nada clínico** (D7). La historia clínica futura se adhiere a esta ficha cuando se diseñe con su marco legal.

### Secretaria (3B)

- **Vínculo**: Config → Secretaria → email. Cuenta existente → vincula; si no existe → se registra con ese email y activa. **Revocar = corte inmediato.**
- **Puede**: agenda completa (turnos manuales, sobreturnos, asistencia, cancelar, bloquear días) · conversaciones (ver, pausar, responder firmando ella) · pacientes (buscar, ver SIN recetas, corregir datos).
- **No existe para ella**: facturación entera, recetas, config del consultorio. **Ni en el menú ni en la base**: el RLS de facturación/recetas no se toca — aunque le pegue a la API directo, la base le niega los datos. Defensa en profundidad, no maquillaje.
- **RLS delegada (el único cambio de policies del proyecto, contenido en 3B):** en tablas del consultorio (`wa_turnos`, `wa_sobreturnos`, `wa_contactos`, `wa_conversaciones`, `wa_mensajes`, `wa_pacientes`, `wa_excepciones`), la policy pasa de `auth.uid() = medico_id` a `… OR EXISTS (vínculo activo en equipo_consultorio)`. En `wa_horarios`/`wa_servicios`: **solo SELECT delegado** (la agenda necesita leerlos para calcular huecos); escritura sigue médico-only. `wa_config_agente`, `wa_canales`, `recetas`, `mp_conexiones` y TODA la facturación: intactas.
- **Multi-consultorio soportado de entrada** (gratis con este modelo): una secretaria vinculada a 2+ médicos ve un selector de consultorio. Puerta abierta a clínicas.
- **Límite MVP**: un solo rol `secretaria` con paquete fijo. Permisos finos cuando un caso real los pida.
- **Vara de seguridad**: 3B no se da por terminada sin tests explícitos de que la secretaria NO lee facturación ni recetas, ni por API directa (§10).

---

## 8. Config del consultorio (`/consultorio/config`) — etapa 3A (médico-only)

1. **Horarios de atención**: editor semanal, varios bloques por día (09–13 / 17–20). Impacta la oferta del bot al instante. **Los turnos ya dados fuera del nuevo horario NO se tocan** — solo cambia la oferta futura.
2. **Duración de la consulta (D12)**: un solo número editable ("Turno cada [20] minutos") — edita el único servicio "Consulta" del motor. Sin pantalla de catálogo. Cambio afecta solo turnos futuros.
3. **Días bloqueados**: la lista completa de excepciones (lo mismo que el bloqueo rápido desde la agenda).
4. **OS suspendidas (D9)**: agregar/quitar OS + nota. El bot avisa al reservar (match tolerante a mayúsculas/acentos contra la OS que dice el paciente): *"Te aviso que por el momento la atención por [OS] está suspendida — la consulta sería particular"*. Informa, no bloquea (patrón del bot: informa, no decide). Fuente `manual` provisoria → app del círculo en el futuro.
5. **El asistente**: identidad (nombre del médico + especialidad), tono, saludo, FAQs, precio de receta (el comando `precio` por WhatsApp sigue funcionando).
6. **Conexiones**: estado de WhatsApp ✓ y MercadoPago ✓ (solo lectura) + **"Conectar Google Calendar"** (3C).
7. **Secretaria** (3B): invitar por email, estado del vínculo, revocar.

---

## 9. Integraciones — etapa 3C

### 9.1 Espejo Google Calendar (D4)

- OAuth de Google una vez (Config → Conexiones); refresh token cifrado (caja fuerte existente). Memoria arquitectónica del proyecto: Calendar personal de cada médico vía OAuth — confirmada acá.
- **Unidireccional, best-effort**: crear turno → evento "Turno: Apellido, Nombre — Consulta" (sin DNI/OS/motivo); cancelar → borra evento; sobreturno → evento de **día completo** "SOBRETURNO: Apellido". Fallos de Google JAMÁS frenan una reserva: se reintenta después; estado y "Sincronizar ahora" en Config.
- **Regla de uso honesta** (documentar en la UI): editar/borrar eventos en GCal no afecta la app (la próxima sync los repone). Para bloquear una tarde se usa el panel, no Google. La agenda es la fuente de verdad; GCal, el reflejo en el celular del médico (su "vista semana", D11).

### 9.2 Correlación turno→orden + control 15 min (D8)

- En `/ordenes/nueva` y en el flujo OCR: con el DNI presente, busca turnos/sobreturnos **atendidos** de ese DNI sin orden vinculada → sugiere *"Este paciente tuvo turno el mar 12/05 10:30 — ¿usar fecha y horario reales?"* → un click completa `fecha_atencion` + `horario_realizacion` y guarda `ordenes.turno_id`. Editable, nunca obligatorio. Sobreturnos: sugiere solo fecha (sin hora, sin FK).
- **Control 15 min**: al guardar una orden cuyo horario quede a <15 min de otra orden del mismo día → aviso (no bloqueo): *"⚠️ queda a 10 min de la de Pérez (10:20) — OSEP exige mínimo 15 min entre atenciones"*. Umbral fijo 15 (función pura testeada); configurable por OS si algún día hace falta.
- Valor doble: menos débitos hoy + data real de atención (el activo del producto B2B círculos).

### 9.3 Pulido desktop de facturación (D1 — acotado, sin rediseño)

Sidebar fija en desktop (dos grupos) · tablas de órdenes/cirugías con más columnas visibles · dashboard/reportes en grilla · `/ordenes/nueva` amigable al teclado (tab order + Enter). **Después del rebase sobre `175efa4`** para pulir sobre lo último de Gaby.

---

## 10. Robustez y testing

**Nada falla en silencio (regla transversal):**
- Toda acción del panel que falla → mensaje claro con porqué + reintentable. Carrera de reserva (23P01) → "ese horario se acaba de ocupar" (la lógica idempotente de Fase 2 se reusa).
- Mensaje humano rechazado por Meta → "no enviado" + motivo, visible en el hilo.
- Espejo GCal → nunca bloquea, reintenta, estado visible.
- **`wa_bitacora`**: decisiones del agente (tool, resultado, error) y errores del sistema, estructurados y consultables. Hoy viven a medias en logs de consola (`[wa] agente steps=`); la Fase 3 los formaliza. **Es la semilla/alimento del orquestador (§12)** — el agente que "observa que todo ande" necesita algo que leer: esto.

**Testing (método Fase 2):**
- Lógica decidible en **funciones puras con TDD** (vitest): semáforo de bandeja, armado del día (turnos+sobreturnos), sugerencia de correlación, chequeo 15 min, match de OS suspendidas, asistencia.
- **3B con vara especial**: tests que prueben que la secretaria NO accede a facturación/recetas ni por API directa (sesión secretaria simulada contra las policies).
- Gates: `npm test` + `npm run typecheck` + `npm run build` (lint sigue roto — deuda conocida, no es gate).
- **Prueba en vivo del dueño al cierre de cada etapa** (3A solo · 3B con usuario-secretaria de prueba · 3C con Google y órdenes reales).

---

## 11. Fuera de alcance / en estudio (decidido — no re-debatir)

- **Token OSEP / orden de consulta como pago de recetas** (D5): EN ESTUDIO. Investigación de campo del dueño pendiente. Cuando vuelva con el mecanismo, brainstorm propio.
- **Link de cobro libre por MP para prácticas menores** (idea anotada 2026-06-11): el médico cobra prácticas menores en persona (efectivo/transferencia/link); el enchufe MP ya existe — agregado natural futuro, no ahora.
- **App del círculo médico** (producto B2B): el flujo círculo→OS suspendidas→médicos y médico→presentación→círculo queda anotado; `fuente` en `wa_os_suspendidas` es el enchufe.
- **Historia clínica**: requisitos legales propios (Ley 26.529); se adhiere a la ficha de pacientes cuando se diseñe.
- **Plantillas HSM / recordatorios proactivos / cron**: producción (decisión vigente desde Fase 2).
- **Multi-número self-service / verificación de Meta**: producción.
- **Vista semana-grilla en el panel**: la da GCal (D11). Si el uso real la pide, se agrega.
- **Roles finos de secretaria**: cuando un caso real lo pida.
- **Notificaciones push del panel**: el badge + aviso en comandos alcanza para el MVP.

---

## 12. Próximo después de Fase 3 (capturado del dueño, 2026-06-11 — NO diseñar todavía)

**El dashboard de Héctor (superadmin + orquestador)** — sus palabras, para arrancar el próximo brainstorm desde acá:

> Alta y baja de **suscripciones de médicos**, **análisis de métricas** del negocio, y un **asistente orquestador** que vive adentro, anda 24/7, mira que todo funcione bien, **orquesta a otros agentes** que analizan y envían informes de bugs/errores, y **decide si interviene solo o me avisa**. Runtime a definir después: servidor 24/7, compu propia con LLM local, suscripción MAX o API de Fable 5 — "necesito que sea muy capaz porque analizará y mantendrá toda mi infraestructura".

Lo que la Fase 3 ya le deja preparado: `wa_bitacora` (sus ojos, §10), suscripciones = Fase 5 del roadmap, y la infra productiva al final de todo.

---

## 13. Riesgos principales

| Riesgo | Mitigación |
|---|---|
| RLS delegada mal hecha expone facturación/recetas a la secretaria | Cambio contenido en 3B + tests de seguridad obligatorios antes de cerrar la etapa + facturación/recetas sin tocar sus policies |
| Espejo GCal frena o duplica reservas | Best-effort estricto: el espejo jamás está en el camino de la reserva; `gcal_event_id` para idempotencia |
| Realtime/refresh de agenda y bandeja agrega complejidad | Decidir en el plan 3A (Realtime vs polling); el MVP puede arrancar con polling simple |
| El médico edita GCal creyendo que cambia la agenda | Regla de uso documentada EN la UI de conexión + la sync repone el espejo |
| `wa_pacientes` con duplicados por DNI mal tipeado | La alarma de tipeo del bot (Fase 2) + edición/corrección en ficha; merge de pacientes = futuro si hace falta |
| Cambios de horario/duración rompen turnos existentes | Regla explícita: lo ya reservado se respeta; solo cambia la oferta futura |
| Scope creep de la fase (es grande) | Tres etapas con prueba en vivo y plan propio cada una; spec cierra alcance; "fuera de alcance" explícito (§11) |

---

## 14. Próximo paso

Tras la aprobación de este spec → **rebase sobre `origin/dev/gaby`** (tarea pendiente #10) → plan de implementación de la **etapa 3A** (skill writing-plans) → construir → prueba en vivo del dueño → 3B → 3C.

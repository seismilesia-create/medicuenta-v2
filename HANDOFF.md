# HANDOFF — MediCuenta V2 (agente WhatsApp) — 2026-06-10 ~15:30 ART

## Estado actual
- **Tarea**: Fusión del agente de WhatsApp en MediCuenta. **Fase 0 (motor) y Fase 1 (cobro de recetas con MercadoPago) COMPLETAS y probadas E2E en vivo** — el ciclo entero funcionó: médico configura precio → reenvía PDF de receta OSEP → OCR la lee → paciente se identifica (nombre+DNI) → recibe link real de MP → paga (sandbox) → webhook valida → PDF entregado por WhatsApp.
- **Estado**: working (sin pendientes de código de Fase 1)
- **Branch**: `feat/whatsapp-recetas-turnos` (basada en `dev/gaby`; trabajo 100% aditivo; `dev/gaby` sin commits nuevos al cierre)
- **Último commit ANTES de este handoff**: `95b5e9e` fix(entrega): reclamo atómico de la entrega — elimina el PDF duplicado por webhooks simultáneos de MP

## Qué se construyó (resumen de las sesiones 2026-06-09/10)
- **Fase 0**: webhook seguro `/api/whatsapp` (firma X-Hub-Signature-256 sobre raw body + dedupe por wamid), runner re-keyeado a `medico_id`, bifurcación médico/paciente por `numero_personal`, agente Claude Haiku 4.5 sobre `ai ^6` (OpenRouter), tablas `wa_*` (canales/contactos/conversaciones/mensajes/config_agente/eventos_webhook) con RLS `auth.uid()=medico_id`, cifrado AES-256-GCM de tokens (`src/lib/crypto/encryption.ts`).
- **Fase 1**: OCR de recetas RCD/OSEP desde PDF (`src/lib/ai/ocr-receta.ts`, content-part `file` → Claude vía OpenRouter, probado con receta real), Storage bucket privado `recetas`, tablas `recetas` + `mp_conexiones`, cliente MercadoPago (`src/lib/mercadopago/client.ts`), decisión de pago pura con validación cross-tenant (`validarPago.ts`, TDD ~14 tests), orquestador del webhook (`procesarPago.ts`, TDD con fakes), entrega del PDF como document de Meta, reconciliación anti-webhook-perdido al próximo mensaje del paciente, comandos del médico (`precio X`, `recetas`), tool-flow del paciente (`buscar_receta_paciente` → `cobrar_receta`).
- **Spec y plan**: `docs/superpowers/specs/2026-06-09-whatsapp-recetas-turnos-design.md` (diseño completo Fases 0–3) · `docs/superpowers/plans/2026-06-09-whatsapp-fase0-cimientos.md` · `docs/superpowers/plans/2026-06-09-whatsapp-fase1-recetas.md` (Task 13 OAuth MP quedó SIN ejecutar, diferida).
- **Tests**: 59 en verde (`npm test`), typecheck y build limpios.

## Decisiones tomadas (con el "por qué")
- **Agente reescrito sobre `ai ^6`** (no portado el loop fetch del motor viejo) — coherencia con el asistente in-app de MediCuenta.
- **OCR con Claude Haiku 4.5 vía OpenRouter** (no Gemini: el código real de MediCuenta ya usaba Haiku; schema "anti-Claude" sin .optional/.nullable).
- **Identidad del paciente = nombre + DNI leídos del PDF** (no teléfono cargado por el médico): el médico manda los PDFs en lote sin datos; el teléfono se captura cuando el paciente escribe.
- **Costo-cero de mensajería**: todo paciente-inicia; si el pago llega con la ventana de 24h cerrada, queda `pagada` y se entrega cuando el paciente vuelve a escribir (sin plantillas pagas).
- **Webhook MP no confía en el body**: re-consulta el pago a la API de MP con el token del médico y valida external_reference + collector (cross-tenant) + monto + moneda ARS en `decidirAccionPago` (lógica pura TDD).
- **Barrera determinística anti-links-inventados** (`sanitizarReply.ts`): ningún link sale al paciente si no lo devolvió la tool `cobrar_receta` en ese turno; los links del historial se tachan antes de pasarlos al modelo.
- **Entrega con reclamo atómico** (`reclamarEntrega`/`revertirEntrega`): pagada→entregada condicional en DB; ante avisos duplicados de MP solo un proceso envía; si el envío falla se revierte a `pagada`.
- **Tablas con prefijo `wa_`** para no chocar con `chat_conversaciones`/`chat_mensajes` del asistente in-app.
- Estados de receta: `pendiente_datos | pendiente_pago | pagada | entregada | vencida | devuelta` (devuelta = reembolso, bloquea re-entrega).

## Lo que NO funcionó (no repetir en próxima sesión)
- **Vercel Preview para el webhook**: el Deployment Protection es pago en el plan actual → Meta recibe 401. Solución actual: app local + túnel cloudflared. **Para producción: Vercel Pro elimina este problema.**
- **Túneles trycloudflare**: se caen solos cada pocas horas y CAMBIA la URL → hay que reconfigurar el webhook en Meta cada vez. No usar para producción.
- **Token temporal de Meta (panel "Configuración de la API")**: vence en horas (nos vencía en medio de la prueba). Para producción: **token permanente con "usuario del sistema"** en Business Settings.
- **Checkout sandbox de MP con identidad real**: pagar como invitado con email real (o sesión real de MP en el navegador) → "No pudimos procesar tu pago" sin registrar intento. Hay que pagar logueado con la **cuenta de prueba COMPRADORA** (se crea en "Cuentas de prueba" del panel MP) en ventana de incógnito.
- **Mensajes entrantes que no llegaban**: el webhook verificaba OK pero Meta no entregaba mensajes → faltaba **suscribir la app a la WABA**: `POST /v21.0/{WABA_ID}/subscribed_apps` con el token. Verificación de webhook + toggle `messages` NO alcanzan.
- **Número de prueba de Meta**: no es detectable desde WhatsApp (no se le puede escribir primero) → abrir el chat enviando la plantilla `hello_world` al destinatario y que la persona RESPONDA.
- **Haiku salteaba la tool `cobrar_receta`** e inventaba links con formato MP (2 veces) → no confiar en instrucciones de prompt para plata: barrera determinística + scrub del historial (ya implementadas). Si reincide en Fase 2 con reservas, aplicar el mismo patrón.
- **`vercel env add` interactivo falla** (CLI v53/v54 en modo agente): usar `vercel env add <KEY> preview <branch> --value "..." --yes` (branch-scoped; la rama debe existir en GitHub).
- **`npm run lint` está roto** (Next 16 deprecó `next lint`) — pendiente de migrar a ESLint CLI; no usarlo como gate (typecheck + tests + build sí funcionan).

## Próximo paso concreto
El dueño decidió: **pasar a PRODUCCIÓN y arrancar Fase 2 (turnos)**. Orden sugerido:
1. **Infra de producción** (desbloquea todo lo demás):
   - Migrar a **Supabase pago** y **Vercel Pro** (el proyecto ya está linkeado a Vercel; env vars de Preview ya cargadas — replicarlas a Production).
   - **Meta producción**: número REAL de WhatsApp (alta en la app "MediCuenta" + verificación de negocio si hace falta), **token permanente** (usuario del sistema en Business Settings con permisos `whatsapp_business_messaging` + `whatsapp_business_management`), webhook apuntando al dominio fijo de Vercel (adiós túneles), re-sembrar `wa_canales` con `scripts/seed-wa-canal.mjs`.
   - MP producción: credenciales productivas del dueño (mismo seed `scripts/seed-mp-conexion.mjs`) y más adelante OAuth (plan Fase 1 Task 13, ya escrito, sin ejecutar) para el médico amigo.
2. **Fase 2 — Turnos**: leer spec §7 (`docs/superpowers/specs/2026-06-09-whatsapp-recetas-turnos-design.md`) + el motor de origen (`~/proyectos/Agente_Whatsapp/src/features/appointments/` — `slots.ts` es lógica pura, se porta 1:1; re-keyear `business_hours`/`appointments`/`schedule_exceptions` a `medico_id`; constraint anti-overbooking EXCLUDE gist) → **invocar `superpowers:writing-plans`** para el plan de Fase 2 → ejecutar con subagentes como Fases 0/1.

## Comandos para verificar estado al retomar
```bash
cd ~/proyectos/Medicuenta-V2.0
git status        # esperado: limpio (salvo HANDOFF.md si no se commiteó)
git log -3        # esperado: 95b5e9e fix(entrega): reclamo atómico…
npm test          # esperado: 59 tests verdes
npm run typecheck # esperado: sin errores
```

## Archivos clave para releer en la próxima sesión
- `docs/superpowers/specs/2026-06-09-whatsapp-recetas-turnos-design.md` — el diseño completo; §7 es Fase 2 (turnos), §8 plataforma.
- `docs/superpowers/plans/2026-06-09-whatsapp-fase1-recetas.md` — Task 13 (OAuth MP) pendiente; patrón de plan a imitar para Fase 2.
- `src/features/whatsapp/runner.ts` — orquestación médico/paciente; acá se enchufan las tools de turnos.
- `src/features/whatsapp/agent/{tools.ts,sanitizarReply.ts,systemPrompt.ts}` — patrón de tools + barreras.
- `src/features/whatsapp/services/` — servicios service-role (TODOS filtran `medico_id` a mano).
- `~/proyectos/Agente_Whatsapp/src/features/appointments/` — motor de turnos a portar (NO tocar ese repo; solo copiar).
- Memoria auto: `~/.claude/projects/-Users-hector-proyectos/memory/whatsapp-medicuenta-fase0.md` (gotchas + IDs).

## Notas contextuales
- **Infra de prueba actual (efímera)**: app local `npm run dev` (logs `/tmp/medi_dev.log`) + túnel cloudflared (log `/tmp/cf_tunnel.log`, URL cambia al reiniciar; la última fue `supplements-tin-cornwall-newspaper.trycloudflare.com`). Ambos lanzados con nohup; pueden estar muertos al retomar — para Fase 2 en producción ya no se usan.
- **App de Meta**: "MediCuenta" (cuenta nueva de developers). IDs útiles: phone_number_id de prueba `1084361314771068` (+1 555-664-2326), WABA `2040120146582315`, verify token del webhook `agente-demo-2026`. El access token del panel es TEMPORAL (vence en horas).
- **Identidades de prueba**: médico = `admin@medicuenta.com` (uid `924014ac-fb0a-4d9c-9028-49535e5e2e60`), número dueño `543834403010`; paciente de prueba `543834222049`; MP vendedor de prueba `TESTUSER788…` (mp_user_id `3461742443`).
- **Secrets**: todos en `.env.local` (no commiteado): Supabase URL/anon/service_role, OPENROUTER_API_KEY, ENCRYPTION_KEY (¡NO rotar sin re-cifrar tokens!), WHATSAPP_* (token temporal, verify, app secret, phone_number_id), PUBLIC_BASE_URL (túnel). En Vercel: cargados scoped a Preview/rama — para producción hay que cargarlos en Production (y con el token permanente nuevo).
- **Migraciones**: las 2 nuevas (`20260609_whatsapp_fase0.sql`, `20260610_recetas_mercadopago.sql`) ya están APLICADAS en el Supabase actual (ref `eylcrxhpccwobipcjzal`) vía dashboard. Si producción = proyecto Supabase NUEVO, aplicar todas las migraciones + las tablas base que no están versionadas (¡ojo!: `ordenes`, `perfiles`, `prestaciones`, `chat_*`, etc. se crearon por dashboard y NO tienen migración — hay que dumpear el schema actual para migrar).
- **Gaby** desarrolla en `dev/gaby` desde otra máquina (facturación/asistente). Nuestro trabajo es aditivo; rebasar sobre `dev/gaby` antes de Fase 2 si avanzó.
- Pendientes menores: `npm run lint` roto (migrar a ESLint CLI), plantilla HSM para recordatorios proactivos de turnos (Fase 2 la va a necesitar para "bot escribe primero"), panel/UI de recetas para el médico (Fase 3), super-admin (Fase 3).

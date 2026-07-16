# Handoff — Pagos con MercadoPago en MediCuenta

**Fecha:** 2026-07-16 · **Rama:** `feat/pagos-mp` (3 commits locales, **sin pushear**)

> Para la próxima conversación: **Pieza A terminada**, arrancar la **Pieza B**.

---

## El encuadre: son DOS integraciones distintas

MercadoPago entra en MediCuenta por dos lados opuestos. No comparten casi nada:

| | **Pieza A — cobro de recetas** | **Pieza B — suscripción al SaaS** |
|---|---|---|
| ¿Quién cobra? | El **médico** al paciente | **MediCuenta** al médico |
| ¿A dónde va la plata? | A la cuenta del médico | A la cuenta de la plataforma |
| ¿Lleva OAuth? | **Sí** (token por médico) | **No** (token propio de MediCuenta) |
| API de MP | Checkout Pro (`/checkout/preferences`) | **`preapproval`** (suscripción recurrente) |
| Estado | ✅ **HECHO** | ⬜ **A HACER** |

---

## Pieza A — lo que se hizo (contexto, no hay que rehacerlo)

El cobro de recetas por WhatsApp **ya existía** en `main` (tabla `mp_conexiones` con tokens cifrados
AES-256-GCM, refresh automático, webhook con validación cross-tenant, Checkout Pro). Lo que **no
existía** era cómo *obtener* el token: se sembraba a mano con `scripts/seed-mp-conexion.mjs`, lo que
no escala. Era el *"Task 13, diferible"* del plan `2026-06-09-whatsapp-fase1-recetas.md`.

Se implementó el **OAuth**: el médico conecta con un clic desde `/consultorio/config` → Conexiones.

**Commits en `feat/pagos-mp`** (locales, sin pushear porque el jefe estaba tocando `main`):
- `df75904` feat(mp): OAuth conectar MercadoPago
- `27abf67` chore: `.gitignore` (`.env*`, lo agregó el CLI de Vercel)
- `abc1510` fix(ui): escalas de color de Tailwind — **no es de MP**, es un fix de Héctor de otra
  sesión (`bg-primary-500` no generaba CSS → botón de login invisible en modo claro). Se commiteó
  aparte a propósito.

**Archivos clave:** `src/lib/mercadopago/oauth.ts` (+test) · `src/app/api/mercadopago/oauth/` (route
+ callback) · `desconectarMercadoPago()` en `src/actions/consultorio-config.ts` · sección Conexiones
en `config-view.tsx` · `src/shared/components/ui/confirm-dialog.tsx` (nuevo, reutilizable).
**Spec y plan:** `docs/superpowers/specs/2026-07-13-mp-oauth-conectar-design.md` y
`docs/superpowers/plans/2026-07-13-mp-oauth-conectar.md`.

**Probado contra la API real de MP (sandbox):** conectar ✅ · token cifrado con refresh_token,
verificado contra `/users/me` ✅ · genera link de pago real ✅ · el webhook consulta un pago real con
ese token y **rechaza** correctamente uno de referencia ajena ✅ · desconectar ✅.
**Sin probar:** pago aprobado de una receta propia (el sandbox de MP lo bloquea: "Invalid users
involved" por API, y el checkout pide un código de email que a las cuentas `@testuser.com` nunca
llega) y la entrega del PDF por WhatsApp (necesita la config de Meta del jefe).

**Para producción, el jefe debe cargar en Vercel (Production) solo 3 vars:** `MP_CLIENT_ID`,
`MP_CLIENT_SECRET` (de **su** app MediCuenta → Credenciales de producción; el médico ve el NOMBRE de
la app al autorizar) y `MP_REDIRECT_URI` =
`https://medicuenta-v2.vercel.app/api/mercadopago/oauth/callback`, registrada idéntica en
Configuración de la app → Configuraciones avanzadas → URLs de redireccionamiento. **Sin PKCE** (la
implementación no manda `code_verifier`). ⚠ Verificar que `PUBLIC_BASE_URL` de producción sea el
dominio real y **no un túnel**: si apunta mal, el webhook no recibe los avisos y el paciente paga sin
que se entregue la receta.

---

## Pieza B — la suscripción al SaaS (lo que sigue)

**Objetivo:** que el médico le pague a MediCuenta con débito recurrente automático. Hoy el dueño
mueve `plan`/`estado` a mano desde el panel de superadmin.

### Lo que YA está construido (mucho más de lo que parece)

- **Tabla `suscripciones`** (`supabase/migrations/20260612_fase4_suscripciones.sql`), ya preparada
  para MP: `medico_id` (UNIQUE), `plan` (`basico|full`), `estado`
  (`prueba|activa|morosa|suspendida|baja`), `trial_ends_at`, **`mp_subscription_id`**,
  **`current_period_end`**. RLS: SELECT delegado (`puede_acceder_consultorio`), **sin INSERT/UPDATE**
  → lo escribe el superadmin por service-role *"y a futuro el webhook de MP"* (dice el comentario).
- **Candado por plan** (`src/lib/admin/planes.ts` +test): `TRIAL_DIAS = 15`, `PREFIJOS_FULL`,
  `puedeAcceder()`, `normalizarPlan()` (sin fila = básico). Enforcement en 3 capas (menú, middleware,
  server).
- **Alta manual** (`setSuscripcion` en `src/actions/superadmin.ts`): ya arranca los 15 días de prueba
  al pasar a `estado='prueba'`. El comentario dice literal: *"Hasta que entre MercadoPago (F4.3), el
  dueño maneja el plan/estado a mano"*.
- **Alertas de vencimiento de prueba** (`src/lib/admin/alertas.ts` +test) y **métricas de negocio /
  MRR** (`src/lib/admin/negocio.ts`, `costos.ts`). La tabla del panel ya muestra "vence en X días".

### Lo que FALTA (el alcance real de la Pieza B = F4.3)

1. **Cobro recurrente con la API `preapproval` de MP** — con el token de la cuenta de **MediCuenta**,
   no OAuth. Guardar el `mp_subscription_id` y el `current_period_end` en `suscripciones`.
2. **Webhook de suscripciones** — otro tipo de notificación que el de pagos
   (`/api/mercadopago/webhook` es de recetas; conviene una ruta aparte). Debe mover el `estado`:
   pago ok → `activa` + nuevo `current_period_end`; pago fallido → `morosa`; cancelación → `baja`.
   **Ojo:** la RLS de `suscripciones` no permite INSERT/UPDATE → el webhook escribe por service-role.
3. **Pantalla para el médico** — ver su plan, contratar, cambiar de plan, dar de baja.
4. **Transición de la prueba** — hoy `trial_ends_at` se calcula y se alerta, pero **nadie ejecuta el
   vencimiento**. Definir qué pasa a los 15 días (¿pasa a `morosa`? ¿`suspendida`? ¿el cron del
   orquestador lo hace?). Ya existe `src/app/api/cron/orquestador/route.ts`.

### Bloqueantes de NEGOCIO (no técnicos) — resolver ANTES de codear

- **Los precios no están cerrados.** El spec (`docs/superpowers/specs/2026-06-12-dashboard-dueno-superadmin.md`,
  **DD7**) dice Básico **US$ 25-30** y Full **US$ 55-65**, marcados *"a afinar con costos"*. MP
  Argentina cobra en **ARS** → hay que bajarlo a un monto concreto en pesos y decidir qué pasa con la
  inflación / actualización de precios.
- **Qué pasa al vencer la prueba** de 15 días (DD4). Sin definir.

### Decisiones ya tomadas (spec del dashboard del dueño, 2026-06-12)

- **DD1**: cobranza = **MercadoPago Suscripciones** (recurrente automático), reusa la integración MP.
- **DD2**: dos planes. **Básico** = facturación + asistente IA de facturación. **Full** = + todo el
  ecosistema del asistente de WhatsApp (agenda, conversaciones, pacientes, recetas, secretaria).
- **DD4**: prueba gratis 15 días.
- **DD7**: precios (rango, a afinar).

---

## Cosas prácticas que conviene saber

- **La base de Supabase es la REAL de producción** (`eylcrxhpccwobipcjzal`), con médicos y pacientes
  de verdad. Los scripts con service-role **no son sandbox**.
- **No regenerar `ENCRYPTION_KEY`**: descifra los tokens de MP ya guardados.
- **Usuario de prueba** (queda vivo, sin conexión MP ni recetas): `rcarrizomaximo@gmail.com` —
  médico, plan full, sin nodo de WhatsApp. La contraseña la tiene Héctor (no va en el repo).
- **No tocar `admin@medicuenta.com`**: tiene el token productivo real del jefe, sembrado a mano y
  **sin refresh_token**. Backup cifrado en `Documents/IA/backup-mp-conexiones-2026-07-14.json`.
- **`dev/gaby` está 313 commits atrás de `main`** y no tiene nada propio. No trabajar ahí.
- **Quedan 6 `window.confirm()`** en otras features (órdenes, débitos, liquidaciones, cirugías,
  turnos, bloqueos). Ya existe `ConfirmDialog` para migrarlos; sería su propio commit.
- **`npm run lint` está roto de antes** (`next lint` ya no existe en Next 16). Usar `npm run
  typecheck` y `npm test` (357 tests).

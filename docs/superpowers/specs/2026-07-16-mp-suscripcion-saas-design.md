# Suscripción al SaaS: el médico le paga a MediCuenta (F4.3)

**Fecha:** 2026-07-16
**Estado:** Diseño para aprobación
**Origen:** F4.3 del spec `2026-06-12-dashboard-dueno-superadmin.md` (DD1, DD2, DD4, DD7).
**Es la Pieza B** de MercadoPago. La Pieza A (el médico cobra al paciente, con OAuth) está hecha:
ver `2026-07-13-mp-oauth-conectar-design.md`. **No comparten nada** salvo el proveedor.

## 1. Contexto y objetivo

Hoy MediCuenta **no cobra**. El dueño mueve `plan`/`estado` a mano desde el panel de superadmin
(`setSuscripcion`), y el comentario en el código lo dice literal: *"Hasta que entre MercadoPago
(F4.3), el dueño maneja el plan/estado a mano"*.

**Objetivo:** que el médico contrate solo, pague con débito recurrente automático, y que dejar de
pagar tenga consecuencia — sin que el dueño toque nada.

### Tres agujeros que hay que tapar (descubiertos al mapear el terreno)

1. **El `estado` no canda nada.** `contexto.ts:72-77` lee `suscripciones` pero **solo selecciona
   `plan`**. El `estado` no se consulta nunca para permitir o negar acceso: se usa únicamente para
   las alertas del panel (`alertas.ts`) y las métricas de MRR (`negocio.ts`). Hoy un médico en
   `morosa`, `suspendida` o `baja` **entra exactamente igual** que uno al día. Sin esto, un webhook
   que mueva el estado no logra absolutamente nada.
2. **Nadie crea la prueba.** El onboarding del médico (`onboarding-medico.ts`,
   `20260616_onboard_medico.sql`) **no toca `suscripciones`**. Un médico nuevo queda **sin fila** →
   `normalizarPlan` lo trata como **básico, sin prueba y sin `trial_ends_at`**. La prueba solo
   arranca si el dueño le pone `estado='prueba'` a mano.
3. **El candado por plan está hardcodeado y `planes.ts` está a medio usar.** El enforcement real son
   4 `if (r.ctx.plan !== 'full') redirect('/dashboard')`, uno por página, más el menú
   (`sidebar.tsx:97`). **No hay capa de middleware** (`middleware.ts` solo refresca la sesión), y
   `puedeAcceder()` / `rutaEsFull()` son **código muerto**: definidas y testeadas, nunca llamadas.

## 2. Reglas de negocio (decididas por Héctor, 2026-07-16)

| # | Regla |
|---|---|
| R1 | Prueba de **14 días** (DD4 decía 15 → **cambia**), plan **Full**, **sin pedir tarjeta**. |
| R2 | La prueba se crea **sola al dar de alta al médico**. |
| R3 | Días 1–10: aviso **pasivo** *"Te quedan X días de prueba"*. Últimos ~4: **modal centrado** e insistente, *"¡Últimos X días! Pagá para no perder tus funcionalidades premium"*. |
| R4 | **Día 15 sin pagar → bloqueo total** hasta contratar. |
| R5 | Cobro rechazado de un médico activo → **`morosa`** (entra, con aviso) mientras **MP reintenta**. Agotados los reintentos → **`suspendida`** (bloqueo). |
| R6 | Precio **fijo en ARS**, **actualizable**. Los montos se cargan después (parametrizables). |

**Consecuencia buena de R1:** al no pedir tarjeta por adelantado, **no usamos `free_trial` de MP**.
La prueba es 100% nuestra (`trial_ends_at`) y el `preapproval` se crea **recién cuando el médico
decide pagar**.

Y no es solo elegante — es la **única puerta abierta**: `free_trial` es parámetro de
**`preapproval_plan`**, no de `preapproval`. Usarlo obligaría a suscripción **con plan asociado**,
que a su vez **exige `card_token_id` + `status: 'authorized'`**: tendríamos que tokenizar la tarjeta
nosotros con Checkout API/Bricks — justo lo que R1 dice que no hagamos. La rama
**sin plan + `status: 'pending'` + redirect a `init_point`** es la que no pide tarjeta. R1 y la API
empujan para el mismo lado.

> ⚠️ **El precio tiene un costo que todavía no está en la cuenta.** MP Argentina cobra
> **6,29% + IVA por suscripción** con acreditación al instante (1,49% a 35 días), vigente desde
> 07/2025. Sobre un Básico de ~US$25 son ~US$1,6/médico/mes que no entran. **Confirmar la tarifa
> real de la cuenta de MediCuenta antes de fijar los montos de R6/D10** — la comisión varía por
> cuenta y por antigüedad.

## 3. Alcance

**Entra:**
- Crear la suscripción de prueba (14d, Full) al alta del médico.
- **Candado por estado**, centralizado (hoy no existe).
- Avisos de prueba: banner pasivo + modal insistente.
- Pantalla del médico: ver su plan, **contratar**, **cambiar de plan**, **dar de baja**.
- Pantalla de bloqueo (prueba vencida / suspendida) con salida a contratar.
- Integración `preapproval`: crear, actualizar monto, cancelar.
- **Webhook de suscripciones** (ruta aparte) + idempotencia.
- Cron: reconciliar pruebas vencidas.
- Precio editable desde el panel de superadmin.

**No entra (otro spec):**
- Facturación fiscal / AFIP de la suscripción (MediCuenta al médico).
- Cupones, descuentos, precios por médico.
- Prorrateo al cambiar de plan a mitad de ciclo (ver D5).
- Sincronizar el precio de las suscripciones **ya vivas** al actualizarlo (ver D6).
- Migrar a los médicos existentes a cobro real (ver D7).

## 4. Máquina de estados

`suscripciones.estado` ya existe con los 5 valores. Le damos semántica de acceso:

| Estado | Acceso | Cómo se llega |
|---|---|---|
| `prueba` | **Total** (Full) + aviso escalonado | Alta del médico (R2) |
| `activa` | **Total** según `plan` | preapproval → `authorized`, o cobro aprobado |
| `morosa` | **Total** + aviso rojo | Cuota en `recycling` (MP reintentando) |
| `suspendida` | **Bloqueado** | Prueba vencida (R4) · reintentos agotados (R5) |
| `baja` | **Bloqueado** | El médico canceló, o MP canceló la suscripción |

```
alta ──> prueba ──(14d sin pagar)──> suspendida ──(contrata)──> activa
           │                              ▲                       │
           └──────(contrata)──────────────┼───────────────────────┤
                                          │                       │
                       (reintentos agotados)                (cobro falla)
                                          │                       ▼
                                          └──────────────────── morosa
                                                                  │
                                              (cobro OK) ─────────┘ ──> activa
activa/morosa ──(el médico da de baja, o MP cancela)──> baja
```

**Mapeo desde MP** (nombres exactos verificados contra la doc, ver §9):

| Señal de MP | Nuestro estado |
|---|---|
| `preapproval.status = authorized` | `activa` |
| `authorized_payment.status = processed` **Y** `payment.status = approved` | `activa` + `current_period_end` |
| `authorized_payment.status = recycling` | `morosa` |
| `authorized_payment.status = processed` **Y** `payment.status ≠ approved` | `suspendida` |
| `preapproval.status = paused` | `morosa` |
| `preapproval.status = canceled`/`cancelled` | `baja` |

> 🔴 **La trampa más importante de MP:** `processed` significa *"cobrado **o** reintentos agotados"*
> — es el estado terminal **tanto del éxito como del fracaso**. Habilitar acceso con
> `status === 'processed'` a secas le regala el sistema a todo el que no pague. **Siempre**
> `processed && payment.status === 'approved'`.

## 5. El candado por estado (el corazón de todo)

**D1 — Se evalúa en vivo, no se delega al cron.** El cron corre 1×/día: si el bloqueo dependiera de
que el cron mueva `prueba → suspendida`, habría hasta **24 h de acceso gratis** después de vencida
la prueba. Entonces el candado compara `trial_ends_at` contra `now()` **en cada request**, y el cron
queda como reconciliación + notificación, no como enforcement.

Función pura nueva en `src/lib/admin/planes.ts` (+ tests), que **reemplaza el código muerto**:

```ts
export type EstadoSuscripcion = 'prueba' | 'activa' | 'morosa' | 'suspendida' | 'baja'

export type Acceso =
  | { acceso: 'total' }
  | { acceso: 'aviso'; motivo: 'trial_pasivo' | 'trial_urgente' | 'morosa'; diasRestantes: number }
  | { acceso: 'bloqueado'; motivo: 'prueba_vencida' | 'suspendida' | 'baja' }

export function resolverAcceso(sub: {...}, pathname: string, nowMs: number): Acceso
```

Umbrales: `TRIAL_DIAS = 14` (era 15) · `TRIAL_AVISO_URGENTE_DIAS = 4` (R3).

**D2 — El candado va en el MIDDLEWARE, no en las páginas.** (Corregido 2026-07-16 tras mapear el
código: la primera versión de este spec decía "se centraliza en `resolverConsultorio()`" y **estaba
mal**.)

Los números: de las **26 páginas** de `(main)`, **solo 5** llaman a `resolverConsultorio()` — las 4
de Full y el layout. Las otras **22 no lo llaman nunca**: `dashboard`, `ordenes`, `liquidaciones`,
`debitos`, `cirugias`, `nomenclador`, `reportes`, `perfil`, `asistente`. O sea **todo el núcleo de
facturación**, que es exactamente lo que vende el plan Básico. Centralizar ahí dejaría a un médico
suspendido facturando sin pagar.

Tampoco sirve `(main)/layout.tsx`: en el App Router los layouts **no se re-ejecutan** en navegación
del lado del cliente (partial rendering) → el bloqueo solo dispararía en la carga inicial.

**El único chokepoint real es el middleware** (`src/lib/supabase/proxy.ts`), que ya corre en cada
request y ya hace exactamente esto para **auth** y **rol** — el rol lo saca del claim del JWT
(*"cero query a la DB por request"*). Le falta **plan y estado**.

| Caso | Dónde se resuelve |
|---|---|
| **Médico** (rol del claim) | **Middleware**: 1 query a `suscripciones` por `medico_id = user.id`. Cubre las 26 páginas. |
| **Secretaria** | En las 4 páginas Full vía `resolverConsultorio()` (que ya carga la suscripción del médico activo). El guard de rol del middleware ya la limita a esas rutas. |

**Costo:** +1 roundtrip a Supabase por request del médico. Se acepta por simplicidad y frescura.
**Optimización posible más adelante** (no en fase 1): meter `estado`+`trial_ends_at` en el claim del
JWT como ya se hace con el rol → cero queries. Tiene un problema serio a resolver antes: el claim
queda viejo hasta que refresque el token, y eso cae para el lado malo (**el médico paga y sigue
bloqueado ~1 h**). Habría que forzar `refreshSession()` al volver del checkout.

`puedeAcceder`/`rutaEsFull` dejan de ser código muerto: las usa el middleware.

`contexto.ts` pasa a seleccionar `plan, estado, trial_ends_at, current_period_end` (hoy solo `plan`).

> ⚠️ `layout.tsx:24` hace `plan={ctx?.plan ?? 'full'}` — **falla abierto** a Full si no hay contexto.
> Se corrige a `'basico'` de paso.

## 6. Modelo de datos

Migración nueva `20260716_f43_suscripcion_mp.sql`:

1. **`precios_planes`** (R6): `plan` PK (`basico|full`), `monto_ars` numeric
   **`CHECK (monto_ars >= 100)`** (mínimo duro de MP, §9), `updated_at`. Seed con montos placeholder
   + `NOT NULL`. Editable por superadmin (service-role). RLS: SELECT para authenticated (el médico
   ve el precio antes de contratar), sin INSERT/UPDATE.
2. **`suscripciones`**: agregar `mp_preapproval_status` text, `ultimo_evento_mp` timestamptz.
   `mp_subscription_id` y `current_period_end` **ya existen**. Índice en `mp_subscription_id`
   (el webhook busca por ahí).
3. **`mp_eventos_suscripcion`** (idempotencia, §9): `id` (el id del evento/authorized_payment),
   `tipo`, `procesado_at`. PK evita reprocesar.
4. **Alta del médico crea la prueba** (R2): en `20260616_onboard_medico.sql` / `onboarding-medico.ts`
   → INSERT `suscripciones (medico_id, plan='full', estado='prueba', trial_ends_at=now()+14d)`.

**RLS:** `suscripciones` sigue **sin INSERT/UPDATE** por RLS → el webhook y el alta escriben por
**service-role**, como ya anticipaba el comentario de la migración original.

## 7. Flujo end-to-end (contratar)

1. Médico en `prueba` (o `suspendida`) → `/plan` → ve su estado, los dos planes y el precio en ARS.
2. Clic **Contratar** → server action:
   - Lee `precios_planes`, arma el body y hace `POST /preapproval` con el token **de MediCuenta**
     (no OAuth), **sin plan asociado**, `status: 'pending'`, `payer_email` = **el email de su cuenta
     de MP** (ver **D11** — no necesariamente el de MediCuenta),
     `external_reference` = `suscripcion:<medico_id>`, `auto_recurring: {frequency: 1,
     frequency_type: 'months', transaction_amount, currency_id: 'ARS'}`, `back_url` → `/plan?sub=ok`.
     **Sin `start_date`/`end_date`** (§9).
   - Guarda `mp_subscription_id` y redirige al `init_point`.
3. El médico pone su tarjeta **en MercadoPago** (nunca la vemos). MP valida la tarjeta con un cobro
   mínimo que después devuelve.
4. MP pasa el preapproval a `authorized` → webhook `subscription_preapproval` → `estado='activa'`.
5. **~1 h después** MP hace el primer cobro real → webhook `subscription_authorized_payment` →
   si `processed && approved` → confirma `activa` + `current_period_end`.
6. Cada mes se repite el paso 5. Si falla: `recycling` → `morosa` (R5).

**D3 — Damos acceso en `authorized`, sin esperar el primer cobro.** MP ya validó la tarjeta con un
cobro real; esperar 1 h dejaría al médico pagando y bloqueado. Riesgo: quien autorice una tarjeta
que después rebote tiene acceso durante la ventana de reintentos (~10 días). Aceptable — son
médicos identificados, no anónimos de internet.

**Dar de baja:** `PUT /preapproval/{id}` con `status: 'cancelled'` → `estado='baja'`.
⚠️ **En MP es irreversible**: para volver hay que crear un preapproval nuevo. La UI lo advierte.

**Cambiar de plan:** cancelar + crear uno nuevo (MP no deja cambiar `frequency` por PUT, y el
`transaction_amount` sí, pero mezclar plan y monto en una sub viva es frágil). Ver D5.

## 8. La UI

| Estado | Qué ve el médico |
|---|---|
| `prueba`, ≥5 días | **Banner pasivo** arriba, descartable: *"Te quedan X días de prueba"* + link a `/plan`. (R3) |
| `prueba`, ≤4 días | **Modal centrado**, chico, **1×/día** (cookie con la fecha): *"¡Últimos X días de prueba gratuitos! Pagá para no perder tus funcionalidades premium"* + **[Ver planes]**. Descartable. (R3) |
| `morosa` | Banner **rojo** permanente, no descartable: *"No pudimos cobrar tu suscripción. Actualizá tu medio de pago"*. Entra igual. (R5) |
| `suspendida` / `baja` | **Bloqueo**: solo `/plan` (y logout). Todo lo demás redirige ahí. (R4) |

**D4 — El modal 1×/día, no 1×/request.** Un modal en cada navegación es intolerable; uno por día es
insistente sin ser hostil. Cookie `trial_modal_visto=<YYYY-MM-DD>`.

Se reusa `ConfirmDialog` (`src/shared/components/ui/confirm-dialog.tsx`, creado en la Pieza A) donde
aplique.

## 9. Integración MP — lo verificado y lo que hay que probar

Verificado contra la doc oficial (truco: agregar `.md` a la URL de reference devuelve el markdown
crudo; las páginas renderizadas hacen alucinar enums).

**Endpoints:** `POST /preapproval` · `GET /preapproval/{id}` · `PUT /preapproval/{id}` ·
`GET /authorized_payments/{id}`.

**Reintentos de MP** (confirmado, R5): cuota rechazada → `recycling`; **hasta 4 reintentos en una
ventana de 10 días**; agotados → `processed` + pago rechazado. Tras **3 cuotas** rechazadas **MP da
de baja la suscripción sola**.
→ **Decisión:** cortamos en **reintentos agotados de una cuota** (~10 días), **no** esperamos las 3
cuotas de MP: serían ~3 meses de acceso gratis. Eso es exactamente lo que pidió R5.

**Firma `x-signature`** (confirmado): manifest `id:<data.id EN MINÚSCULAS>;request-id:<x-request-id>;ts:<ts>;`
(ojo el `;` final), HMAC-SHA256 hex, secret del panel de MP → comparar en **constant-time** con `v1`.
Los ids de preapproval son alfanuméricos, así que el lowercase **sí importa** acá (en payments no).
Nueva `src/lib/mercadopago/firma.ts` (+tests).

> El webhook de recetas (Pieza A) **no valida firma**: se defiende re-consultando el pago a MP y
> comparando `collector_id`. Acá hacemos **las dos cosas** — firma **y** re-consulta — porque un
> evento de suscripción falsificado escribe directo sobre el acceso al sistema.

**Idempotencia (obligatoria):** hay que activar el topic `payment` **además** de los de suscripción
→ **el mismo cobro llega duplicado por dos vías**. De ahí `mp_eventos_suscripcion`.

### Restricciones duras de MP (confirmadas — condicionan el diseño)

| Restricción | Consecuencia para nosotros |
|---|---|
| 🔴 **`payer_email` se valida contra el email real del pagador**: *"we validate during the payment process that the entered email matches the payer's email. **If the email addresses don't match, the payment will be rejected**"*. | Ver **D11**. Es el riesgo de soporte #1. |
| **Monto mínimo de pago con tarjeta: $100 ARS** (mín. por cuota). El mínimo de cobro del vendedor es $15, pero el del pagador manda. | `precios_planes.monto_ars` con `CHECK (monto_ars >= 100)`. Los ejemplos oficiales usan `transaction_amount: 10` → **no copiarlos**. |
| **`back_url`, `reason` y `external_reference` son obligatorios sin plan** (la reference los marca "optional" en el tipo, pero el texto los exige). | Ya están los tres en §7. |
| **`start_date` sin `end_date` se ignora en silencio.** | No mandamos ninguno de los dos: la sub arranca al autorizar y no vence. |
| **La primera cuota se cobra ~1 h después** de crear la suscripción. | Sostiene **D3** (dar acceso en `authorized`, sin esperar el cobro). |
| **MP cancela la sub sola tras 3 cuotas rechazadas** y solo avisa por email al vendedor. | Escuchamos `subscription_preapproval` para enterarnos; no lo inferimos. |

### Cómo se prueba esto (no es como la Pieza A)

- 🔴 **Las credenciales `TEST-` NO sirven para Suscripciones.** MP solo las soporta en Checkout API
  y Bricks: *"Test credentials are only available for Checkout API and Checkout Bricks
  integrations"*. Hay que usar el **access token de producción (`APP_USR-…`) de una cuenta de prueba
  vendedor**.
- **No existe `sandbox_init_point`** en preapproval (el SDK de Go tiene el campo, pero la reference
  no lo documenta y no está confirmado que la API lo devuelva). Se usa `init_point` a secas.
- Cuentas de prueba: se crean desde el panel, **máx. 15, no se borran**, vendedor y comprador **del
  mismo país**. Tarjeta AR: Mastercard `5031 7557 3453 0604`, CVV `123`, `11/30`, titular **`APRO`**,
  DNI `12345678`.
- **`payer_email` debe ser el de la cuenta de prueba COMPRADOR**, o el checkout falla con un error
  poco descriptivo.
- ⚠️ **La base de Supabase es la REAL de producción.** Las pruebas de suscripción se hacen con el
  usuario `rcarrizomaximo@gmail.com`, **nunca** con `admin@medicuenta.com`.

**A verificar empíricamente antes de construir encima** (la doc de MP se contradice a sí misma):
- **D8**: `canceled` (1 L, dice la reference) vs `cancelled` (2 L, usan los SDK). **Aceptar ambos al leer.**
- **D9**: `notification_url` **no existe** en el body de `POST /preapproval` según la reference y el
  SDK, pero la doc de webhooks dice que para Suscripciones *no* se use el panel. Contradictorio.
  → Configurar en el panel **y** probar mandando `notification_url`; ver cuál dispara de verdad.
- Tipos inconsistentes: `transaction_amount` aparece como number y como string según la fuente;
  `type`/`status`/`status_detail` son **conjuntos abiertos**. Parsear defensivo, no romper con
  valores desconocidos.
- El **monto exacto del cobro de validación de tarjeta** en ARS (MP lo cobra y lo devuelve).

## 10. Seguridad

| Riesgo | Mitigación |
|---|---|
| Webhook falsificado que activa una suscripción gratis | Firma `x-signature` (constant-time) **+** re-consulta a MP. Nunca se confía en el body. |
| Evento duplicado que corre `current_period_end` de más | `mp_eventos_suscripcion` (PK por id de evento). |
| Escritura cross-tenant | El webhook resuelve el médico por `mp_subscription_id` / `external_reference`, **nunca** por un id del querystring. |
| Un médico activando su propia suscripción | `suscripciones` no tiene INSERT/UPDATE por RLS; solo service-role. La server action de contratar valida `auth.uid()`. |
| Acceso gratis con tarjeta que rebota | Acotado a la ventana de reintentos (~10 días), después `suspendida` (D3/R5). |
| Token de MediCuenta filtrado | `MP_PLATAFORMA_ACCESS_TOKEN` solo server-side. **No** va a `mp_conexiones` (esa tabla es de los médicos). |

## 11. Configuración externa

| Variable | Para qué |
|---|---|
| `MP_PLATAFORMA_ACCESS_TOKEN` | Token de la cuenta MP **de MediCuenta**. Cobra la plataforma. **Nuevo.** |
| `MP_WEBHOOK_SECRET` | Clave secreta de la firma (panel MP → Webhooks). **Nuevo.** |
| `CRON_SECRET` | Ya existe (cron del orquestador). |

Los precios **no** son env: viven en `precios_planes` para que el dueño los edite sin redeploy (R6).

## 12. Decisiones abiertas (necesitan tu OK)

- **D5 — Cambio de plan a mitad de ciclo.** Propuesta v1: cancelar + crear nuevo, **sin prorrateo**
  (el ciclo nuevo arranca de cero). Simple y honesto si se avisa. Prorratear es bastante más código.
- **D6 — Al subir el precio, ¿qué pasa con los que ya pagan?** Propuesta v1: **no se tocan**
  (quedan con el precio viejo); el nuevo precio aplica a los que contraten desde ahí. Sincronizarlos
  con `PUT /preapproval` es posible pero **no está confirmado si MP exige que el médico
  re-autorice** — hay que probarlo antes de prometerlo.
- **D7 — Los médicos que ya existen.** La migración de F4.2 los sembró a todos en `full`/`activa`,
  **sin `mp_subscription_id`**, y son médicos **reales de producción**. Con el candado nuevo siguen
  entrando (están `activa`), o sea: **acceso gratis indefinido**. Propuesta: dejarlos así
  (grandfathering de los primeros) y decidir su migración aparte, cuando el precio esté cerrado.
- **D10 — Los montos en ARS.** Pendientes (R6). No bloquean el desarrollo: se construye con
  `precios_planes` y los cargás cuando los cierres. **Pero acordate de descontar el ~6,29% + IVA de
  comisión de MP** (§2) y de que el piso duro es **$100 ARS**.
- **D11 — El email del pagador.** MP **rechaza el pago si el `payer_email` no coincide con el email
  con el que el médico paga**. Si mandamos su email de MediCuenta y él tiene MP con otro (muy
  probable: cuenta personal vieja), le rebota con un error que no explica nada, y la queja nos llega
  a nosotros. Tres salidas:
  1. **Preguntarle el email de MP al contratar** (campo aparte, precargado con el de MediCuenta y
     editable, con una nota de "tiene que ser el de tu cuenta de Mercado Pago"). ← **propuesta**
  2. Mandar el de MediCuenta y bancarse los rebotes.
  3. Obligar a que el email de MediCuenta sea el de MP (fricción en el onboarding).

## 13. Fases propuestas

| Fase | Qué | Por qué en este orden |
|---|---|---|
| **1** | Candado por estado + `resolverAcceso` + `contexto.ts` + guards + fix del fail-open | Sin esto, **nada** de lo demás tiene efecto. Es autónomo y testeable solo. |
| **2** | Prueba al alta (R2) + migración + `TRIAL_DIAS=14` + cron de reconciliación | Cierra el ciclo de vida de la prueba sin tocar MP todavía. |
| **3** | Avisos: banner pasivo + modal urgente + pantalla de bloqueo (R3/R4) | Ya hay estados reales que mostrar. |
| **4** | `preapproval`: lib + firma + contratar + `/plan` + baja | Recién acá entra MP. |
| **5** | Webhook + idempotencia + `precios_planes` en el panel | Cierra el lazo automático. |

Fases 1–3 **no dependen de MP** ni del precio → se puede avanzar hoy mismo.

## 14. Criterio de terminado

- Un médico nuevo arranca con 14 días de Full sin poner tarjeta.
- A los 5+ días ve un banner; a los ≤4, un modal 1×/día.
- El día 15 sin pagar **no entra** a ningún lado salvo `/plan`.
- Contrata desde `/plan`, pone la tarjeta en MP y **al volver ya tiene acceso**.
- Un cobro rechazado lo deja **entrando con aviso rojo**; agotados los reintentos de MP, **afuera**.
- Da de baja y queda bloqueado; los datos siguen intactos.
- El dueño cambia el precio desde el panel **sin deploy**, y el próximo que contrate paga el nuevo.
- Un webhook con firma inválida **no cambia ningún estado**. Uno duplicado **no corre el período**.
- El dueño **no toca `setSuscripcion` a mano** para un alta normal.

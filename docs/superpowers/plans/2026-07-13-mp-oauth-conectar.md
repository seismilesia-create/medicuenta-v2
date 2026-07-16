# Plan — Conectar MercadoPago por link (OAuth del médico)

**Spec:** `docs/superpowers/specs/2026-07-13-mp-oauth-conectar-design.md`
**Rama:** `feat/pagos-mp`
**Goal:** El médico conecta su cuenta de MercadoPago con un clic desde `/consultorio/config`.
Reemplaza el sembrado manual de tokens (`scripts/seed-mp-conexion.mjs`).

**Tech:** Next.js 16 route handlers (`runtime = 'nodejs'`) · OAuth2 de MercadoPago ·
`@/lib/crypto/encryption` (AES-256-GCM) · Supabase con **cliente de sesión** (RLS) · vitest.

## Prerrequisitos externos (bloquean el *probar*, no el *escribir*)

1. **App en MercadoPago** (Developers → Tus integraciones → Checkout Pro). Se puede usar una
   **app de desarrollo propia**; no interfiere con el código (todo sale de env vars). Para
   producción hay que usar la app del negocio: el médico ve el **nombre de la app** al autorizar.
2. `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_REDIRECT_URI` en `.env.local` y en Vercel
   (**Preview → rama `feat/pagos-mp`**, que hoy no tiene ninguna env cargada).
3. `ENCRYPTION_KEY` y `SUPABASE_SERVICE_ROLE_KEY`: existen en Vercel (Encrypted, no se pueden
   descargar) → sacarlas del dashboard o pedírselas al dueño. **No regenerar `ENCRYPTION_KEY`.**
4. La **Redirect URI** cargada en el panel de MP debe ser idéntica a `MP_REDIRECT_URI`:
   `https://medicuenta-v2-git-feat-pagos-mp-seismilesia-creates-projects.vercel.app/api/mercadopago/oauth/callback`
   (o la de producción al mergear). MP exige **HTTPS**: localhost no sirve.

## Decisiones de implementación

- El callback escribe con el **cliente de sesión** (no service-role): la RLS de `mp_conexiones`
  (`auth.uid() = medico_id`) es la que garantiza que nadie escriba la conexión de otro.
- `state` anti-CSRF en cookie `HttpOnly` + `Secure` + `SameSite=Lax`, TTL 10 min, comparado en el
  callback. Sin match → 400 y no se guarda nada.
- `upsert` por `medico_id`: conectar por segunda vez (caso `reconectar`) **pisa** la fila y vuelve
  a `estado='conectado'`.
- El `mp_user_id` sale de la respuesta del `oauth/token` (campo `user_id`), no de `/users/me`:
  es la fuente que MP asocia al token y la que valida `decidirAccionPago`.
- Nunca loguear `code`, `access_token` ni `refresh_token` (ni en error).
- Sin `UNIQUE(mp_user_id)` por ahora (spec §4, D1): en pruebas una sola cuenta MP puede quedar
  atada a más de un médico.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/mercadopago/oauth.ts` (+test) | **Puro/testeable**: `buildAuthorizationUrl`, `parseTokenResponse` (valida y mapea la respuesta de `oauth/token`), `intercambiarCode` (fetch). |
| `src/app/api/mercadopago/oauth/route.ts` | Inicia el flujo: exige sesión, setea cookie `state`, redirige a MP. |
| `src/app/api/mercadopago/oauth/callback/route.ts` | Valida sesión + `state`, canja el `code`, guarda cifrado, redirige a la config con `?mp=ok|error`. |
| `src/actions/consultorio-config.ts` (modificar) | + `desconectarMercadoPago()` (borra la fila; RLS la ata al médico). |
| `src/features/consultorio/services/panelService.ts` (modificar) | `getConfig` → `conexiones.mercadopago` pasa de `boolean` a `{ estado, mpUserId } \| null` (hoy solo trae `id` y filtra `estado='conectado'`, así que el estado `reconectar` es **invisible**). |
| `src/features/consultorio/components/config/config-view.tsx` (modificar) | Sección **Conexiones**: botón Conectar / Reconectar / Desconectar + banner de resultado (`?mp=`). |
| `.env.local.example` (modificar) | Documentar `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_REDIRECT_URI`, `ENCRYPTION_KEY`. |

---

## Task 1: `oauth.ts` — lógica pura + canje (TDD)

**Files:** `src/lib/mercadopago/oauth.ts`, `src/lib/mercadopago/oauth.test.ts`

- [ ] `buildAuthorizationUrl({ clientId, redirectUri, state })` → URL de
      `https://auth.mercadopago.com.ar/authorization` con `client_id`, `response_type=code`,
      `platform_id=mp`, `state`, `redirect_uri`.
- [ ] `parseTokenResponse(json)` → `{ accessToken, refreshToken, mpUserId, expiresAt } | null`.
      Devuelve `null` si falta `access_token` o `user_id` (no confiar en la forma de la respuesta).
- [ ] `intercambiarCode({ clientId, clientSecret, code, redirectUri })` → POST a
      `https://api.mercadopago.com/oauth/token` con `grant_type=authorization_code`.
      En error: loguear **status**, jamás el body (puede traer el token).
- [ ] Tests: URL bien formada · respuesta válida → objeto · respuesta sin `user_id` → `null` ·
      `expires_in` → `expiresAt` correcto.

## Task 2: `GET /api/mercadopago/oauth` — iniciar

**Files:** `src/app/api/mercadopago/oauth/route.ts`

- [ ] `runtime = 'nodejs'`. Sesión con `createClient()` de `@/lib/supabase/server`; sin usuario → 401.
- [ ] Sin `MP_CLIENT_ID`/`MP_REDIRECT_URI` → redirigir a `/consultorio/config?mp=error&motivo=config`
      (no un 500 crudo: el médico no tiene que ver un stacktrace).
- [ ] `state = randomBytes(16).toString('hex')` → cookie `mp_oauth_state` (`HttpOnly`, `Secure`,
      `SameSite=Lax`, `Path=/`, `Max-Age=600`) + 302 a `buildAuthorizationUrl(...)`.

## Task 3: `GET /api/mercadopago/oauth/callback` — canjear y guardar

**Files:** `src/app/api/mercadopago/oauth/callback/route.ts`

- [ ] Sesión obligatoria (sin usuario → `/login`).
- [ ] Si MP volvió con `error` en la query → `?mp=error&motivo=denegado` (el médico canceló).
- [ ] `state` de la query vs cookie: distinto/ausente → **400**, no se escribe nada. Borrar la
      cookie en todos los caminos.
- [ ] `intercambiarCode` → `parseTokenResponse`; si `null` → `?mp=error&motivo=canje`.
- [ ] `upsert` en `mp_conexiones` (`onConflict: 'medico_id'`) con `access_token_cifrado`,
      `refresh_token_cifrado`, `expires_at`, `mp_user_id`, `estado: 'conectado'`, `updated_at`.
- [ ] Éxito → 302 a `/consultorio/config?mp=ok`.

## Task 4: `desconectarMercadoPago` (server action)

**Files:** `src/actions/consultorio-config.ts`

- [ ] `'use server'`, sesión obligatoria, `delete from mp_conexiones where medico_id = auth.uid()`
      (RLS lo cubre igual), `revalidatePath('/consultorio/config')`.
- [ ] Nota: **no** revoca el permiso del lado de MP (eso lo hace el médico desde su cuenta).

## Task 5: Estado real en el panel

**Files:** `panelService.ts`, `config-view.tsx`

- [ ] `getConfig`: la query de `mp_conexiones` hoy filtra `estado='conectado'` → **cambiarla** para
      traer `estado, mp_user_id` sin filtro, y exponer `conexiones.mercadopago` como
      `{ estado: 'conectado' | 'reconectar', mpUserId } | null`. Sin esto, `reconectar` se ve
      igual que "sin conectar" y el médico no entiende por qué no cobra.
- [ ] Ajustar el `ConfigConsultorio` type y **todos** sus consumidores (hoy es `boolean`).
- [ ] `config-view.tsx` → sección **Conexiones** (spec §6): tres estados, con
      `<a href="/api/mercadopago/oauth">` para conectar/reconectar (navegación, no `fetch`: es un
      redirect a otro dominio) y un `<form action={desconectarMercadoPago}>` para desconectar.
- [ ] Banner con `?mp=ok` / `?mp=error&motivo=…` (leído con `useSearchParams`).
- [ ] Copy claro para el médico: *"Los pagos de las recetas van directo a tu cuenta de MercadoPago.
      MediCuenta no toca la plata."*

## Task 6: Verificación

- [ ] `npm run typecheck` + `npm run lint` + tests de `oauth.test.ts` verdes.
- [ ] `npm run build` limpio (el cambio de tipo de `conexiones.mercadopago` rompe consumidores).
- [ ] E2E en el preview de Vercel (requiere prerrequisitos): médico conecta con **cuenta de prueba**
      de MP → fila en `mp_conexiones` con `estado='conectado'` → el bot genera link de receta →
      pago con tarjeta de prueba → PDF entregado.
- [ ] Anti-CSRF: llamar al callback con un `state` inventado → 400 y **cero** filas nuevas.
- [ ] `mp_conexiones` sin tokens en claro; nada sensible en los logs de Vercel.

## Riesgos

- **`ENCRYPTION_KEY`**: si cambia, los tokens ya guardados quedan ilegibles. Hoy solo hay el token
  de prueba sembrado (se re-siembra y listo), pero con médicos reales conectados sería una
  desconexión masiva.
- **Redirect URI**: una sola por app y debe coincidir exacto. Al mergear a producción hay que
  cambiarla (o tener app de dev y app de prod separadas). Un mismatch da un error de MP opaco.
- **Cuenta de prueba obligatoria**: MP rechaza que la cuenta dueña de la app autorice a su propia
  app. Sin cuentas de prueba no se puede probar el flujo.
- **Preview sin env vars**: la rama `feat/pagos-mp` no tiene ninguna cargada en Vercel → el preview
  falla hasta que se carguen (`ENCRYPTION_KEY`, service-role, `MP_*`, WhatsApp).

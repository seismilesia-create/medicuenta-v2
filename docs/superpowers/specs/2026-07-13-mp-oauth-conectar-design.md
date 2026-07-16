# Conectar MercadoPago por link (OAuth del médico)

**Fecha:** 2026-07-13
**Estado:** Diseño para aprobación
**Origen:** Task 13 (diferido) del plan `2026-06-09-whatsapp-fase1-recetas.md`.

## 1. Contexto y objetivo

El cobro de recetas por WhatsApp **ya funciona**: el bot crea un link de pago de MercadoPago a
nombre del médico, el webhook confirma el pago y se entrega el PDF. Todo eso usa el token del
médico guardado en `mp_conexiones` (cifrado AES-256-GCM, con refresh automático).

Lo que **no existe** es la forma de *obtener* ese token. Hoy se siembra a mano con
`scripts/seed-mp-conexion.mjs` a partir de un Access Token de prueba. Eso sirvió para el E2E,
pero no escala: implicaría que cada médico nos pase su token, algo que ningún médico va (ni
debe) hacer — es la llave de su caja.

El agujero es visible en producción: la tool `cobrar_receta` ya responde *"El médico todavía no
tiene MercadoPago conectado. Avisale que debe conectarlo desde MediCuenta"*
(`agent/tools.ts:82`) y el panel muestra un ✓/✗ de MercadoPago en **Conexiones**
(`config-view.tsx:442`) **sin ningún botón para conectar**. La app promete una pantalla que no
existe.

**Objetivo:** que el médico conecte su cuenta de MercadoPago **con un clic**, desde la config de
su bot, sin compartir credenciales — y que pueda ver el estado, reconectar y desconectar.

## 2. Alcance

**Entra:**
- Botón "Conectar MercadoPago" en `/consultorio/config` → sección **Conexiones**.
- Flujo OAuth completo: autorización, callback, canje del `code`, guardado cifrado.
- Estados visibles: **conectado** (con la cuenta MP), **reconectar** (el refresh falló), **sin conectar**.
- Desconectar (borrar la conexión).

**No entra (otro spec):**
- **Suscripción al servicio** (el médico le paga a MediCuenta). Es la otra dirección del dinero:
  no lleva OAuth, usa la cuenta MP de la plataforma y la API `preapproval`. Ver `suscripciones`
  (F4.3) — se planifica aparte, y depende de que se cierre el precio (spec del dashboard, DD7).
- Split payments / comisión de MediCuenta sobre el cobro del médico.
- Revocar el permiso del lado de MercadoPago (el médico lo hace desde su cuenta MP).

## 3. Flujo end-to-end

1. El médico entra a `/consultorio/config` → **Conexiones** → ve "MercadoPago ✗ — Conectar".
2. Clic → `GET /api/mercadopago/oauth`. La ruta exige sesión, genera un `state` aleatorio, lo
   deja en una cookie `HttpOnly` (10 min) y redirige a `auth.mercadopago.com.ar/authorization`.
3. El médico se loguea **en MercadoPago** (nosotros nunca vemos su usuario ni su contraseña) y
   autoriza a la aplicación MediCuenta.
4. MP vuelve a `GET /api/mercadopago/oauth/callback?code=…&state=…`.
5. El callback: valida sesión, compara el `state` contra la cookie (anti-CSRF), canjea el `code`
   por `access_token` + `refresh_token` + `user_id` contra `oauth/token`.
6. Guarda (upsert por `medico_id`) en `mp_conexiones` con los tokens **cifrados**, `expires_at`
   y `estado='conectado'`. Si ya existía una conexión (caso *reconectar*), la pisa.
7. Redirige a `/consultorio/config?mp=ok` (o `?mp=error&motivo=…`), que muestra el resultado.

A partir de ahí, el cobro de recetas funciona solo: `getConexionActiva` ya descifra, refresca y
degrada a `reconectar` cuando corresponde.

## 4. Seguridad

| Riesgo | Mitigación |
|---|---|
| CSRF en el callback (que alguien ate *su* cuenta MP a la sesión de otro) | `state` aleatorio en cookie `HttpOnly`+`SameSite=Lax`, comparado en el callback. Sin match → 400, no se guarda nada. |
| Callback sin sesión | `auth.getUser()` en ambas rutas. La conexión se ata a `auth.uid()`, nunca a un id que venga por querystring. |
| Tokens en claro | `cifrar()` (AES-256-GCM) antes de tocar la DB. Nunca loguear el token ni el `code`. |
| Escritura cross-tenant | RLS de `mp_conexiones` ya exige `auth.uid() = medico_id`. El callback escribe con el cliente **de sesión**, no con service-role. |
| Pago que cae en la cuenta equivocada | Ya cubierto: `decidirAccionPago` valida `collector_id` contra `mp_user_id`. Este spec solo lo alimenta bien. |

**Decisión abierta (D1):** ¿dos médicos pueden conectar **la misma** cuenta de MercadoPago?
Hoy `mp_conexiones` tiene `UNIQUE(medico_id)` pero **no** sobre `mp_user_id`. En producción real
no debería pasar (cada médico su cuenta), pero en pruebas sí (una sola cuenta de test).
**Recomendación:** no agregar el UNIQUE todavía; el `collector_id` ya se valida por receta. Se
revisa si aparece el caso.

## 5. Configuración externa

| Variable | Para qué |
|---|---|
| `MP_CLIENT_ID` / `MP_CLIENT_SECRET` | Identifican a la **aplicación** MediCuenta ante MP (panel de MercadoPago Developers → Tus integraciones). |
| `MP_REDIRECT_URI` | URL exacta del callback. **Debe estar cargada en el panel de la app y coincidir carácter por carácter.** |
| `ENCRYPTION_KEY` | Ya existe (28d en Vercel). **No regenerar**: descifra los tokens ya guardados. |

**Gotchas de MercadoPago (verificar al probar):**
- MP exige **HTTPS** en la Redirect URI → `http://localhost:3000` no sirve. Se prueba en el
  preview de Vercel o con un túnel.
- **No se puede autorizar una app con la misma cuenta MP que la creó.** Para probar hacen falta
  las **cuentas de prueba** de MP (una hace de médico, otra de paciente).
- La app admite **una** Redirect URI → conviene una **app de desarrollo aparte** (client id/secret
  propios) para no pisar la de producción.

## 6. Estados en la UI (Conexiones)

| Estado en DB | Qué ve el médico |
|---|---|
| sin fila | ✗ MercadoPago — **[Conectar MercadoPago]** + una línea explicando que los pagos de las recetas van directo a su cuenta. |
| `conectado` | ✓ MercadoPago — cuenta `#<mp_user_id>` + **[Desconectar]**. |
| `reconectar` | ⚠ MercadoPago — "Se venció el permiso, el cobro de recetas está pausado" + **[Reconectar]**. |

## 7. Criterio de terminado

- El médico conecta su cuenta desde el panel, sin tocar un token.
- Tras conectar, `cobrar_receta` genera el link y el pago cae **en la cuenta del médico**.
- Un `state` manipulado o ausente no crea ninguna conexión.
- Ningún token ni `code` aparece en logs ni en la DB en claro.

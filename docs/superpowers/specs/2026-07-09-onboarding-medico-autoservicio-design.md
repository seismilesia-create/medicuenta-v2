# Onboarding de médicos por autoservicio (invitación por enlace) + auth robusto

**Fecha:** 2026-07-09
**Estado:** Diseño aprobado, pendiente de plan de implementación
**Autor:** Héctor + Claude

---

## 1. Problema

Hoy el alta de un médico la hace **solo** el superadmin desde `/admin/medicos/nuevo`
(`onboardMedico` en `src/actions/admin-medicos.ts`). El flujo depende de
`inviteUserByEmail` de Supabase: se manda un email con un token de un solo uso que
expira en 1 hora, el médico hace clic y cae en `/update-password`.

Ese flujo **se cuelga** por tres causas conocidas:

1. **Prefetch de Gmail/Outlook.** El proveedor de correo pre-carga el link para
   escanearlo y consume el token de un solo uso antes de que el médico haga clic.
   (Por esto ya existe la página `/activar` con POST, inmune al prefetch.)
2. **Emails de Auth poco confiables.** El sistema de emails propio de Supabase Auth
   tiene un tope bajo; si el SMTP de Resend no está bien conectado, los emails no salen.
3. **Sin feedback.** El médico no sabe si el mail llegó, si expiró o si debe reintentar.

Además, cambiar la contraseña "es todo un lío".

## 2. Objetivo

- Que un médico pueda **darse de alta solo** a través de un **enlace** que Héctor le
  envía por WhatsApp/email/el canal que sea.
- Que a través de ese enlace el médico complete **todos sus datos** y defina su
  **email + contraseña**, quedando operativo sin depender de un email frágil.
- Reforzar el **reset de contraseña** para que deje de colgarse.
- **No romper** el alta manual del superadmin, ni el cableado de nodos/slug/servicio,
  ni RLS/roles.

## 3. Alcance por fases (decisión de producto)

- **Fase actual (este spec):** modelo **"Héctor invita → el médico completa"**.
  Entrada controlada: solo entra quien recibió un enlace. Es lo que se implementa ahora.
- **Fase futura (NO en este spec, pero la arquitectura la habilita):** **enlace abierto
  + cola de aprobación** con **prueba de 14 días**, para producción con médicos nuevos.
  Se agrega sumando un estado `en_revision` y un origen de la solicitud, sin rehacer lo
  demás. Engancha con la Fase 5 (suscripciones) del roadmap.

## 4. Principio de diseño central

**Desacoplar la ENTREGA del enlace de la VERIFICACIÓN del email.**

Héctor conoce al médico y le manda el enlace por WhatsApp: ese canal **es** la confianza.
Por lo tanto:

- El enlace lleva **un token propio nuestro** (tabla `invitaciones_medico`), no el token
  de Supabase → controlamos expiración, un solo uso, reintentos y estados.
- El médico abre el enlace, carga sus datos **y define su contraseña ahí mismo**.
- La cuenta se crea con `admin.createUser({ email, password, email_confirm: true, ... })`
  vía service-role: **contraseña ya puesta, email ya confirmado, sin ningún email de por
  medio en el alta.** El médico termina el formulario y ya puede entrar.
- El único email que queda es el **reset de contraseña**, inevitable, blindado aparte.

Es el patrón de invite de equipo de Slack/Notion: el link te lleva directo a "poné tu
contraseña", sin un paso previo de "confirmá tu email" que es donde todo se traba.

## 5. Arquitectura

### 5.1 Tabla nueva: `invitaciones_medico`

Solo accesible por `service_role` (RLS activada sin policy para anon/authenticated,
igual que las tablas `wa_*`). Todo acceso público al token pasa por service-client en
route handlers/server actions.

| Columna            | Tipo          | Notas |
|--------------------|---------------|-------|
| `id`               | uuid PK       | `gen_random_uuid()` |
| `token`            | text UNIQUE   | aleatorio 256 bits url-safe (`base64url` de 32 bytes) |
| `estado`           | text          | `pendiente` / `completada` / `expirada` / `revocada`. (Futuro: `en_revision`) |
| `nombre_referencia`| text NULL     | opcional, solo para que Héctor identifique de quién es el enlace ("Dr. Moreno") |
| `expira_en`        | timestamptz   | default `now() + interval '72 hours'` |
| `creada_por`       | uuid          | superadmin que la generó (`auth.uid()`) |
| `medico_id`        | uuid NULL     | se llena al completar (= id del auth user creado) |
| `completada_en`    | timestamptz NULL | |
| `created_at`       | timestamptz   | default `now()` |

**Decisiones:**
- El `token` es un secreto; se genera en el servidor y nunca se deriva del `id`.
- La expiración es **soft**: al leer, si `estado='pendiente'` y `now() > expira_en`,
  se trata como expirada (y opcionalmente se marca). No hace falta un cron.
- **No** se guarda `categoria_arancel` ni `atiende_interior`: el médico entra con el
  tier básico por defecto (ver §5.4) y Héctor lo promueve después.

### 5.2 Generar la invitación (lado admin)

- En `/admin/medicos` (o su layout): botón **"Generar invitación"**.
- Server action nueva `generarInvitacionMedico(nombreReferencia?)` en
  `src/actions/admin-medicos.ts`:
  1. `requireSuperadmin()`.
  2. Genera `token` aleatorio (server-side, `crypto`).
  3. INSERT en `invitaciones_medico` (service-client) con `estado='pendiente'`,
     `expira_en = now()+72h`, `creada_por`.
  4. Devuelve la URL `${siteUrl()}/alta/${token}`.
- UI: muestra el **enlace copiable + QR** reutilizando el componente de QR ya presente
  en `FormNuevoMedico.tsx` (`qrcode`). Botón "Copiar".
- Lista de invitaciones (pendientes/usadas/expiradas) con acciones **Revocar**
  (`estado='revocada'`) y **Regenerar** (nueva fila, invalida la anterior).

### 5.3 Página pública `/alta/[token]`

- **Server component** (`src/app/alta/[token]/page.tsx`) que valida el token con
  service-client **antes** de renderizar:
  - Token inexistente / `revocada` / `completada` / vencido → pantalla clara:
    "Este enlace ya no es válido. Pedile uno nuevo a tu administrador." (no error genérico).
  - Token `pendiente` y vigente → renderiza el formulario (client component).
- **Formulario** (`src/features/onboarding/components/FormAltaMedico.tsx`): el médico carga
  `nombre`, `apellido`, `especialidad`, `matricula`, `cuit`, `telefono`, `email`,
  `password` (+ confirmación). Validación con **Zod** (email válido, contraseña fuerte,
  CUIT/matrícula con el mismo formato que ya usa el alta admin). Feedback inline de errores.

### 5.4 Completar la invitación (server action)

`completarInvitacionMedico(token, datos, password)` en un módulo nuevo
`src/actions/onboarding-medico.ts`:

1. Re-valida el token con service-client (estado `pendiente` + no vencido). Si no,
   error claro. **Toda la validación de estado es server-side**, nunca se confía en el cliente.
2. Valida `datos` + `password` con Zod (mismo schema que el form).
3. Crea la cuenta:
   `service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nombre, apellido, rol: 'medico', especialidad, matricula, cuit, telefono } })`.
   - `email_confirm: true` porque la confianza vino por el canal de Héctor.
   - El trigger `handle_new_user` crea el `perfiles` con `rol='medico'` (comportamiento actual).
4. Llama a la RPC existente **`onboard_medico_cablear`** con los datos del médico →
   engancha nodo con cupo + slug + servicio "Consulta" + campos de identidad.
   **Se reutiliza tal cual** (misma que usa `onboardMedico`).
5. Setea `categoria_arancel = 'medica'` (tier básico) y `atiende_interior = false`
   por defecto en `perfiles` (vía service-client, que está exento del trigger
   `proteger_columnas_admin_perfil`). Héctor lo promueve después desde
   `/admin/medicos/[id]/editar` (ya existe `actualizarMedico`).
   > Confirmado (Héctor, 2026-07-09): "básica" = `'medica'`; "full" = el tier real que
   > él asigna luego desde el dashboard.
6. Marca la invitación `estado='completada'`, `completada_en=now()`, `medico_id=<uid>`.
   Esto es **idempotente**: si el paso 3-4 ya ocurrió, no se recrea (ver §7).
7. **Inicia sesión automáticamente** (crea la sesión con las credenciales recién
   definidas) y redirige a `/dashboard`. Sin fricción de volver a loguearse.

### 5.5 Reset de contraseña robusto

Este flujo **requiere** email. Se blinda así:

- El template de **recovery** de Supabase apunta a una página **POST** tipo `/activar`
  (patrón ya existente, inmune al prefetch de Gmail), no a un GET que el prefetch pueda quemar.
- Los emails de Auth salen por **Resend SMTP**.
- **Pre-requisito de verificación (dentro del plan):** confirmar que el SMTP de Resend
  está realmente conectado en Supabase Auth (la memoria lo da por hecho desde 2026-06-16;
  el código no lo confirma porque es config del panel). Si no lo está, conectarlo es
  parte del trabajo.
- Revisar/unificar las páginas `forgot-password` / `update-password` / `activar` para que
  el reset use el mismo camino POST-blindado que el alta.

### 5.6 Lo que NO cambia

- `onboardMedico` (alta manual del superadmin) sigue igual, como camino alternativo.
- RLS, roles (`rol` / `es_superadmin`), middleware, y el cableado de nodos: se reutilizan.
- El trigger `proteger_columnas_admin_perfil` sigue protegiendo la escalada de privilegios;
  el default de arancel se setea vía service-role, que está exento.

## 6. Seguridad

- **Token:** 256 bits aleatorios, un solo uso, expira en 72h, revocable. No adivinable.
- **Estado server-side:** el alta solo procede si el token está `pendiente` y vigente,
  verificado en el servidor con service-client.
- **Contraseña fuerte** validada con Zod (longitud mínima + complejidad).
- **Rate limiting** en `/alta/[token]` y en `completarInvitacionMedico`: poco crítico
  ahora (token privado), pero **necesario** para la fase futura de enlace abierto. Se deja
  anotado como gancho, no se sobre-construye ahora (YAGNI).
- **`categoria_arancel` / `es_superadmin`** nunca los toca el médico: el form no los
  expone y el trigger de protección los bloquea para roles no-service.
- El médico solo puede crear **su propio** perfil de médico; no puede autoasignarse
  superadmin ni cambiar de tier.

## 7. Manejo de errores e idempotencia

- **Token vencido/usado/revocado:** pantalla clara con CTA "pedí un nuevo enlace".
- **Email ya registrado:** si el email ya existe como usuario, error claro
  ("ese email ya tiene cuenta, iniciá sesión o recuperá tu contraseña"), sin filtrar
  información sensible.
- **Fallo parcial (createUser OK pero RPC de cableado falla):** se reutiliza el patrón
  idempotente que ya existe (`reintentarCableado` / `onboard_medico_cablear` re-lee
  `user_metadata` y re-ejecuta). La invitación no se marca `completada` hasta que el
  cableado tenga éxito; reintentar el form con el mismo token retoma el cableado sin
  duplicar el auth user.
- **Doble submit / doble clic:** el estado `completada` corta el segundo intento.

## 8. Testing

- **Unit:** generación de token (formato/unicidad), lógica de expiración soft, validación
  Zod del form.
- **Integración (server action):** token válido → crea user + cablea + marca completada;
  token vencido → rechaza; token ya completado → rechaza; email duplicado → error claro;
  fallo de cableado → invitación queda `pendiente` y es reintentable.
- **E2E manual (Playwright/real):** Héctor genera enlace → abre `/alta/<token>` como
  médico → completa datos + contraseña → entra a `/dashboard`. Verificar que el médico
  aparece en `/admin/medicos` con tier `medica`, con nodo/slug/servicio asignados.
- **Reset de contraseña:** solicitar reset → llega el email por Resend → el link POST no
  se quema con prefetch → se cambia la contraseña.

## 9. Decisiones confirmadas / a verificar en implementación

1. ✅ "Categoría básica" = `'medica'`; "full" = tier que Héctor asigna luego (Héctor, 2026-07-09).
2. ✅ El médico queda **logueado automáticamente** al terminar → `/dashboard` (Héctor, 2026-07-09).
3. ⏳ Verificar en el plan el estado real del SMTP de Resend en Supabase Auth.

## 10. Archivos afectados (previsión)

- **Nuevo:** `supabase/migrations/<fecha>_invitaciones_medico.sql` (tabla + RLS + índices).
- **Nuevo:** `src/app/alta/[token]/page.tsx` (página pública).
- **Nuevo:** `src/features/onboarding/components/FormAltaMedico.tsx` (form + Zod).
- **Nuevo:** `src/actions/onboarding-medico.ts` (`completarInvitacionMedico`).
- **Editar:** `src/actions/admin-medicos.ts` (`generarInvitacionMedico`, listar/revocar).
- **Editar:** `/admin/medicos` UI (botón + lista de invitaciones + QR reutilizado).
- **Verificar/ajustar:** templates de Auth (recovery → POST), config SMTP Resend,
  páginas `forgot-password`/`update-password`/`activar`.

# Onboarding de secretaria por enlace — spec + plan

**Fecha:** 2026-07-10 · **Rama:** `fix/backlog-post-e2e`
**Estado:** diseño aprobado por Héctor. Espeja el onboarding de médicos por enlace.

## Problema
Hoy la secretaria no tiene enlace: `invitarSecretaria` deja un vínculo `pendiente` en
`equipo_consultorio` y **no manda ningún email**; ella debe registrarse sola en `/signup` con
el mismo email → depende del email de confirmación de Supabase (frágil) y, si se registra ANTES
de ser invitada, el trigger `handle_new_user` la crea como **médico**.

## Insight que lo hace simple
`handle_new_user` (`supabase/migrations/20260612_fase3b_secretaria.sql:84-118`) ya hace el claim:
si el email del nuevo `auth.users` matchea un `equipo_consultorio` en `pendiente`, setea
`rol='secretaria'`, el claim `app_metadata.rol='secretaria'`, y activa el vínculo. **No hay que
tocar esa lógica** — solo crear la cuenta con el email invitado y el trigger hace el resto.

## Diseño
Espeja el flujo del médico (`invitaciones_medico` + `/alta/[token]` + `completarInvitacionMedico`),
pero sobre `equipo_consultorio` y con formulario más chico.

1. **El médico invita** (desde `/consultorio/config`, sección Secretaria — donde ya está el botón):
   - Si el email **ya tiene cuenta** → vínculo `activa` inmediato (comportamiento actual, sin enlace).
   - Si **no tiene cuenta** → vínculo `pendiente` + se genera un **token**; la UI muestra el enlace
     copiable (+ QR) para mandar por WhatsApp.
2. **La secretaria abre `/alta-secretaria/[token]`**: ve su email (fijo, readonly) y completa
   **nombre, apellido y contraseña** (con ojito). Nada más (matrícula/CUIT/WhatsApp son de médicos).
3. **Al enviar** (`completarInvitacionSecretaria`): se crea la cuenta con
   `admin.createUser({ email: <email invitado>, password, email_confirm: true, user_metadata:{nombre,apellido} })`.
   El trigger la reconoce como secretaria y activa el vínculo. Queda **logueada** → redirige a `/agenda`.

**Por qué mata los dos problemas:** el email es **fijo** (el que invitó el médico), así que no puede
"registrarse con otro email y quedar como médico"; y `email_confirm:true` elimina el email frágil.

## Seguridad (igual que médico)
- Token 256 bits (`generarTokenInvitacion` de `@/features/onboarding/token`), un solo uso, vigencia 72 h.
- Validación server-side; el email NO es editable por la secretaria.
- El rol lo pone el trigger por match de email pendiente — no se puede forzar a médico.
- El acceso público a `equipo_consultorio` por token va por service-client (bypassa RLS), como el médico.
- Contraseña fuerte (mismo criterio: ≥8, con letras y números).

## Los permisos ya funcionan (no se tocan)
Una vez secretaria, la RLS delegada (`puede_acceder_consultorio`) ya le da agenda/conversaciones/
pacientes/turnos del médico y le niega facturación/recetas/config. Esta feature es solo el ALTA.

---

## Plan de implementación (tareas)

### Tarea 1 — Migración: token en `equipo_consultorio`
- `supabase/migrations/20260710_equipo_token.sql`: `alter table equipo_consultorio add column token text; create unique index ... on (token) where token is not null;`
- Aplicar a prod con OK de Héctor (aditiva, segura).

### Tarea 2 — `invitarSecretaria` genera token (modificar `src/actions/consultorio-secretaria.ts`)
- En la rama `pendiente` (sin cuenta): generar `token = generarTokenInvitacion()`, incluirlo en el
  upsert + refrescar `invited_at = now()` (para reiniciar la ventana de 72 h al reinvitar).
- Devolver `url = ${siteUrl()}/alta-secretaria/${token}` cuando `estado='pendiente'`.
- Rama `activa` (cuenta existe): sin token, sin url (igual que hoy).

### Tarea 3 — Exponer el enlace en el panel del médico
- El listado de secretarias de `/consultorio/config` debe incluir, para las `pendiente`, su `url`
  (token → `${siteUrl()}/alta-secretaria/${token}`), para poder recopiar el enlace después.
- Leer dónde arma la config las secretarias (`getConfig` / `panelService.ts`) y sumar el campo.
- UI (`config-view.tsx`, sección Secretaria): al invitar una nueva o en cada fila `pendiente`,
  botón "Copiar enlace" con feedback "¡Copiado!" (mismo patrón que el panel de médicos). QR opcional.

### Tarea 4 — Schema Zod del alta de secretaria (lógica pura, TDD)
- `src/features/onboarding/secretaria-types.ts`: `altaSecretariaSchema` (nombre, apellido, password,
  passwordConfirm) + tipo. Reusar el criterio de password del médico. Test en Vitest.

### Tarea 5 — `completarInvitacionSecretaria` (`src/actions/onboarding-secretaria.ts`)
- `completarInvitacionSecretaria(token, { nombre, apellido, password, passwordConfirm })`.
- Validar token con service-client: `equipo_consultorio` por `token`, `estado='pendiente'`, vigente
  (`invitacionVigente` con `invited_at`+72 h → adaptar: la función toma `expiraEn`; pasar
  `invited_at + 72h` calculado, o inline el chequeo). Traer `secretaria_email`.
- Zod. Crear cuenta con el email invitado + password + `email_confirm:true` + metadata nombre/apellido.
- Manejo de duplicado: si el email ya tiene cuenta → error claro ("ese email ya tiene cuenta; pedile
  al médico que te reinvite o iniciá sesión"). No intentar forzar.
- Auto-login (`signInWithPassword`) → `redirect('/agenda')`; fallback `/login?ok=cuenta_creada`.
- El trigger hace rol=secretaria + activación; NO setear rol en metadata.

### Tarea 6 — Página pública + formulario
- `src/app/alta-secretaria/[token]/page.tsx` (server): valida token con service-client; si vale,
  muestra el form con el email (readonly); si no, "Enlace no válido / pedile uno nuevo a tu médico".
- `src/features/onboarding/components/FormAltaSecretaria.tsx` (client): email readonly + nombre +
  apellido + password + passwordConfirm (con ojito Eye/EyeOff) → llama `completarInvitacionSecretaria`.
- Confirmar que `/alta-secretaria` es público (no en `protectedPaths` de `proxy.ts`).

### Tarea 7 — E2E + gate
- typecheck + build + tests.
- E2E: médico invita (email sin cuenta) → copiar enlace → abrir `/alta-secretaria/<token>` →
  completar → cae en `/agenda` como secretaria. Verificar en DB: `equipo_consultorio` `activa` con
  `secretaria_id`, `perfiles.rol='secretaria'`, claim en `app_metadata`. Limpiar la cuenta de prueba.

## Notas
- Reusa `generarTokenInvitacion`, `invitacionVigente`, `siteUrl`, `createServiceClient/createClient`,
  y el patrón de ojito de `FormAltaMedico`.
- No toca la RLS delegada ni el trigger (solo se apoya en ellos).

# Spec — Panel de onboarding de médicos — 2026-06-16

**Estado:** diseño aprobado (pendiente de plan de implementación)
**Autor:** Héctor + Claude (brainstorming)

---

## 1. Contexto y problema

Hoy dar de alta un médico es **semi-manual**: el médico puede auto-registrarse (`/signup`) y completar su perfil/horarios/asistente por UI, pero el **cableado de WhatsApp** (asignar nodo + slug + número personal) y la **creación del servicio "Consulta"** requieren **SQL/scripts a mano** (`seed-wa-canal.mjs`, `INSERT` directos). No hay panel.

Esto no escala más allá de un par de médicos y bloquea el objetivo de "onboardear el 1er médico real". **Nota:** hoy el único "médico" es la cuenta `admin@medicuenta.com` (rol `admin` + `es_superadmin`); todavía no existe ninguna cuenta `rol='medico'` real.

## 2. Objetivo

Un **panel admin (solo superadmin)** que onboardee un médico de punta a punta desde **un formulario y un botón**, eliminando los pasos de SQL/scripts.

### No-objetivos (fuera de alcance)
- Horarios de atención y config del asistente (precio, saludo, tono): **se siguen cargando en `/consultorio/config`** (ya tiene UI). El panel NO los rehace.
- Self-service del médico ni auto-asignación de nodos (decisión: lo hace el admin).
- Registrar nodos nuevos en Meta (flota de nodos) — sigue siendo tarea de infra manual; el panel solo **consume** nodos con cupo.
- Probar el rol secretaria (diferido).

## 3. Decisiones (del brainstorming)

| # | Decisión |
|---|---|
| Operador | El **admin (superadmin)** hace todo el onboarding desde el panel (llave en mano). |
| Alcance | Cuenta + identidad del médico + servicio "Consulta" + cableado WhatsApp. |
| Acceso del médico | **Invitación por email** (Supabase Auth); el médico elige su contraseña. |
| Cableado WhatsApp | **Automático con opción a editar**: nodo con cupo auto + slug `dr-apellido` auto-editable; el admin tipea el número de WhatsApp del médico. |
| Enfoque de build | **A** — formulario único + lista de médicos con estado y "reintentar". |

## 4. Arquitectura

Sección nueva bajo `/admin` (gated por `es_superadmin`):

- `GET /admin/medicos` — **lista** de médicos con estado de cableado + link público.
- Formulario **"Nuevo médico"** en la página dedicada `/admin/medicos/nuevo`.
- **Server action** `onboardMedico(input)` — orquesta el alta completa (service-role, server-only).
- **Server action** `reintentarCableado(medicoId)` — re-ejecuta solo el cableado faltante (idempotente).
- Helpers puros: `generarSlug(nombre, apellido)` + chequeo de unicidad; `elegirNodoConCupo()`; `normalizarNumeroWhatsApp(raw)`.

Sigue patrones existentes: `src/actions/*.ts`, feature `consultorio`, `createServiceClient()`.

## 5. Componentes

1. **Lista de médicos** (`/admin/medicos`): tabla (nombre, email, especialidad, link `/c/slug`, estado ✅ cableado / ⏳ pendiente). Botón "＋ Nuevo médico". Por fila: copiar link, ver QR, "reintentar cableado" si está pendiente.
2. **Formulario "Nuevo médico"**: email; nombre; apellido; especialidad; matrícula; CUIT; teléfono; número de WhatsApp; slug (autocompletado `dr-apellido`, editable, con chequeo "✓ disponible / ✗ en uso").
3. **`onboardMedico`** (orquestador) — ver §6.
4. **Página de aceptar invitación / setear contraseña** — verificar si la actual de reset (`/forgot-password` / update password) cubre el `type=invite` de Supabase, o agregar una ruta que reciba el token de invitación y deje al médico elegir su contraseña → redirige a `/dashboard`.

## 6. Flujo de datos — `onboardMedico`

1. **Verificar `es_superadmin`** (server-side) del que llama. Si no, abortar.
2. **Validar inputs (Zod)**: email; identidad; número de WhatsApp normalizado al formato de Meta (Argentina **sin el 9**); formato de slug.
3. **Sin efectos todavía**: chequear que el slug esté libre (`wa_asignaciones.slug_publico`) + **elegir un nodo activo con cupo** (`wa_nodos` con `estado='activo'` y `medicos_activos < capacidad_max`). Si no hay cupo → error claro.
4. **Crear cuenta + invitar**: `supabase.auth.admin.inviteUserByEmail(email, { data: { full_name }, redirectTo })`. Esto inserta en `auth.users` → el trigger `handle_new_user()` crea la fila en `perfiles` con `rol='medico'`.
5. **Escrituras de datos en UNA transacción** (preferentemente una función Postgres/RPC para atomicidad real): 
   - `update perfiles` con identidad (nombre, apellido, especialidad, matrícula, cuit, teléfono) por `id = nuevo medico_id`.
   - `insert wa_servicios` ("Consulta", `duracion_min` default, `activo=true`).
   - `insert wa_asignaciones` (medico_id, nodo_id, slug_publico, numero_personal, `activo=true`).
   - `update wa_nodos` `medicos_activos` (incrementar o recomputar por count).
6. **Devolver** éxito + link `https://<base>/c/<slug>` + QR (reusar `linkNodo`).

## 7. Modelo de datos (tablas tocadas)

- `auth.users` (vía Supabase Auth admin API) — la cuenta.
- `perfiles` — identidad + `rol='medico'` (la fila la crea el trigger; el panel la completa).
- `wa_servicios` — el servicio "Consulta".
- `wa_asignaciones` — el cableado (medico_id UNIQUE, slug_publico UNIQUE, nodo_id, numero_personal).
- `wa_nodos` — lectura de cupo + update de `medicos_activos`.

> Usa el modelo de **nodos** (no el legacy `wa_canales`/`seed-wa-canal.mjs`).

## 8. Manejo de errores

- **No atómico entre Auth y datos**: la cuenta (Supabase Auth) y los datos (schema public) son sistemas distintos. Por eso: validar TODO antes de crear la cuenta; las 3 escrituras de datos van juntas en transacción.
- **Fallo parcial** (cuenta creada, cableado falla) → el médico aparece **⏳ pendiente** en la lista; `reintentarCableado` rehace solo lo que falte. **Idempotente**: `update` perfil; `wa_servicios`/`wa_asignaciones` con check-then-insert o upsert; nunca duplica ni crea cuentas huérfanas.
- **Colisión de slug** en el último segundo → el `UNIQUE` de la DB tira `23505` → mensaje "ese slug se usó recién, probá otro".
- **Nodo sin cupo** → "no hay nodos con cupo; hay que registrar un nodo nuevo" (flota futura).

## 9. Seguridad

- `/admin/*` **y cada server action** verifican `es_superadmin` **en el servidor** (no alcanza el middleware).
- Creación de cuenta + cableado usan la **service-role key solo del lado del servidor** (nunca en el cliente).
- Validación estricta con Zod de todos los inputs (incluida la normalización del número).

## 10. Testing

- **Unit**: `generarSlug` (acentos → `dr-martinez`, repetidos → `dr-martinez-2`), `elegirNodoConCupo` (con/sin cupo, packing), `normalizarNumeroWhatsApp` (formato Meta sin 9).
- **Integración**: `onboardMedico` con Supabase mockeado — camino feliz + **fallo parcial** (cuenta creada, asignación falla → queda pendiente, `reintentarCableado` lo completa).
- **Manual E2E**: onboardear un médico de prueba → llega el email de invitación → setea contraseña → entra → se crearon perfil/servicio/asignación → `curl /c/<slug>` da 302.

## 11. Dependencias y riesgos

- **Email de invitación**: depende del SMTP de Supabase. El SMTP default tiene límites bajos (testing). Para volumen real → configurar SMTP propio (Resend, ya disponible vía skill add-emails). *Riesgo a confirmar antes de producción.*
- **Página de aceptar invitación**: confirmar que el flujo `type=invite` de Supabase aterrice en una página donde el médico setea contraseña (puede requerir una ruta nueva o adaptar la de reset).
- **`medicos_activos`**: elegir entre incrementar el contador o recomputar por count para evitar drift.

## 12. Criterios de aceptación

1. Desde `/admin/medicos/nuevo`, completando el formulario y un botón, queda creado: cuenta (invitada) + perfil + servicio "Consulta" + asignación de nodo/slug/número.
2. El admin recibe el link `/c/<slug>` + QR al terminar.
3. Si el cableado falla tras crear la cuenta, el médico queda ⏳ pendiente y "reintentar" lo completa sin duplicar.
4. Solo un `es_superadmin` puede acceder al panel y a las acciones.
5. El `/c/<slug>` del médico nuevo redirige (302) a su WhatsApp.

## 13. Fuera de alcance / futuro

- Horarios + asistente → `/consultorio/config` existente.
- Registrar nodos nuevos en Meta (flota) cuando el nodo piloto se llene (cap 50).
- Probar rol secretaria (diferido).
- Fase 5 — Suscripciones (monetización, otro spec).

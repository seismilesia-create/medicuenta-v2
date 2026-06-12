# Plan: Fase 3B — La secretaria (acceso delegado) — 2026-06-12

## Objetivo

El médico invita a su secretaria por email. Ella entra con **su propio usuario** y ve **solo
el grupo Consultorio** (agenda, conversaciones, pacientes) — **nunca** facturación, recetas ni
la config del consultorio. El corte es a **nivel base de datos** (RLS delegada), no solo de menú:
defensa en profundidad. Revocar = corte inmediato.

Insumos: spec §7 (secretaria), §10 (vara de seguridad), decisión D2 · notas de ejecución de
3A parte 1 (`wa_bitacora` INSERT delegado, FK `creado_por`) y parte 2 (11 patrones de auto-blindaje).

## Contexto real mapeado (verificado contra DB y código)

- **Identidad**: `perfiles(id = auth.users.id, nombre, apellido, rol, …)`. El **trigger
  `on_auth_user_created → handle_new_user()`** (SECURITY DEFINER) crea el perfil en el signup con
  `rol = coalesce(raw_user_meta_data->>'rol', 'medico')`. **Acá engancho el claim de invitación.**
- **RLS hoy**: TODA tabla del consultorio (`wa_*`) y de facturación (`ordenes, liquidaciones,
  debitos, cirugias, recetas, recetas_cobro, mp_conexiones, chat_*`) usa `auth.uid() = medico_id`
  (o `medico_id = auth.uid()`). `perfiles` usa `auth.uid() = id`. Tablas de referencia
  (`aranceles_*, normas, prestaciones, vademecum, modulos_detalle`) son lectura pública autenticada.
- **App identifica al médico como `user.id` directo**: las pages de consultorio pasan
  `medicoId={user.id}` a sus vistas; las actions hacen `auth.getUser()` y filtran por `user.id`.
  **Ese es el punto que cambia**: para la secretaria, el médico activo NO es su `user.id`.
- **Envío de WhatsApp** (`responderComoHumano`): lee el canal con
  `getCanalByMedicoId(supabase, user.id)` por el cliente del usuario. `wa_canales` es médico-only
  y NO se delega (spec) → el envío de la secretaria necesita **ruta service-role autorizada**.
- **Ficha de paciente** (`getFicha`): lee `recetas` por el cliente del usuario. Para la secretaria
  el RLS de `recetas` (médico-only) ya devuelve vacío; además ocultamos la sección en la UI.
- **Middleware** (`src/lib/supabase/proxy.ts`): `protectedPaths` hardcodeado, solo chequea
  existencia de user, **sin rol**. **Acá va el guard de rol** (tercera capa).
- **createServiceClient()** existe en `src/lib/supabase/server.ts` (lanza si falta la env).

## El modelo de seguridad (el corazón de 3B)

**Garantía por construcción: la facturación y las recetas NUNCA se delegan.** El `auth.uid()` de
la secretaria jamás es igual al `medico_id` de esas tablas, y no agregamos ningún camino de
delegación ahí. Por lo tanto su cliente no puede leerlas — le pegue como le pegue a la API.

**Tres capas (defensa en profundidad):**
1. **RLS delegada** (la base): función `puede_acceder_consultorio(medico_id)` que es verdadera si
   `medico_id = auth.uid()` **o** existe vínculo `activa` en `equipo_consultorio`. Se aplica SOLO a
   las tablas del consultorio que la secretaria necesita. Esta capa es la que importa.
2. **Resolución de contexto en la app**: las pages/actions resuelven el `medicoActivoId` del lado
   servidor (no lo manda el cliente) y operan con él. La config del consultorio exige
   `userId === medicoActivoId` (solo el dueño).
3. **Navegación + middleware**: la secretaria no ve los menús de facturación, y el middleware la
   redirige si tipea una ruta de facturación a mano. Cosmético/cortesía — la seguridad real es (1).

### Tabla del vínculo

```sql
create table public.equipo_consultorio (
  id uuid primary key default gen_random_uuid(),
  medico_id uuid not null references auth.users(id) on delete cascade,
  secretaria_id uuid references auth.users(id) on delete cascade,   -- null hasta que se registra
  secretaria_email text not null,                                    -- canónico en minúsculas
  estado text not null default 'pendiente'                           -- pendiente | activa | revocada
    check (estado in ('pendiente','activa','revocada')),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (medico_id, secretaria_email)
);
```
Multi-consultorio sale gratis: una secretaria puede tener N filas `activa` (un médico distinto cada
una). El médico ve/gestiona sus filas; la secretaria lee las suyas.

### Delegación por tabla (exacto, del spec §7)

| Tablas | Delegación |
|--------|-----------|
| `wa_turnos, wa_sobreturnos, wa_contactos, wa_conversaciones, wa_mensajes, wa_pacientes, wa_excepciones` | **Completa** (select+insert+update+delete) vía `puede_acceder_consultorio(medico_id)` |
| `wa_bitacora` | **select + insert** delegados (las acciones de la secretaria quedan en bitácora) |
| `wa_horarios, wa_servicios` | **Solo SELECT** delegado (la agenda los lee para calcular huecos); insert/update/delete siguen `auth.uid() = medico_id` |
| `equipo_consultorio` | médico CRUD sus filas (`medico_id = auth.uid()`); secretaria SELECT las suyas (`secretaria_id = auth.uid()`) |
| `wa_config_agente, wa_canales, wa_os_suspendidas, wa_eventos_webhook` | **Intactas** (médico-only) — config/conexión/bot |
| `mp_conexiones, recetas, recetas_cobro, ordenes, liquidaciones, debitos, cirugias, chat_*, perfiles, nomenclador` | **Intactas** (médico-only) — facturación/recetas/privado |

`wa_os_suspendidas` no se delega: el panel de la secretaria no lo lee (solo el bot server-side y la
config médico-only). El envío de WhatsApp lee `wa_canales` por **ruta service-role autorizada**
(no por delegación de RLS).

### Función RLS y trigger de claim

```sql
create or replace function public.puede_acceder_consultorio(target_medico uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select target_medico = auth.uid()
      or exists (select 1 from public.equipo_consultorio
                 where medico_id = target_medico and secretaria_id = auth.uid() and estado = 'activa');
$$;
```
SECURITY DEFINER para leer `equipo_consultorio` sin recursión de RLS; `search_path` fijado.

```sql
-- uid por email (para vincular cuentas ya existentes desde la acción del médico)
create or replace function public.uid_por_email(p_email text)
returns uuid language sql stable security definer set search_path = public, auth as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;
revoke execute on function public.uid_por_email(text) from anon, authenticated; -- solo service-role
```

`handle_new_user()` extendido: si hay invitación `pendiente` que matchea el email del nuevo
usuario → `rol = 'secretaria'` + activa TODAS sus invitaciones pendientes (multi-consultorio).
La prueba de propiedad del email es la confirmación de Supabase (el signup ya exige verificar email).

## Decisiones de implementación (con el porqué)

| # | Decisión | Por qué |
|---|----------|---------|
| 1 | **Claim por email en el signup vía el trigger**, no email transaccional. | Cero dependencia de Resend/deliverability. La verificación de email de Supabase ES la prueba de propiedad. El médico y la secretaria están en el mismo consultorio: el médico le dice "registrate con tu email". |
| 2 | **Cuenta existente → vínculo inmediato** (acción del médico usa `uid_por_email` vía service-role) `estado='activa'`. **Sin cuenta → `pendiente`**, se activa en el signup. | Cubre las dos ramas del spec ("cuenta existente → vincula; si no → se registra y activa"). |
| 3 | **Resolución server-side del `medicoActivoId`** (`resolverConsultorio()`), nunca del cliente, con cookie `consultorio_activo` validada contra la lista permitida. | El cliente no puede spoofear de qué médico ve datos. La cookie solo elige entre los que el RLS ya permite. |
| 4 | **Config del consultorio exige `userId === medicoActivoId`**. | Regla simple y agnóstica de rol: solo el dueño del consultorio cambia su config. Una secretaria (o un médico operando otro consultorio) nunca pasa. |
| 5 | **Envío de WhatsApp por ruta service-role** tras autorizar con el resolver (no se delega `wa_canales`). | El spec deja `wa_canales` intacta. La acción ya es privilegiada (descifra el token con `ENCRYPTION_KEY`); leer el canal con service-client tras verificar el vínculo mantiene la RLS médico-only. |
| 6 | **El asistente IA se oculta para la secretaria** (panel lateral + `/asistente` + home `/`). | Sus tools tocan facturación. Se redirige la secretaria a `/agenda`. Los `chat_*` son médico-only igual, pero mejor no exponerlo. |
| 7 | **Ficha: ocultar la sección Recetas para la secretaria** además del corte por RLS. | Doble candado (spec §7: "medicamentos y montos jamás a la secretaria"). El RLS ya devuelve vacío; la UI no la dibuja. |
| 8 | **Middleware lee `perfiles.rol`** para el guard de rutas de facturación. | Tercera capa. Deuda anotada: mover el rol a un claim del JWT para evitar el read por request (hoy es un PK lookup, aceptable para el MVP). |
| 9 | **Multi-consultorio: modelo y resolver lo soportan; el selector se muestra solo si `medicos.length > 1`.** | "Gratis con este modelo" (spec). Para el MVP de un médico queda invisible, sin código muerto. |
| 10 | **`wa_bitacora` con INSERT delegado** (no service-role). | Es auditoría del consultorio, no dato sensible; delegarlo es más simple que una ruta service-role y deja la traza con `medico_id` correcto + `origen='panel'`. |
| 11 | **Tests de seguridad RLS reproducibles** (`scripts/test-rls-secretaria.sql`) corridos por impersonación (`set request.jwt.claims`), + gate documentado. | La §10 exige probar que la secretaria NO lee facturación/recetas ni por API directa. La prueba honesta es a nivel RLS, no de UI. |

## Patrones de auto-blindaje a respetar (de 3A — OBLIGATORIOS)

`ok()` con throw en lecturas nuevas (#1) · error de acción DESPUÉS del refetch (#2) · epoch guard
en refetch (#3) · `parseMontoArs` para montos (#5) · literales verificados contra el código, no
asumidos (#7) · `.or()`/inputs sanitizados (#8). Nuevos de la agenda GCal: "cerrado/acceso se
deriva de estructura, no de cálculo".

## Tasks (5 clusters, review por cluster + review final como en 3A)

### Cluster A — Backbone de seguridad en DB (migración única)
- **A1**: `apply_migration` con: tabla `equipo_consultorio` (+ índices `medico_id`, `secretaria_id`,
  `lower(secretaria_email)`) + RLS propia · función `puede_acceder_consultorio` · función
  `uid_por_email` (execute revocado a authenticated) · trigger `handle_new_user` extendido (claim).
- **A2**: recrear policies de las tablas de **delegación completa** (7 tablas + `wa_bitacora`
  select/insert) usando `puede_acceder_consultorio(medico_id)`; **solo-SELECT** en `wa_horarios`/
  `wa_servicios` (insert/update/delete intactos). NINGUNA otra tabla tocada.
- **Gate A**: query de verificación de `pg_policies` (las 7+2 delegadas tienen la función; las de
  facturación siguen `auth.uid() = medico_id` intactas) + `get_advisors` sin nuevos errores de seguridad.

### Cluster B — Capa de resolución de contexto
- **B1**: `src/features/consultorio/access/contexto.ts` (server-only): `resolverConsultorio()` →
  `{ userId, rol, medicoActivoId, medicos: {id,nombre}[] }`. Lee `perfiles.rol`; para secretaria
  arma `medicos` desde `equipo_consultorio` (estado activa); `medicoActivoId` = cookie validada o
  `medicos[0]`; si secretaria sin vínculos → `medicos: []`. Helper `assertMedicoDueño(ctx)` para config.
- **B2**: refactor de las 4 pages de consultorio para pasar `medicoId = medicoActivoId` (no `user.id`);
  `consultorio/config` redirige si `rol==='secretaria'` o `userId !== medicoActivoId`.
- **B3**: refactor de las actions (`consultorio-agenda`, `-conversaciones`, `-pacientes`) para usar
  `resolverConsultorio()` → `medicoId` en queries, `userId` en auditoría (`creado_por`, `registrarEvento`).
  `consultorio-config` agrega guard dueño-only. `responderComoHumano`: leer canal con service-client
  tras `resolverConsultorio` (autorización), envío y escrituras con el cliente del usuario (RLS delegada).
- **Gate B**: typecheck + suite + el médico (operando lo suyo) sigue viendo/operando todo igual.

### Cluster C — Invitación y gestión
- **C1**: actions `invitarSecretaria(email)` / `revocarSecretaria(id)` / `reenviarOEstado` —
  dueño-only; rama cuenta-existente (`uid_por_email` service) vs pendiente.
- **C2**: sección "Secretaria" en `/consultorio/config` (médico-only): invitar por email, lista de
  vínculos con estado (pendiente/activa), revocar con confirm. (El claim en signup ya vive en A1.)
- **Gate C**: typecheck + suite.

### Cluster D — Navegación por rol
- **D1**: layout pasa `rol` + `medicos` a `Sidebar`/`BottomNav`; ambos muestran solo el grupo
  Consultorio si `rol==='secretaria'`. Selector de consultorio (solo si `medicos.length>1`) que setea
  la cookie `consultorio_activo`.
- **D2**: `proxy.ts` — guard de rol: secretaria en ruta de facturación → redirect `/agenda`. Home `/`
  y `/asistente`: secretaria → `/agenda`. Ocultar `AssistantSidePanel` para secretaria en el layout.
- **Gate D**: typecheck + build + smoke por rol (médico ve todo; secretaria solo consultorio).

### Cluster E — Tests de seguridad + verificación (LA VARA, §10)
- **E1**: `scripts/test-rls-secretaria.sql` — con datos de prueba (un médico, una secretaria activa,
  una revocada, un segundo médico no vinculado) impersonando vía `set local request.jwt.claims`:
  - Secretaria activa: SELECT/INSERT en `wa_turnos/wa_pacientes/...` del médico → OK.
  - Secretaria activa: SELECT en `ordenes/liquidaciones/debitos/cirugias/recetas/recetas_cobro/
    mp_conexiones/chat_*` → **0 filas**; INSERT en `ordenes` → **falla**.
  - `wa_horarios/wa_servicios`: SELECT OK, UPDATE/INSERT → **falla** (solo-SELECT delegado).
  - Secretaria **revocada**: SELECT `wa_turnos` del médico → **0 filas** (corte inmediato).
  - Segundo médico no vinculado: SELECT consultorio del primero → **0 filas**.
- **E2**: correr E1 vía MCP, documentar verde. `get_advisors`. Suite + typecheck + build.
- **E3**: review adversarial fresco del diff (foco: ¿algún camino deja leer facturación/recetas?
  ¿la cookie de consultorio puede apuntar a un médico no permitido? ¿alguna action quedó con
  `user.id` en vez de `medicoActivoId`?). Arreglar hallazgos.
- **Gate E**: E1 verde + review sin críticos. Recién ahí 3B cierra (queda la prueba en vivo del dueño
  con usuario-secretaria de prueba, al final de todo el desarrollo).

## Fuera de alcance (no re-debatir)
- Permisos finos (un solo rol `secretaria`, paquete fijo — spec). · Email transaccional de invitación
  (claim por signup; Resend si algún día se quiere UX de email). · Rol en el JWT (deuda anotada;
  hoy read en middleware). · El asistente IA para la secretaria (oculto). · GCal/correlación = 3C.

## Self-review (al escribir)
- Facturación/recetas: CERO policies tocadas → la secretaria no las lee por construcción ✓
- `wa_horarios/wa_servicios`: solo SELECT delegado, escritura médico-only ✓ (la secretaria no cambia horarios/duración)
- Config médico-only por `userId===medicoActivoId` ✓ · Recetas en ficha: RLS vacío + UI oculta ✓
- Envío WhatsApp: service-role tras autorización, `wa_canales` intacta ✓
- Auditoría: `creado_por`/`registrarEvento` con `userId` (quién), `medico_id` con `medicoActivoId` (de quién) ✓
- Revocar = `estado='revocada'` → la función RLS deja de matchear al instante ✓
- Multi-consultorio: cookie validada contra `medicos` permitidos ✓

## Notas de la ejecución (2026-06-12)

Ejecutado completo por clusters con gate por cluster. 6 commits sobre `12fd28b`:
`c48873b` (A) · `94fc5c2` (B) · `73ec799` (C) · `8bb955d` (D) · `1785867` (tests E). La migración
`20260612_fase3b_secretaria.sql` se aplicó al proyecto de prueba (`eylcrxhpccwobipcjzal`).

**Validaciones (todas verdes):**
- **Cluster A** (RLS): verificación estructural de `pg_policies` (7 tablas full + `wa_bitacora`
  select/insert + `wa_horarios`/`wa_servicios` solo-SELECT delegadas; facturación/recetas/config
  intactas) + `get_advisors` + prueba funcional por impersonación.
- **Cluster B**: typecheck + 153 tests + smoke del médico (sigue viendo sus turnos y entrando a config).
- **Cluster C**: smoke del flujo de invitación end-to-end (gabriel cuenta-existente → 'activa' al
  instante, input se limpia).
- **Cluster D**: verificado en **build de producción** (`next start`): secretaria redirigida de
  `/dashboard /ordenes /nomenclador /asistente /` → `/agenda`, conserva `/agenda /conversaciones
  /pacientes /perfil`; médico con acceso completo (ninguna redirección).
- **Cluster E** (LA VARA §10): los 5 escenarios de `scripts/test-rls-secretaria.sql` verdes —
  ve consultorio (3 turnos, 2 pacientes, 74 mensajes, 10 horarios) / **0 en toda la
  facturación+recetas+config** · insert de turno delegado OK · insert en `ordenes` rechazado
  (42501) · update de horarios/servicios = 0 (solo-SELECT) · revocar = 0 al instante · médico
  ajeno aislado.

**Desviación del plan (decidida en ejecución):** el guard de rol del middleware se resolvió leyendo
el **claim `app_metadata.rol` del JWT** (cero query por request), NO con un read a `perfiles` en el
edge. Motivo: la query `.from('perfiles')` en el middleware corría sin autenticar (anon → RLS la
vaciaba). El trigger `handle_new_user` setea el claim en el signup; para cuentas existentes invitadas
NO se toca el claim (multi-rol queda con nav de médico, RLS protege igual).

**Auto-blindaje nuevo (para 3C y futuras):**
1. **`next dev --turbopack` (Next 16.2.3) NO ejecuta el middleware** — ni el guard de rol ni el
   redirect de auth-route. Se verifica con `npm run build && npm start` (o el deploy). El
   `console.log`/`console.error` del edge runtime tampoco aparece en stdout del dev. En el futuro:
   probar TODO lo que dependa de middleware en build de producción, no en dev.
2. **Dev servers zombie**: reinicios repetidos de `npm run dev` dejaron varios procesos peleando por
   `:3000` sirviendo código viejo (causa de horas de confusión). Matar SIEMPRE con
   `pkill -9 -f "next dev"; pkill -9 -f "next-server"` antes de relanzar.
3. **RLS en el middleware NO**: una query `.from()` en el edge middleware no lleva el token del
   usuario de forma confiable → corre como anon. Para decisiones de rol en middleware, usar el
   claim del JWT (`app_metadata`), no la DB.
4. **Postgres: `REVOKE EXECUTE ... FROM anon, authenticated` NO basta** — el grant por defecto va a
   PUBLIC. Para cerrar de verdad una función: `REVOKE ... FROM PUBLIC` + `GRANT ... TO service_role`
   (cazado por `get_advisors` en `uid_por_email`).
5. **`mis_consultorios()` con `rol IS DISTINCT FROM 'secretaria'`** (no `= 'medico'`): el usuario de
   prueba tenía `rol='admin'`; filtrar por `='medico'` lo dejaba sin su propio consultorio.
6. **Impersonación para tests de RLS**: `set local role authenticated` (baja de superusuario, así la
   RLS se evalúa) + `set local request.jwt.claims = '{"sub":"<uuid>"}'`. El MCP corre como postgres
   (bypassa RLS) si no se baja el rol.

**Datos de prueba dejados en la DB (proyecto eylcrxhpccwobipcjzal):** gabriel@seismilesia.com quedó
como **secretaria-de-prueba** vinculada a admin (`perfiles.rol='secretaria'`,
`app_metadata.rol='secretaria'`, fila `equipo_consultorio` 'activa') — fixture para la prueba en
vivo del dueño. Revertir a médico, si se quisiera: `update perfiles set rol='medico'` +
`update auth.users set raw_app_meta_data = raw_app_meta_data - 'rol'` + borrar/revocar la fila de
`equipo_consultorio`, los tres para el id `9e473632-1f3f-4d25-a73c-adb08050d1f9`.

**Deuda menor:** mover `rol` a un claim del JWT como fuente única (hoy vive en `perfiles.rol` para
el resolver/server y se denormaliza a `app_metadata.rol` para el middleware; el trigger los sincroniza
en el signup, pero un cambio manual de `perfiles.rol` no propaga al claim hasta el próximo login).

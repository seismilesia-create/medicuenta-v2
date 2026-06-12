# HANDOFF — MediCuenta V2 (Fase 3B COMPLETA: la secretaria con acceso delegado) — 2026-06-12

## Estado actual
- **Tarea**: **Fase 3B COMPLETA en desarrollo.** Secretaria invitada por el médico, con acceso
  delegado SOLO al consultorio (agenda/conversaciones/pacientes) y NUNCA a facturación/recetas/config.
  Plan ejecutado: `docs/superpowers/plans/2026-06-12-fase3b-secretaria.md` (5 clusters, gate por
  cluster, review adversarial fresco al cierre, 1 fix aplicado). **Pendiente: prueba en vivo del
  dueño con la secretaria de prueba** (que ahora va al final, junto con la de 3A).
- **Estado**: working (cero pendientes de código de 3B; falta la validación en vivo del dueño).
- **Branch**: `feat/whatsapp-recetas-turnos` (NO pusheada aún tras 3B — preguntar al dueño antes).
- **Último commit**: `5b4be30` fix del review de 3B. La rama 3B va de `c48873b`..`5b4be30` sobre 3A.

## Qué se hizo esta sesión (3B completa, por clusters)
1. **Ajustes de 3A** (pedidos del dueño antes de 3B): agenda estilo Google Calendar (vistas
   mes/semana/día), renombre a "Asistente de turnos", horarios estilo Google Business, campos del
   asistente con contexto. (commits hasta `12fd28b`).
2. **Plan de 3B** con mapeo de contexto real (RLS actual, roles, auth, trigger de signup) + spec §7/§10.
3. **Cluster A — Backbone de seguridad** (`c48873b`): tabla `equipo_consultorio`, función RLS
   `puede_acceder_consultorio`, policies delegadas (7 tablas full + `wa_bitacora` + `wa_horarios`/
   `wa_servicios` solo-SELECT), `uid_por_email` (service-role), claim de invitación en `handle_new_user`.
   Facturación/recetas/config: CERO policies tocadas.
4. **Cluster B — Resolución de contexto** (`94fc5c2`): `resolverConsultorio()` (medicoActivoId
   server-side, multi-consultorio), refactor de TODAS las pages/actions del consultorio a `medicoId`
   resuelto (no `user.id`), config médico-only por `esDueño`, recetas ocultas a la secretaria, envío
   de WhatsApp por service-role tras autorizar.
5. **Cluster C — Invitación/gestión** (`73ec799`): acciones invitar/revocar, sección "Secretaria" en config.
6. **Cluster D — Navegación por rol** (`8bb955d`): sidebar/bottom-nav solo Consultorio para la
   secretaria, selector multi-consultorio, **guard del middleware por claim `app_metadata.rol`**.
7. **Cluster E — Tests de seguridad** (`1785867`): `scripts/test-rls-secretaria.sql`, 5 escenarios
   verdes. **Review adversarial fresco**: cero críticos/importantes; 1 fix menor aplicado (`5b4be30`).

## Decisiones clave (con el porqué)
- **RLS delegada por función `puede_acceder_consultorio(medico_id)`** = la seguridad real. La
  facturación/recetas NO se delegan → la secretaria no las lee por construcción (probado).
- **Guard del middleware por claim del JWT (`app_metadata.rol`), NO por query a `perfiles`** — la
  query `.from()` en el edge corría sin autenticar (anon). El trigger setea el claim en el signup;
  la acción de invitar lo setea para cuentas existentes (fix del review).
- **`next dev --turbopack` NO ejecuta el middleware** (Next 16.2.3). El guard de rol se verifica en
  **build de producción** (`npm run build && npm start`) — ahí corre OK (verificado). RLS y menú
  funcionan en dev igual.

## Lo que NO funcionó (no repetir)
- **Horas perdidas con el middleware**: (a) Turbopack dev no corre el middleware; (b) reinicios de
  `npm run dev` dejaron **dev servers zombie** peleando por `:3000` sirviendo código viejo. Matar
  SIEMPRE con `pkill -9 -f "next dev"; pkill -9 -f "next-server"` antes de relanzar, y probar lo de
  middleware en build de producción.
- **`REVOKE EXECUTE FROM anon, authenticated` no basta** (el grant va a PUBLIC) — usar
  `REVOKE ... FROM PUBLIC` + `GRANT ... TO service_role` (lo cazó `get_advisors`).
- (Vigentes: Haiku NO como agente conversacional · túnel trycloudflare verificar con curl ANTES de
  dar a Meta · token de Meta vence en horas · `npm run lint` roto, no es gate.)

## Próximo paso concreto
**1) Prueba en vivo del dueño (al final del desarrollo, como pidió):** logueado como **gabriel@
seismilesia.com** (secretaria de prueba, vinculada a admin) en **build de producción** (`npm run
build && npm start`, NO dev): ve solo el menú Consultorio · `/agenda` muestra los turnos del médico
(Quinteros/Figueroa) · puede dar turnos/sobreturnos/marcar asistencia/responder conversaciones ·
NO ve facturación/recetas/config · `/dashboard` o `/ordenes` a mano → redirige a `/agenda`. Como
médico (admin): invitar/revocar secretaria desde Asistente de turnos → Secretaria. Revocar = corte
inmediato.
**2) Si pide ajustes**: aplicarlos. Si sale limpia: cerrar 3A+3B y pushear (preguntar antes).
**3) Después: Fase 3C** — espejo Google Calendar + correlación turno→orden + control 15 min + pulido
desktop + (lo charlado) la **vista celular/web adaptativa** (asistente-first en mobile, shell completo
en web). Necesita: credenciales de Google del dueño + token de Meta renovado para el E2E.

## Comandos para verificar estado al retomar
```bash
cd ~/proyectos/Medicuenta-V2.0
git status        # esperado: limpio (salvo next-env.d.ts, ruido del build)
git log --oneline 12fd28b..HEAD   # 8 commits de 3A-ajustes + 3B
npm test          # esperado: 153 verdes
npm run build     # esperado: OK, "ƒ Proxy (Middleware)" presente
# Tests de seguridad RLS: correr scripts/test-rls-secretaria.sql bloque por bloque (MCP Supabase)
```

## Archivos clave para releer
- `docs/superpowers/plans/2026-06-12-fase3b-secretaria.md` — **modelo de seguridad + "Notas de la
  ejecución"** (aprendizajes del middleware/turbopack, fixture gabriel, deuda del rol en JWT).
- `supabase/migrations/20260612_fase3b_secretaria.sql` — la RLS delegada + funciones + trigger.
- `src/features/consultorio/access/contexto.ts` — `resolverConsultorio()` (el corazón de la app-layer).
- `scripts/test-rls-secretaria.sql` — la vara de seguridad (§10), 5 escenarios.
- `docs/superpowers/specs/2026-06-11-fase3-panel-consultorio-design.md` — §9 (integraciones 3C).

## Notas contextuales
- **Datos de prueba en la DB** (`eylcrxhpccwobipcjzal`): **gabriel@seismilesia.com es la secretaria
  de prueba** (perfiles.rol='secretaria', app_metadata.rol='secretaria', vínculo 'activa' con admin).
  admin@medicuenta.com sigue siendo el médico con turnos. Para revertir gabriel a médico: ver el
  final del plan de 3B.
- **Infra efímera APAGADA** (dev/túnel no se levantaron al cierre). El guard de rol del middleware
  SOLO se ve en build de producción.
- **Deuda menor anotada**: rol único como fuente (hoy `perfiles.rol` + claim `app_metadata.rol`
  denormalizado, sincronizados en signup/invitación pero no ante un `update perfiles.rol` manual).
- `next-env.d.ts` con 1 línea autogenerada = ruido esperado del build (no es cambio real).

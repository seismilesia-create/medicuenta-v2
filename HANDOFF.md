# HANDOFF — MediCuenta V2 — 2026-06-14

> Documento de traspaso autocontenido. Si abrís una charla nueva, esto te da el contexto
> total: qué es el proyecto, qué está hecho, qué sigue, qué está bloqueado y cómo verificar.

---

## 0. Qué es MediCuenta (contexto en 30 segundos)

App de **facturación para médicos** de Catamarca (Argentina). Automatiza la presentación
manual a obras sociales. Es un proyecto de **monetización directa** (genera cash). Modelo
mental: el tenant es "el profesional" (médico es el primer vertical). Visión a futuro:
toda Catamarca → Argentina → otros profesionales; app B2B para círculos médicos; asistente
financiero (informar, nunca asesorar); versión agéntica vía MCP.

**UX clave:** el médico NO es técnico → claridad, menos clicks, automatización visible.

**Stack:** Next.js 16 (App Router, React 19, TS) · Tailwind · Supabase (Auth + DB + RLS) ·
Vercel AI SDK v5 + OpenRouter (modelo asistente: Claude Haiku 4.5) · Zod · deploy en **Vercel**.

**Patrón de código del proyecto (respetarlo):**
- **Lógica pura separada de efectos**: la decisión vive en `src/lib/**` (puro, testeable con
  vitest); los efectos (DB, email, WhatsApp) en services/actions/routes.
- **Cross-tenant del dueño**: la RLS es por médico (`auth.uid() = medico_id`). El superadmin
  NO rompe esa RLS: lee/escribe por **service-role** en server actions/funciones SECURITY
  DEFINER cerradas a `service_role` (REVOKE de PUBLIC/anon/authenticated + GRANT a service_role).
- Archivos ≤500 líneas, funciones ≤50, sin `any`, validar entradas con Zod, RLS siempre.

---

## 1. Estado actual

- **Línea de trabajo activa:** **Dashboard del dueño (Fases 4-5).** Última entrega:
  **F5 v1b — orquestador con entrega proactiva por email** (recién terminada).
- **Branch:** `feat/whatsapp-recetas-turnos`.
- **Último commit:** `300117d` *feat(5-v1b): orquestador con entrega proactiva por email*.
  El árbol está **limpio**. ⚠️ Este commit reescribió un auto-backup que ya estaba en
  `origin` → la rama local quedó `ahead 1, behind 1`. **Falta force-push**
  (`git push --force-with-lease`) para sincronizar origin.
- **Gates:** `npm test` → **219 verdes** · `npm run typecheck` OK · `npm run build` OK
  (la ruta `ƒ /api/cron/orquestador` aparece en el build). `npm run lint` está roto (deuda
  vieja, NO es gate).

---

## 2. Mapa completo de fases

### Fase 1-2 (base) ✅
Facturación: órdenes (carga por foto con OCR/visión), liquidaciones, débitos, cirugías,
nomenclador, reportes, pacientes. Auth + perfiles + RLS. Asistente IA de facturación (chat
que ayuda a cargar órdenes). Recetas electrónicas con cobro vía MercadoPago.

### Fase 3 — Consultorio / WhatsApp ✅ (pendiente prueba en vivo del dueño)
- **3A** Agenda estilo Google Calendar + asistente de turnos ✅
- **3B** Secretaria con acceso delegado (RLS por `puede_acceder_consultorio`) ✅ —
  pendiente prueba en vivo (gabriel@seismilesia.com en build de prod). Ver
  `scripts/test-rls-secretaria.sql`.
- **3C**:
  - Shell adaptativo celular/web ✅ (`e04e73d`): médico en celular = asistente puro (sin nav;
    la agenda la ve por su Google Calendar; los turnos se editan solo desde la compu).
    Detección sin parpadeo a prueba de rotación. `src/app/layout.tsx` + globals.css
    (`.only-phone`/`.only-web`) + `src/app/(main)/layout.tsx`.
  - Correlación turno→orden + control 15 min ✅ (`a436968`): al facturar con DNI propone la
    fecha/hora reales del turno (un click → `ordenes.turno_id`). Lógica
    `src/lib/consultorio/correlacion.ts`.
  - Bitácora del agente formalizada ✅ (`89acf64`): traza estructurada por turno en
    `wa_bitacora` (médico la ve en Config → "Actividad del asistente"). **Es la semilla del
    orquestador** — sus errores alimentan las alertas del panel del dueño.
  - **Espejo Google Calendar** ⏳ **BLOQUEADO** — necesita que el dueño cree proyecto Cloud +
    credenciales con **iaceleratech@gmail.com** (Gmail de pruebas definido). Tablas pendientes:
    `gcal_conexiones`, `wa_turnos.gcal_event_id`. Ver memoria `fase3c-google-cuenta-pruebas`.

### Fase 4-5 — Dashboard del dueño (LÍNEA ACTIVA)
Spec: `docs/superpowers/specs/2026-06-12-dashboard-dueno-superadmin.md` (leerla, está al día).

| Fase | Qué es | Estado |
|---|---|---|
| **F4.1** | Superadmin read-only (`/admin`, vista cross-tenant de médicos + costos) | ✅ `c25b5ed` |
| **F4.2a** | Planes Básico/Full + candado de funciones (feature-gating) | ✅ `9774a44` |
| **F4.2 redondeo** | Cartera de negocio + gestión de la prueba en el panel | ✅ `c68b0c0` |
| **F5 v1a** | Orquestador que **observa** (detecta y muestra alertas en `/admin`) | ✅ `e3d0dae` |
| **F5 v1b** | Orquestador que **avisa por email** (cron + digest + dedup + botón) | ✅ (esta sesión) |
| **F4.2b** | Trial sandbox (prueba gratis 15 días + dashboard demo) | ⏳ pendiente |
| **F4.3** | MercadoPago Suscripciones (cobro recurrente) | ⏸️ EN PAUSA (creds MP del hijo) |
| **F5 v1c** | Aviso por **WhatsApp** a Héctor | ⏳ pendiente (plantilla Meta) |

**Cómo funciona el panel hoy:** `/admin` (guardado por `resolverSuperadmin`) muestra cartera
(chips por plan/estado), métricas de costo (tokens IA 30d, mensajes WhatsApp con costo fuera
de ventana 24h, errores 7d), la sección "Orquestador" con las alertas detectadas, y la tabla
de médicos con selectores de plan/estado (cambio a mano hasta que entre MP). Datos por la
función SECURITY DEFINER `superadmin_metricas_medicos` (service-role).

---

## 3. F5 v1b — entrega proactiva por email (lo último que se hizo)

**Qué hace:** un cron diario (09:00 ART) corre el orquestador: lee las métricas de todos los
médicos, detecta alertas (reusa `detectarAlertas` de v1a) y, **si hay novedades respecto al
último aviso**, le manda a Héctor un email agrupado por gravedad. Si nada cambió, no manda
nada (dedup por cambio — un vigía no spamea). Hay un botón "Enviar resumen ahora" en `/admin`
que fuerza el envío para probar.

**Por qué email y no WhatsApp:** Meta solo permite mensajes business-initiated (fuera de la
ventana de 24h) con una **plantilla aprobada** (trámite de días). `sendWhatsAppText` actual
solo manda texto libre, válido dentro de la ventana. Por eso WhatsApp → v1c.

**Archivos (todos nuevos salvo el panel):**
- `src/lib/email/resend.ts` — cliente Resend por `fetch` (sin SDK; estilo `whatsapp/client.ts`).
- `src/lib/admin/digest.ts` (+ `digest.test.ts`, 7 tests) — arma asunto/HTML/texto + `firma`
  estable del set de alertas (para el dedup). **Puro.**
- `src/lib/admin/orquestadorEnvio.ts` — orquesta: métricas → alertas → digest → dedup → email.
  Resuelve destinatario (`ORQUESTADOR_EMAIL_TO` o el email del perfil `es_superadmin`).
- `src/app/api/cron/orquestador/route.ts` — GET protegido por `Authorization: Bearer CRON_SECRET`.
- `vercel.json` — cron `0 12 * * *` (12:00 UTC = 09:00 ART) → `/api/cron/orquestador`.
- `src/actions/orquestador.ts` — action `enviarDigestAhora` (guard superadmin, `forzar:true`).
- `src/features/admin/components/enviar-digest-boton.tsx` — botón en la sección Orquestador.
- `supabase/migrations/20260613_fase5_orquestador_avisos.sql` — tabla `orquestador_avisos`
  (bitácora de avisos + base del dedup). **YA APLICADA** en Supabase (vía MCP). Solo
  service-role la toca (RLS on + revoke PUBLIC + grant service_role). El advisor
  `rls_enabled_no_policy` en esta tabla es INFO y es **intencional**.

**⚠️ Para activarlo en producción (lo tiene que hacer Héctor):**
1. Crear cuenta gratis en **resend.com** → generar **API key** (~2 min). Con el remitente
   sandbox `onboarding@resend.dev` se puede enviar **al email de la propia cuenta** sin
   verificar dominio (justo lo que necesita: él se manda a sí mismo).
2. Setear 3 env vars en Vercel (y en `.env.local` para probar local). Ver `.env.local.example`:
   - `RESEND_API_KEY` — el key de Resend.
   - `ORQUESTADOR_EMAIL_TO` — el email donde quiere recibir el digest.
   - `CRON_SECRET` — un string largo random (protege el cron).
   - (opcional) `ORQUESTADOR_EMAIL_FROM` — solo si verifica un dominio para mandar a otra casilla.

**Probar local:** `npm run build && npm start`, luego:
`curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/orquestador`
→ responde `{ ok, enviado, motivo }`. Correrlo 2 veces: la 2ª da `motivo:'sin-cambios'`.
O directo: botón "Enviar resumen ahora" en `/admin` (fuerza, ignora el dedup).

---

## 4. Próximos pasos (priorizado)

1. **Sincronizar la rama**: el commit descriptivo `300117d` ya está local; falta
   `git push --force-with-lease` (reescribió un auto-backup ya pusheado).
2. **Activar F5 v1b** cuando Héctor traiga el API key de Resend (ver §3) — y probar el envío real.
3. **Elegir la próxima fase a construir.** Las construibles ya (sin esperar credenciales):
   - **F4.2b — Trial sandbox**: prueba gratis 15 días + dashboard demo (el médico se prueba a
     sí mismo, desambigua por su teléfono — DD8/DD9 de la spec). Parte se puede hacer ya
     (countdown, estados); la parte "real" depende de infra de WhatsApp de producción.
   - **F5 v1c — Aviso por WhatsApp a Héctor**: requiere plantilla Meta aprobada (trámite).
4. **Bloqueadas por el dueño / credenciales:**
   - **F4.3 MercadoPago Suscripciones** ⏸️ EN PAUSA hasta tener credenciales MP (cobranza va
     bajo el nombre del hijo monotributista). Ver memoria `facturacion-fiscal-mp`.
   - **Espejo Google Calendar** ⏳ bloqueado por credenciales Cloud (`iaceleratech@gmail.com`).
   - **Precios finales** (hoy rango: Básico US$25-30, Full US$55-65) — se cierran tras calcular
     costos con las métricas de §5.1 de la spec.
   - **Documento operativo de onboarding** + **contrato legal**.

---

## 5. Modelo operativo / comercial (definido por el dueño) — memoria `modelo-operativo-onboarding`

- **Héctor provee y es dueño de TODOS los números de WhatsApp** (los configura él); el servicio
  se cobra completo, números incluidos. El médico solo aporta su Gmail + datos. Ya soportado
  (canal por médico en `wa_canales`, service-role).
- **Dos planes:** **Básico = facturación** (+ asistente IA de facturación). **Full =** lo
  anterior **+** agenda, conversaciones, pacientes, asistente de WhatsApp (turnos/recetas/cobros)
  y secretaria. El candado de plan (F4.2a) ya lo hace cumplir server-side, no solo en el menú.
- **Prueba gratis: 15 días.** Cobranza: **MercadoPago Suscripciones** (F4.3, en pausa).
- **Cobranza fiscal:** bajo el nombre del hijo (monotributista). Ver memoria `facturacion-fiscal-mp`.

---

## 6. Lo que NO funcionó (no repetir)

- **`next dev` NO ejecuta el middleware** (Next 16.2.x). Los guards de rol/plan SOLO corren en
  build de producción (`npm run build && npm start`). Matar zombies:
  `pkill -9 -f "next dev"; pkill -9 -f "next-server"` antes de relanzar.
- **`REVOKE ... FROM anon, authenticated` no basta** (queda el grant a PUBLIC). Usar
  `REVOKE ... FROM PUBLIC` + `GRANT ... TO service_role`.
- **Haiku NO sirve como agente conversacional** (sí para OCR/visión).
- **El token de WhatsApp de Meta (test) vence en horas** — para pruebas largas hay que renovarlo.
- **`npm run lint` está roto** (deuda vieja, no es gate).
- Las **pruebas en vivo van en PRODUCCIÓN** (Supabase pago) — ver memoria `produccion-y-pruebas`:
  aplicar migraciones y reflaggear superadmin también allá. Migraciones siempre **aditivas e
  idempotentes** (`IF NOT EXISTS`); ver `docs/REGLAS-ACTUALIZACION.md`.

---

## 7. Datos de prueba (proyecto Supabase `eylcrxhpccwobipcjzal`)

> Este es el proyecto conectado por el MCP de Supabase y donde viven TODAS las migraciones de
> las fases 3/4/5 (se aplican vía MCP `apply_migration`). Las migraciones locales en
> `supabase/migrations/*.sql` son el espejo versionado.

- Médico: **admin@medicuenta.com** `924014ac-fb0a-4d9c-9028-49535e5e2e60` (flaggeado
  `es_superadmin = true` para probar `/admin`; con turnos: Quinteros DNI 3452167,
  Figueroa/Martinez DNI 23309087).
- Secretaria: **gabriel@seismilesia.com** `9e473632-...` (vínculo 'activa' con admin).
- Para designar superadmin:
  `UPDATE perfiles SET es_superadmin = true WHERE id = (SELECT id FROM auth.users WHERE email = '...');`

---

## 8. Pruebas en vivo pendientes (el dueño las hace en build de producción)

`npm run build && npm start` (NO dev — el middleware solo corre en prod):
1. **3B** secretaria: gabriel ve solo Consultorio, da turnos, NO ve facturación; rutas
   médico-only → redirigen a /agenda.
2. **3A** agenda mes/semana/día.
3. **3C celular**: abrir como médico en un teléfono real → debe verse SOLO el asistente.
4. **3C correlación**: orden por foto con DNI de un paciente con turno → aparece la sugerencia.
5. **3C bitácora**: Config → "Actividad del asistente".
6. **F5 v1b** (cuando haya Resend): botón "Enviar resumen ahora" en `/admin` → llega el email.

---

## 9. Comandos para verificar al retomar

```bash
cd ~/proyectos/Medicuenta-V2.0
git status                 # limpio
git log --oneline -5       # último: 300117d feat(5-v1b): ... (ojo: ahead/behind, falta force-push)
npm test                   # 219 verdes
npm run typecheck          # OK
npm run build              # OK, "ƒ Proxy (Middleware)" + "ƒ /api/cron/orquestador" presentes
```

## 10. Punteros

- **Spec del dashboard del dueño:** `docs/superpowers/specs/2026-06-12-dashboard-dueno-superadmin.md`
- **Spec Fase 3:** `docs/superpowers/specs/2026-06-11-fase3-panel-consultorio-design.md`
- **Reglas de actualización (no romper prod):** `docs/REGLAS-ACTUALIZACION.md`
- **Memorias** (en `.claude-ministerio/.../memory/MEMORY.md`): `modelo-operativo-onboarding`,
  `dashboard-dueno-superadmin`, `produccion-y-pruebas`, `facturacion-fiscal-mp`,
  `fase3c-google-cuenta-pruebas`, `fase3c-shell-adaptativo`.

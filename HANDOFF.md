# HANDOFF — MediCuenta V2 — 2026-06-16 20:51

> Sesión MUY larga y muy productiva. Se construyó y deployó a prod el **panel de onboarding de médicos COMPLETO**, se resolvió un bug de fondo (el prefetch de Gmail que quemaba los links de activación), y se agregaron mejoras (edición de médicos, home→dashboard, card de compartir QR del médico). Todo en producción y validado E2E. **Quedan 2 pruebas para el próximo chat.**

## Estado actual
- **Tarea**: Panel de onboarding de médicos — **COMPLETO y en producción**. Falta probar 2 cosas del ciclo de vida del médico (abajo).
- **Estado**: testing (validando el ciclo de vida del médico).
- **Branch**: `feat/whatsapp-recetas-turnos` (= `main`, todo pusheado; producción deploya de `main`).
- **Último commit ANTES de este handoff**: `76822bf` feat(dashboard): imprimir QR como poster A4 con leyenda y branding.

## Lo que se hizo esta sesión (resumen)
1. **Supabase a Pro** (in-place, mismo ref) — el bot 24/7 ya no se pausa.
2. **Panel de onboarding** (`/admin/medicos`): alta llave-en-mano (cuenta + perfil + servicio "Consulta" + cableado de nodo/slug/número), lista con estado, reintentar, **edición** de médicos, QR.
3. **Resend SMTP + dominio `seismilesia.com` verificado** (Cloudflare auto-configure) → emails de Auth en español. (El SMTP default de Supabase está capado a 2/h en cualquier plan.)
4. **Deploy a producción** (`medicuenta-v2.vercel.app`). `PUBLIC_BASE_URL` seteada en Vercel Production.
5. **Home del médico → `/dashboard`** (el shell responsive: escritorio = sidebar + dashboard + asistente a la derecha; celular = asistente puro; gating Consultorio por plan Full — TODO ya existía, solo faltaba el ruteo).
6. **Fix del prefetch de Gmail** (el bug grande — ver abajo).
7. **Contraseña**: 2 campos (Nueva + Repetir) con validación + **ojito** mostrar/ocultar.
8. **Card "Tu asistente de WhatsApp"** en el dashboard del médico: link `/c/slug` (copiar) + QR (copiar imagen + **imprimir póster A4**).

## Decisiones tomadas (con el "por qué")
- **Onboarding atómico vía RPC Postgres** (`onboard_medico_cablear`, SECURITY DEFINER, idempotente, FOR UPDATE para elegir nodo) — las 4 escrituras (perfil/servicio/asignación/recompute nodo) todo-o-nada. EXECUTE de las RPC **revocado a anon/authenticated** (solo service_role), igual que el patrón del repo (seguridad).
- **Reintento sin re-tipear**: la identidad se guarda en `raw_user_meta_data` del invite; `reintentarCableado` la relee.
- **`numero_personal` se guarda normalizado** (`normalizeRecipient`); la clasificación `esRemitenteMedico` normaliza ambos lados, así que es robusta.
- **Emails server-side con `verifyOtp({token_hash, type})`**, NO `exchangeCodeForSession` (eso es para OAuth/PKCE code flow).

## Lo que NO funcionó (NO repetir)
- **`exchangeCodeForSession` en el callback** → los invite/recovery de Supabase usan `token_hash`+`type`, no `code`. (corregido en `42cd724`).
- **`token_hash` directo al callback (un GET)** → **el escáner de seguridad de Gmail abre el link automáticamente segundos después de enviarse el email y QUEMA el token de un solo uso** antes de que el médico clickee (confirmado en logs de auth: IP de Google `153.67.7.222` consume el token → `One-time token not found` / `otp_expired`). El usuario llega con el token muerto → login imposible.
  - **SOLUCIÓN (commit `32bf530`)**: pantalla intermedia **`/activar`** (`src/app/activar/page.tsx`) que solo renderiza un botón; el botón hace un **POST** a la server action `activarCuenta` (`src/actions/auth.ts`) que recién ahí llama `verifyOtp`. Los escáneres hacen GET pero **nunca POST** → no pueden disparar la activación. **VALIDADO E2E**: el invite ahora cae en "Activá tu cuenta", botón, contraseña, entra.
- **`{{ .ConfirmationURL }}` en las plantillas de email** → va al `/verify` de GoTrue (que se quema con el prefetch). Hay que usar **`{{ .TokenHash }}` apuntando a `/activar`**.
- Confusión típica al testear: abrir un **email de invitación viejo** (de un intento anterior, con el link viejo). Borrar todos los mails viejos antes de probar.

## Próximo paso concreto (para el próximo chat)
**Probar las 2 cosas que quedaron del ciclo de vida del médico:**
1. **Cambiar la contraseña ESTANDO LOGUEADO** (no usa links → inmune al prefetch). Ubicar dónde está esa opción (probablemente `/perfil` o el dropdown del sidebar) y probar que funciona con los 2 campos + ojito.
2. **Que un PACIENTE saque turno por el bot:**
   - Poner el médico de prueba en plan **Full** (desde `/admin/medicos` o seteando la suscripción) → habilita el grupo Consultorio.
   - Cargar **horarios de atención + precio** en `/consultorio/config` (el bot los necesita para ofrecer turnos).
   - El "paciente" escribe al bot **desde OTRO número de WhatsApp** (NO el del médico; si no, lo toma como médico por `esRemitenteMedico`) usando el link `/c/<slug>` del médico.
   - Verificar el turno creado en `wa_turnos` (origen `bot`).

## Comandos para verificar estado al retomar
```bash
git status        # limpio, en feat/whatsapp-recetas-turnos (= main)
git log -3        # último: <hash del checkpoint> encima de 76822bf
curl -i https://medicuenta-v2.vercel.app/c/dr-prueba   # 302 (bot vivo)
curl -i https://medicuenta-v2.vercel.app/activar       # 200 (pantalla intermedia anti-prefetch)
```

## Archivos clave para releer en la próxima sesión
- `src/app/activar/page.tsx` + `src/actions/auth.ts` (`activarCuenta`) — **la solución del prefetch** (lo más importante).
- `src/app/api/auth/callback/route.ts` — callback con `verifyOtp` + `code` fallback.
- `src/features/dashboard/components/MiAsistenteWhatsapp.tsx` — card link/QR + póster A4 de impresión.
- `src/app/(main)/dashboard/page.tsx` + `src/app/(main)/layout.tsx` — el shell responsive del médico (gating por plan).
- `src/features/consultorio/` — config de horarios/asistente (necesario para que el bot ofrezca turnos).
- `src/features/whatsapp/` (runner, services/nodos, agent/tools) — el bot que agenda turnos.
- `supabase/migrations/20260616_onboard_medico.sql` — RPC de cableado + listado.

## Notas contextuales
- **Médico de prueba**: `hector.visiondeportes@gmail.com`. Al cerrar quedó con el invite VALIDADO (entró por `/activar`), plan **Básico** (sin Consultorio). Si no entra o quedó a medias, resetear su contraseña con SQL (`crypt(...)`) o **borrarlo y recrearlo**.
- **Borrar un médico** (DO block, ya usado varias veces esta sesión): `delete from auth.users where id = <id>` (las FK ON DELETE CASCADE limpian `perfiles`/`wa_asignaciones`/`wa_servicios`) + recomputar `wa_nodos.medicos_activos` por count. Resuelve el id por email.
- **Nodo piloto**: `numero_whatsapp = 543834884384`, capacidad 50, 1 médico activo (`dr-prueba` original del bot).
- **Plantillas de email en Supabase** (Authentication → Emails): Invite/Confirm signup/Magic Link/Reset Password — las 4 apuntan a `{{ .SiteURL }}/activar?token_hash={{ .TokenHash }}&type=<TIPO>&next=...`. Ya guardadas.
- Memoria del proyecto actualizada: `reference_medicuenta_emails_resend.md` (en `.claude/projects/.../memory/`).
- Tareas del tracker: 16 (todas done salvo #14 "home→dashboard" que quedó marcada pending por error pero SÍ se hizo y deployó — el código está en `src/app/page.tsx`).

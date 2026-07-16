# HANDOFF — MediCuenta V2 — 2026-07-16 (#1–#14 + correcciones post-E2E: TODO EN PROD; next = E2E manual)

## Estado actual
- **Tarea**: cerrada la tanda post-E2E (#1–#14) **y** las dos correcciones que salieron del E2E manual del agente médico. **TODO MERGEADO A MAIN Y DEPLOYADO A PROD** (deploys READY, health check OK).
- **Estado**: código completo y verificado (typecheck + **399 tests** + build verdes). Falta el **E2E manual** (de Héctor) — se corre **contra prod**.
- **Branch de trabajo**: `fix/agente-medico-post-e2e` (== `main`). La anterior, `mejoras-post-checklist`, también quedó mergeada.
- **Último commit**: `63c61a1`. **Rollback candidates**: `e9598b6` (antes de las correcciones) · `a9e3699` (antes del #14, con el parser de comandos).

## Próximo paso concreto
**E2E manual por WhatsApp + app** (requiere Héctor con teléfonos reales; NO es código). Ver el checklist completo abajo.

## Lo que se hizo hoy (2026-07-16)

### 1. #14 (agente médico del bot) → mergeado + deployado
La rama médico dejó de ser un parser de 4 comandos y pasó a ser un **agente de IA** (`runAgentTurn` + `buildMedicoTools` + `buildSystemPromptMedico`). **Prod ya NO tiene el parser.** El Callback de Meta ya apuntaba a prod → el bot responde con el agente sin reconfigurar nada.
Decisión de Héctor: mergear directo a main en vez de usar un preview, porque **los env vars de Preview están atados por rama** (`feat/whatsapp-recetas-turnos`) → un preview de otra rama arranca sin `WHATSAPP_APP_SECRET`/`ENCRYPTION_KEY`/`SUPABASE_SERVICE_ROLE_KEY`/`WHATSAPP_VERIFY_TOKEN` (webhook 401, bot muerto). Como no hay médicos reales, prod ES el entorno de pruebas.

### 2. Correcciones post-E2E (los 2 hallazgos de Héctor) → mergeadas + deployadas
- **La agenda contesta cualquier fecha.** `consultar_agenda({desde?, hasta?})` (fechas AR `YYYY-MM-DD`); default `DIAS_DEFAULT = 14`. Se **mató la ventana rodante** de N×24hs (era la causa de que "el jueves 23" quedara afuera al preguntar 12:08 del 16) → ahora son límites de **día calendario AR** vía `resolverRangoAgenda` (`src/lib/turnos/rangoAgenda.ts`, pura, 9 tests), que devuelve rango **y** descriptor juntos para que el encabezado no pueda mentir sobre la query. `DIAS_DEFAULT` se **interpola** en el system prompt y en la description de la tool → cero números hardcodeados.
- **La conversación médico↔bot salió de la bandeja de Conversaciones** (para nadie, ni el médico). Columna `wa_conversaciones.es_medico`; la marca `handleMedico` vía `ensureConversacion(..., true)`; la filtra `getBandeja`. Razón (Héctor): el médico la lee en su celular; no es conversación de paciente y la secretaria no tiene por qué verla. **La conversación sigue existiendo** (el agente necesita el historial para el confirm-precio multi-turno).
- **Migración `conversacion_medico` APLICADA a prod y verificada**: 1 conversación marcada (la del médico), 4 de pacientes intactas.

## Lo que atajaron los reviews (no repetir)
- **El system prompt seguía diciendo "próximos 7 días"** y no mencionaba el rango → contradecía al schema de la tool y le daba al agente señal EN CONTRA de la feature. Arreglado interpolando `DIAS_DEFAULT`.
- **El backfill de la migración matcheaba 0 filas, en silencio** (ver gotcha de teléfonos abajo). Probado contra prod: viejo → 0 filas, arreglado → 1.
- **`loadHistorial` mapeaba solo `'paciente'→'user'`** (#14): el historial del médico salía todo `'assistant'` → el modelo no tenía turno de usuario → el agente no funcionaba. Parametrizado con `userOrigen`.
- **La telemetría dentro del try** se tragaba una respuesta buena si fallaba → envuelta en try/catch interno best-effort en AMBOS handlers.

## Gotchas / no repetir
- **⚠️ TELÉFONOS (mordió 2 veces)**: `wa_contactos.telefono` = **crudo del webhook** (`549…`, 13 dígitos, CON el 9); `wa_asignaciones.numero_personal` = pasa por `normalizarWhatsappAr` (`54…`, 12 dígitos, SIN el 9). **El 9 es un dígito**, así que `regexp_replace(x,'\D','','g')` NO lo saca → comparar strings completos matchea **0 filas siempre, en silencio**. Comparar siempre por los **últimos 10 dígitos** (número nacional AR), como hace `normalizeRecipient`.
- **⚠️ ORDEN MIGRACIÓN→MERGE**: `ok()` (`panelService.ts:12`) hace `throw`. Si el código sale antes que la migración, la página de Conversaciones **explota** (42703), no se degrada. Nada lo automatiza (sin CI, sin step de migración, `vercel.json` solo tiene un cron). **Migración primero, siempre.**
- `DIAS_A_OFRECER = 14` (horizonte del paciente, `turnosService.ts:19`) y `DIAS_DEFAULT = 14` son numéricamente iguales pero **semánticamente distintos** — NO unificarlos.
- `.or()` de PostgREST no es seguro en UPDATE/DELETE.
- `bg-primary-500`/`success-*` no existen en el theme (Tailwind v3) → tokens semánticos.
- `npm run build` togglea `next-env.d.ts` — **NO commitear** (restaurar con `git checkout next-env.d.ts`).
- `npm run lint` está **pre-roto** (`next lint` mal configurado) — ignorar.
- Los env vars de **Preview están atados POR RAMA** → un preview de otra rama arranca sin secretos (webhook 401).
- El bot corre en webhook SIN sesión → tools con `db` service-role + `medicoId` inyectado. Los tools del asistente in-app NO son reutilizables (usan `createClient()`/RLS).

## ⚠️ Decisión de producto pendiente (no es bug)
Sacar la conversación del médico de la bandeja es un **filtro de UI, NO una barrera de RLS**: sigue existiendo y una secretaria con acceso directo a la API podría leerla. Héctor lo aceptó así (pidió que no *aparezca*). Si algún día se quiere la barrera real, el flag `es_medico` es justo lo que la policy necesitaría — y el 2º sitio a cubrir sería `getHilo` (`panelService.ts:372`), que trae por id sin filtrar.

## Minor follow-ups (1 ticket de baja prioridad — ninguno es correctness/security/data-loss)
- `rangoAgenda.ts`: el descriptor "el <día>" puede **sobre-prometer** cuando el piso es "ahora" (pedir `{hasta:'hoy'}` a las 12:08 dice "el jueves 16" pero cubre 12:08→23:59). Acotado: la tool empuja `desde==hasta`, que resuelve 00:00→23:59 y es honesto. Fix: emitir `hoy (de acá en más)`.
- `rangoAgenda.ts`: branches de error de `hasta` sin testear (espejo del path de `desde` que sí lo está); la de "no pude calcular" es **inalcanzable**.
- `rangoAgenda.test.ts`: el caso "solo hasta" no asserta el descriptor.
- Inversión en el último minuto del día AR (~60s/día): `{hasta:'hoy'}` a las 23:59 → error "el rango está al revés" en vez de rango vacío.
- `toolsMedico.ts`: `ayuda_plataforma` ignora el arg `tema`; la validación de `monto` es pura y extraíble a `isValidMonto` + test.
- `runner.ts`: el `registrarEvento` del outer catch sigue sin envolver → si tira, el fallback NO se manda (silencio; awaits secuenciales; pre-existente, espeja al paciente).
- `runner.ts`: el reply del médico no pasa por `sanitizarReplyCobro`/`scrubLinksMP` (inofensivo: sin tools de cobro, no es target de pago).
- `systemPromptMedico.ts`: guard no-clínico más suave que el "REGLA DURA" B4 del paciente (aceptable: audiencia = médico licenciado).

## Comandos para verificar estado al retomar
```bash
git branch --show-current   # fix/agente-medico-post-e2e (== main)
git log --oneline -3        # 63c61a1, ec31739, 5245f5f
git status                  # limpio
npm run typecheck && npm run test   # limpio + 399 verde
```

## Archivos clave
- `src/lib/turnos/rangoAgenda.ts` (+ `.test.ts`) — `resolverRangoAgenda`: rango + descriptor, día calendario AR.
- `src/features/whatsapp/agent/toolsMedico.ts` — las 4 tools del agente médico.
- `src/features/whatsapp/agent/systemPromptMedico.ts` (+ `.test.ts`) — prompt administrativo.
- `src/features/whatsapp/runner.ts` — `handleMedico` (agente) + `handlePaciente`.
- `src/features/whatsapp/services/conversaciones.ts` — `loadHistorial(userOrigen)` + `ensureConversacion(esMedico)`.
- `src/features/consultorio/services/panelService.ts` — `getBandeja` (filtra `es_medico`).
- `docs/superpowers/specs|plans/2026-07-16-correcciones-agente-medico*` — spec y plan.
- `.superpowers/sdd/progress.md` — ledger SDD (git-ignored): tasks, reviews, fixes, Minors.

## Notas contextuales
- Deploy: push a `main` dispara prod (Vercel `medicuenta-v2`). **Todo está en prod.**
- 399 tests (389 → +9 de `rangoAgenda` → +1 del prompt médico).
- Paciente de prueba: **Héctor Fernando Martinez, DNI 23309087**. Médico: **Medina Vazquez** (celu `543834222049`).
- Memoria del proyecto (se carga sola): `~/.claude/projects/-Users-hector-proyectos-Medicuenta-V2-0/memory/`.

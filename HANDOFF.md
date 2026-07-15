# HANDOFF — MediCuenta V2 — 2026-07-15 (#14 agente médico del bot COMPLETO + review final limpio; next = E2E manual)

## Estado actual
- **Tarea**: Tanda post-E2E en `mejoras-post-checklist`. **#1–#14 IMPLEMENTADOS y commiteados.** El **#14** (rama médico del bot = agente de IA) se ejecutó subagent-driven: implementer + review por-task + fix loop en cada task, y **review final del branch completo (Opus) = "Ready to merge: Yes"** (sin Critical/Important).
- **Estado**: #14 completo y verificado (typecheck + 389 tests + build verdes, árbol limpio). Falta el **E2E manual** (de Héctor). Rama NO mergeada.
- **Branch**: `mejoras-post-checklist` (junta #1–#13 + #14 + E2E pendiente; NO se mergea a main hasta pasar E2E).
- **Último commit**: `9aa21db` fix(bot): telemetría best-effort ya no descarta la respuesta del agente.

## Próximo paso concreto
**E2E manual por WhatsApp** (requiere Héctor con teléfonos reales; NO es código):
1. **Agente médico nuevo (#14)** — el médico le habla en lenguaje natural, ya no a un parser: pedir la agenda, el estado de recetas, "fijá la receta en $X" (el bot debe **CONFIRMAR el monto antes** de fijarlo), y ayuda de plataforma. Verificar: multi-turno + confirmación de precio + que un tool de **schema vacío** (`consultar_agenda`/`estado_recetas`) dispare OK con el proveedor (caveat del plan; hay precedente en prod con `solicitar_orden_consulta` que ya usa `z.object({})`, se espera que ande). El PDF de recetas del médico sigue igual (determinístico).
2. **Fase 8** — liberar receta por orden de consulta (desbloqueada por #1: ahora busca por **DNI**, no por `paciente_telefono` NULL).
3. **Fase 9** — cargar órdenes OSEP por foto.
- Paciente de prueba: **Héctor Fernando Martinez, DNI 23309087**. Médico configurado: **Medina Vazquez** (celu `543834222049`).

## Lo que se implementó esta sesión (#14, 4 commits sobre base `0720a62`)
1. **Task 1 `419d79f`** — `buildSystemPromptMedico` (prompt administrativo, NO clínico; confirmar monto antes de fijar; carga pesada órdenes/débitos/cirugías → derivar a la app) + test TDD. Fix de review: 2 asserts endurecidos (ligar "confirmá"↔`fijar_precio_receta` y carga-pesada↔"en la app" en la misma línea → una regresión que destripe la regla ahora falla el test).
2. **Task 2 `7f12672`** — `buildMedicoTools` (`src/features/whatsapp/agent/toolsMedico.ts`): 4 tools (`consultar_agenda`, `estado_recetas`, `fijar_precio_receta` [valida monto finito y >0], `ayuda_plataforma`). service-role + `medicoId` inyectado, sin sesión (webhook).
3. **Task 3 `138a374`** — `handleMedico` rama texto → `runAgentTurn` con esos tools + prompt (espejo de `handlePaciente`, sin toma-humana / entrega / scrub); borrados los 4 regex + `AYUDA_MEDICO`; cleanup de imports muertos. PDF intacto. **Fix de review (BLOCKER):** `loadHistorial` parametrizado con `userOrigen` (default `'paciente'` → rama paciente byte-idéntica); `handleMedico` pasa `'medico'` para que los mensajes del médico mapeen a role `'user'` (sin esto el historial salía todo `'assistant'` y el modelo no tenía turno de usuario → el agente médico no funcionaba).
4. **`9aa21db`** — hardening: `registrarUsoIa` + `registrarEvento(éxito)` envueltos en try/catch interno best-effort en AMBOS handlers (médico + paciente); un fallo de telemetría ya no descarta el reply ya generado (en paciente, tampoco el link de cobro). El fallo de `runAgentTurn` sigue disparando el fallback.

## Decisiones tomadas (Héctor, esta sesión)
- #14 alcance conversacional: NO cargar órdenes/débitos/cirugías por WhatsApp; NO OCR de orden (eso es Fase 9).
- Endurecer los 2 asserts de Task 1 (flag plan-mandated del review).
- Blocker de historial: **parametrizar `loadHistorial`** (no re-map local ni diferir).
- Telemetría: endurecer **AMBAS** ramas (no solo la médico) por consistencia; es un patrón pre-existente en prod, no una regresión del #14.
- Mantener la rama sin mergear; cerrar con este HANDOFF para retomar en E2E.

## Gotchas / no repetir
- `.or()` de PostgREST no es seguro en UPDATE/DELETE (viejo, sigue vigente).
- `bg-primary-500`/`success-*` no existen en el theme (Tailwind v3) → usar tokens semánticos.
- `npm run build` togglea `next-env.d.ts` (`./.next/dev/types/` ↔ `./.next/types/`) — **NO commitear ese cambio** (restaurar con `git checkout next-env.d.ts`).
- `npm run lint` está pre-roto (`next lint` mal configurado) — ignorar, no es del #14.
- `loadHistorial` mapeaba solo `'paciente'→'user'`: cualquier rama NUEVA de agente que reuse el historial debe pasar su `userOrigen`.
- El bot corre en webhook SIN sesión → los tools llevan `db` service-role + `medicoId` inyectado (los tools del asistente in-app NO son reutilizables tal cual: usan `createClient()`/RLS).

## Minor pendientes del review final (acceptable follow-ups — 1 ticket de baja prioridad, NINGUNO es correctness/security/data-loss)
- `ayuda_plataforma` ignora el arg `tema` (plan-verbatim; el modelo extrae lo relevante).
- validación de `monto` (`toolsMedico.ts`) y mapeo `origen→role` (`conversaciones.ts:167`) son puros → extraíbles a función + testeables sin mocks.
- outer-catch `registrarEvento` sin envolver en best-effort: si tira, el fallback `responder` NO se manda (silencio; awaits secuenciales; pre-existente, espeja al paciente; doble-falla de baja probabilidad).
- reply del médico no pasa por `sanitizarReplyCobro`/`scrubLinksMP` (inofensivo: el médico no tiene tools de cobro ni es target de pago). El review sugirió un comentario de 1 línea en `runner.ts:144` documentando la asimetría — **Héctor eligió NO agregarlo ahora**.
- guard no-clínico del médico (`systemPromptMedico.ts:9`) más suave que el bloque "REGLA DURA" B4 del paciente (aceptable: audiencia = médico licenciado, no consumidor; el riesgo Meta-compliance es la cara al paciente).

## Comandos para verificar estado al retomar
```bash
git branch --show-current   # mejoras-post-checklist
git log --oneline -4        # 9aa21db, 138a374, 7f12672, 419d79f
git status                  # limpio
npm run typecheck && npm run test   # limpio + 389 verde
```

## Archivos clave del #14
- `src/features/whatsapp/agent/systemPromptMedico.ts` (+ `.test.ts`) — prompt administrativo del médico.
- `src/features/whatsapp/agent/toolsMedico.ts` — las 4 tools del agente médico.
- `src/features/whatsapp/runner.ts` — `handleMedico` (ahora agente) + `handlePaciente` (hardening telemetría).
- `src/features/whatsapp/services/conversaciones.ts` — `loadHistorial` con `userOrigen`.
- `docs/superpowers/plans/2026-07-15-agente-medico-bot.md` + `specs/...-design.md` — plan y spec del #14.
- `.superpowers/sdd/progress.md` — ledger SDD del #14 (git-ignored; historial de tasks + reviews + fixes + Minors).

## Notas contextuales
- Deploy: push a `main` dispara prod (Vercel `medicuenta-v2`). Esta rama NO está en main → **nada del #14 está en prod**. Deployar cuando pase el E2E + Héctor lo diga.
- 389 tests baseline (subieron de 385 por los 4 del test del prompt médico). Los tools/runner NO se unit-testean (convención del repo → E2E).
- Memoria del proyecto (se carga sola): `~/.claude/projects/-Users-hector-proyectos-Medicuenta-V2-0/memory/`.

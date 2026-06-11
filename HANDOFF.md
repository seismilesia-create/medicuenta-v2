# HANDOFF — MediCuenta V2 (Fase 3: panel del consultorio) — 2026-06-11 ~23:55 ART

## Estado actual
- **Tarea**: **Fase 3 en marcha.** Spec completo aprobado por el dueño (brainstorm con visual companion, 13 decisiones) · **Etapa 3A parte 1 (motor del consultorio) COMPLETA y probada E2E en vivo** dos veces · **modelo del agente cambiado a Gemini 3.5 Flash** tras fallar Haiku en vivo · **plan de parte 2 (las 4 pantallas) escrito, commiteado y pusheado — listo para ejecutar**.
- **Estado**: working (cero pendientes de código; la parte 2 arranca de cero con su plan)
- **Branch**: `feat/whatsapp-recetas-turnos` (sincronizada con origin; **rebasada hoy sobre `origin/dev/gaby` `175efa4`**)
- **Último commit ANTES de este handoff**: `d03695a` docs(plan): Fase 3A parte 2

## Qué se hizo esta sesión (2026-06-11, sesión épica)
1. **Brainstorm de Fase 3** con visual companion (mockups en browser): 13 decisiones del dueño documentadas → spec `docs/superpowers/specs/2026-06-11-fase3-panel-consultorio-design.md` (D1–D13: pulir facturación sin rediseñar, secretaria con usuario propio, sobreturnos lista-sin-hora con cobro particular/sin_cargo, GCal espejo unidireccional, token OSEP en estudio, alarma necesita_humano, pacientes auto-armados por DNI, correlación turno→orden + control 15 min, OS suspendidas enchufables al círculo, etapas 3A→3B→3C, agenda "día protagonista", duración-de-consulta en vez de catálogo, semáforo rojo/verde/azul + colores por actor).
2. **Rebase sobre lo último de Gaby** (`175efa4`) — 66 commits sin conflictos.
3. **Plan parte 1** (`docs/superpowers/plans/2026-06-11-fase3a-parte1-motor-consultorio.md`) ejecutado completo con **subagent-driven development** (11 tasks, subagente fresco por task + doble review spec/calidad por cluster + review final de integración: "ready to close"). Los reviews cazaron y arreglaron: CHECK de formato en `wa_pacientes.dni`, regex con caracteres invisibles, observabilidad de errores tragados, contradicción del prompt con los AVISOS, tool-result mentiroso sin hilo.
4. **Migración 3A aplicada VÍA MCP de Supabase** (el dueño eligió esa vía sobre el SQL Editor — novedad de workflow) + backfill de `wa_pacientes` corrido e idempotente.
5. **E2E en vivo ronda 1 (Haiku 4.5): FALLÓ el modelo, no el código** — confirmaba turnos sin llamar `reservar_turno` (la abuela quedó sin turno mientras decía "agendado"), decía "ya avisé" sin llamar `avisar_consultorio`, alucinó "PAMI también suspendida", partió mal nombre/apellido con punto y coma. La bitácora y los logs probaron que el código aguantó todo.
6. **Cambio de modelo → `google/gemini-3.5-flash`** (`src/lib/ai/openrouter.ts`; OCR queda en Haiku; `ASSISTANT_MODEL=haiku` = rollback) + 3 reglas anti-mentira en el systemPrompt. **E2E ronda 2: TODO verde** (alarma real + ⚠️ en comando `turnos` + turno de Nora Quinteros existente + PAMI sin inventos). Smoke test del asistente interno (`/asistente`) con Gemini: OK (tools `navegar` y `consultar_nomenclador` andando).
7. **Plan parte 2** (`docs/superpowers/plans/2026-06-11-fase3a-parte2-panel-consultorio.md`, 13 tasks, 2561 líneas) con los patrones REALES de la casa mapeados (server actions + Zod, páginas wrapper-server + client components, polling 15s, errores inline) y las deudas de parte 1 incorporadas como Tasks 1–2.
- **Suite: 109 → 133 tests verdes** · typecheck y build limpios · 19 commits pusheados.

## Decisiones tomadas (con el "por qué")
- **Modelo del agente = Gemini 3.5 Flash** — criterio del dueño: *"IA sobrada antes que justa — no quemarse con los médicos"*. Guardado en memoria global del proyecto (`project_medicuenta_modelo_agente.md`). NO proponer downgrades por costo. OCR sigue en Haiku (validado E2E Fase 1).
- **Las 13 decisiones de producto viven en el spec** — no re-debatir; leer §2 del spec.
- **Migraciones por MCP de Supabase** — el dueño lo prefirió hoy sobre el SQL Editor manual; el archivo versionado en el repo sigue siendo la fuente.
- **Parte 2 = plan propio** escrito DESPUÉS de cerrar parte 1, mapeando componentes reales (método "mapear contexto antes de cada fase").
- **El dashboard superadmin + orquestador de Héctor** quedó capturado textual en el spec §12 — es el PRÓXIMO brainstorm después de Fase 3, no antes.

## Lo que NO funcionó (no repetir en próxima sesión)
- **Claude Haiku 4.5 como agente conversacional**: miente sobre tool-calls bajo presión multi-tool. NO volver salvo A/B explícito.
- **Túnel trycloudflare zombie** (loop "control stream encountered a failure"): matar y relanzar. **SIEMPRE verificar el túnel end-to-end con curl ANTES de dar la URL a Meta** (esta sesión se le dio a Meta una URL de túnel muerto y la verificación falló).
- **Prompts de fix con caracteres Unicode invisibles** (combining chars en regex): el subagente "no ve" la diferencia y reporta aplicado sin cambiar nada. Construir reemplazos programáticamente con `chr()` codes.
- (Vigentes de sesiones previas: pbcopy pisado por el dictado → pegar SIEMPRE en el chat · la shell pierde el cwd → `cd` absoluto en cada comando · token temporal de Meta vence en horas.)

## Próximo paso concreto
**Ejecutar el plan de parte 2**: `docs/superpowers/plans/2026-06-11-fase3a-parte2-panel-consultorio.md` — 13 tasks (motor de sesión T1–T7, navegación T8, pantallas /agenda /conversaciones /pacientes /consultorio/config T9–T12, verificación T13). Método recomendado y ya probado: **superpowers:subagent-driven-development** (subagente fresco por task, doble review por cluster, modelos: haiku para tasks mecánicas con código completo, sonnet para integración, reviewers en el modelo top). Task 1 arranca en `turnosService.ts`.

## Comandos para verificar estado al retomar
```bash
cd ~/proyectos/Medicuenta-V2.0
git status        # esperado: limpio
git log -3        # esperado: d03695a (+ commit de este checkpoint encima)
npm test          # esperado: 133 tests verdes (138 recién tras Task 3 de parte 2)
npm run typecheck # esperado: sin errores
```

## Archivos clave para releer en la próxima sesión
- `docs/superpowers/plans/2026-06-11-fase3a-parte2-panel-consultorio.md` — **EL documento a ejecutar** (decisiones de implementación + 13 tasks con código completo).
- `docs/superpowers/specs/2026-06-11-fase3-panel-consultorio-design.md` — el contrato de Fase 3 (13 decisiones, modelo de datos, etapas).
- `docs/superpowers/plans/2026-06-11-fase3a-parte1-motor-consultorio.md` — solo la sección "Notas del review para PARTE 2" (ya incorporadas al plan p2, sirve de contraste).
- `src/lib/ai/openrouter.ts` — la config del modelo nuevo con su decision record.

## Notas contextuales
- **Infra efímera APAGADA al cierre** (dev + túnel muertos). El webhook de Meta quedó apuntando a la URL muerta `surrey-notified-scholarships-interfaces.trycloudflare.com`. Al retomar pruebas con WhatsApp: levantar dev + túnel nuevo → **curl de verificación por el túnel** → actualizar webhook en Meta (verify token en `.env.local`) + `PUBLIC_BASE_URL` en `.env.local` → reiniciar dev → token de Meta probablemente vencido (renovar en panel → pegar en chat → actualizar `WHATSAPP_TEST_ACCESS_TOKEN` en `.env.local` → `node --env-file=.env.local scripts/seed-wa-canal.mjs 924014ac-fb0a-4d9c-9028-49535e5e2e60 543834403010`). **Para las tasks 1–12 de parte 2 NO hace falta túnel** (solo para el paso de intervención end-to-end del guion de T13).
- **Datos de prueba en la DB** (proyecto `eylcrxhpccwobipcjzal`): turnos activos = Quinteros Nora (PAMI, vie 12/06 09:00) · Figueroa Fernando (OSEP, vie 11:30, de Fase 2) · Martinez Hector Fernando (OSEP, lun 16/06 18:00) · `wa_pacientes` con 2 filas (DNI 23309087 y 3452167) · `wa_bitacora` con eventos reales · OS suspendidas: lista VACÍA (la OSEP de prueba se borró) · alarmas apagadas.
- **Migración 3A aplicada y verificada** (4 tablas + ALTERs). Las tablas base de MediCuenta siguen sin versionar (deuda conocida).
- **dev/gaby**: incluida hasta `175efa4`. Si pasan días antes de ejecutar parte 2, re-chequear `git fetch origin dev/gaby && git merge-base --is-ancestor origin/dev/gaby HEAD`.
- **Mockups del brainstorm** en `.superpowers/brainstorm/` (gitignored) — los layouts elegidos quedaron descriptos en el spec; no hace falta el companion para ejecutar.
- `npm run lint` sigue roto (deuda conocida, no es gate). La suite quedó en 133; el plan p2 espera 138 tras su Task 3.

# HANDOFF — MediCuenta V2 — 2026-07-15 (tanda post-checklist: #1–#13 hechos, #14 con plan listo)

## Estado actual
- **Tarea**: Tanda de ~14 mejoras post-E2E (rama `mejoras-post-checklist`). **#1 al #13 IMPLEMENTADOS y commiteados.** El **#14** tiene spec + plan escritos y aprobados, **listo para ejecutar** (no arrancado).
- **Estado**: working — #14 pendiente de ejecución; después queda re-correr Fase 8 + Fase 9 del E2E.
- **Branch**: `mejoras-post-checklist` (NO se mergeó a main; la rama junta toda la tanda + falta #14 + E2E).
- **Último commit ANTES de este handoff**: `43287b5` docs(plan): rama médico del bot = agente de IA (backlog #14)

## Próximo paso concreto
En sesión fresca: `/resume`, y ejecutar el **plan del #14** con **subagent-driven-development** (como se hizo el #13):
- Plan: `docs/superpowers/plans/2026-07-15-agente-medico-bot.md` (3 tasks, cada una verde; Task 1 es TDD del prompt).
- Base pre-#14 = `43287b5`. Al terminar el #14, re-correr **Fase 8** (liberar receta por orden de consulta — ya arreglada en #1) y **Fase 9** (cargar órdenes OSEP por foto) del checklist E2E.

## Lo que se implementó esta sesión (#1–#13, todos commiteados)
1. **#1 `53b3e34`** — liberar receta buscaba por `paciente_telefono` (NULL en vía OS) → ahora por **DNI** (`getPendientesPorDni`); campo DNI en `liberar-receta.tsx`. **Desbloquea Fase 8.**
2. **#2 `e46aca7`** — auth UX: el `Button` usaba `bg-primary-500` (escala inexistente en Tailwind v3) → texto blanco invisible; reescrito a tokens semánticos. + `traducirErrorAuth` (errores GoTrue → español, `lib/auth/errores.ts` +test). + error-boxes a `destructive`. + hint/placeholder unificados.
3. **#3 `66e70fb`** — `siteUrl()` caía a localhost fuera de Production → cadena de fallback `PUBLIC_BASE_URL → VERCEL_PROJECT_PRODUCTION_URL → VERCEL_URL → localhost` (+test).
4. **#4 `67ce574`** — toggle 24h/12h de horarios no hacía nada (`<input type=time>` ignora `lang`) → picker propio con selects (`lib/consultorio/horaFormato.ts` +test); guardado sigue 24h canónico.
5. **#5 `3698f71`** — OS suspendidas/no-atiendo: texto libre → `OsAutocomplete` contra el catálogo `aranceles_os`.
6. **#6 `01d1580`** — número de WhatsApp del médico sin `54` → el bot lo trataba como paciente (falla silenciosa). `normalizarWhatsappAr` (`lib/whatsapp/numeroAr.ts` +test, tolera +54/549/0/15), los 3 actions RECHAZAN si es inválido, componente `WhatsappInput` con +54 fijo.
7. **#7 `8100b92`** — quitado el campo "Teléfono" redundante del médico (3 forms + /perfil). Paciente NO tocado.
8. **#8 `6cc6fdc`** — enlace de secretaria: bloque persistente por invitación pendiente (sobrevive recarga); quitado el "Copiar enlace" redundante de la fila.
9. **#9 `f517b57`** — primer mensaje del bot paciente redundante → regla anti-duplicación en `buildSystemPromptPaciente` (solo-prompt).
10. **#10 `60aa7e4`** — ventana de gracia de 15 min para la disponibilidad de la secretaria (`estaDentroConGracia` en `slots.ts` +test).
11. **#11 `d15cd18`** — DOCUMENTADO el trade-off de privacidad de la búsqueda por nombre+DNI (nota de seguridad en `buscarPendientesPorIdentidad`; sin cambio de comportamiento, decisión de Héctor).
12. **#12 `a390943`** — JUBILADO el alta manual de médico (`inviteUserByEmail` frágil): borrada la ruta `/admin/medicos/nuevo`, `FormNuevoMedico`, `onboardMedico`, `chequearSlugDisponible`. Todo alta pasa por el flujo por enlace. Memoria de onboarding actualizada.
13. **#13 `83cb070`→`6ddff6b`** — config operativa para la secretaria (feature grande, ejecutada subagent-driven, review final opus = "Ready to merge"): `ctxOperativo` (médico dueño o secretaria vinculada, scopeado a `medicoActivoId` server-derived) + service-role; `guardarPrecioReceta` + `cargarConfigConsultorio` + tipo `ConfigVista`; precio separado de "El asistente"; `config-view` por rol; guard de página. Seguridad verificada en 5 ejes.

## #14 — spec + plan listos (NO ejecutado)
- **Spec**: `docs/superpowers/specs/2026-07-15-agente-medico-bot-design.md` (`709ebf3`).
- **Plan**: `docs/superpowers/plans/2026-07-15-agente-medico-bot.md` (`43287b5`).
- Convierte `handleMedico` (texto) de parser de 4 comandos a **agente de IA** espejo del paciente: `buildMedicoTools` (agenda, recetas, fijar precio con confirmación, ayuda) + `buildSystemPromptMedico` (administrativo, NO clínico), reusando `runAgentTurn`. PDF determinístico intacto. Writes pesados (órdenes/débitos) quedan en la app.
- **Alcance decidido con Héctor**: conversacional sobre lo existente (NO cargar órdenes/débitos por WhatsApp, NO OCR de orden = Fase 9).
- **Caveat E2E anotado en el plan**: verificar que un schema de tool sin params (`z.object({})`) no rompa con el proveedor de IA.

## Decisiones tomadas (con el "por qué")
- Toda la tanda va en `mejoras-post-checklist`, sin mergear a main hasta terminar #14 + E2E (Héctor: "van en esa rama").
- #12 jubilar (no convergir) el alta manual: el flujo por enlace ya lo reemplaza y es robusto; menos código frágil (elección de Héctor entre 3 opciones).
- #13 enfoque B (app-authz + service-role) sobre RLS: el precio vive en `wa_config_agente` junto a la personalidad → RLS no separa columnas; service-role sí. Consistente con `liberarReceta`.
- #14 alcance conversacional (no reuso completo del asistente in-app): sus tools usan sesión (RLS), el webhook no tiene sesión; y los writes pesados son mejores en la app.

## Lo que NO funcionó / gotchas (no repetir)
- **Plan del #13 tenía 2 huecos que atrapó la ejecución**: (a) `ActividadAsistente` usaba `medicoId` (que sacamos de ConfigView) → el subagente lo resolvió agregando `medicoId` a `ConfigVista` (review lo bendijo: autorizado por RLS de `wa_bitacora`); (b) el `refetch` perdió el `try/catch` original → spinner permanente si la action tira → arreglado en `6ddff6b`. Lección: al planear cutover de un componente grande, mapear TODAS sus secciones/props.
- **`bg-primary-500` etc. NO existen** en este theme (Tailwind v3, config solo define `primary.DEFAULT/foreground`). Usar tokens semánticos (`bg-primary`, `bg-destructive`).
- **`.or()` de PostgREST no es seguro en UPDATE/DELETE** (gotcha viejo, sigue vigente).
- **Next regenera `.next/types` tarde**: al borrar una ruta (#12), el typecheck falla por un validador obsoleto; limpiar `.next/types` + reiniciar dev server.

## Decisiones de PRODUCTO pendientes para Héctor (no son bugs)
1. **#13 — bitácora visible a la secretaria**: `ActividadAsistente` (ungated) muestra eventos origen `mp`/"Pagos" de recetas; la copy de invitación dice "nunca verá tu facturación ni las recetas". Autorizado por RLS + por el takeover de recetas de la secretaria. ¿Ocultarle las líneas de pago, o suavizar la frase de invitación?
2. **#2 — flags menores no tocados**: el success-box de `/forgot-password` usa `success-*` (familia que no existe en el theme) → mensaje "revisá tu correo" invisible; y `/login?error=enlace_expirado` (de `activarCuenta`) nunca se muestra. Ambos fuera del scope del #2.
3. **Minor #13 no arreglado (acordado "acceptable")**: `cargarConfigConsultorio` tiene 2 `as` casts sanos (narrowing por la anotación de retorno explícita). Fix más limpio si molesta: quitar la anotación de retorno.

## Comandos para verificar estado al retomar
```bash
git status                 # esperado: limpio (salvo este HANDOFF)
git log --oneline -3       # top: 43287b5 (plan #14), 709ebf3 (spec #14), 6ddff6b (fix #13)
git branch --show-current  # mejoras-post-checklist
npm run typecheck && npm run test   # esperado: limpio + 385 tests verde
```

## Archivos clave para releer en la próxima sesión
- `docs/superpowers/plans/2026-07-15-agente-medico-bot.md` — el plan a ejecutar (#14).
- `docs/superpowers/specs/2026-07-15-agente-medico-bot-design.md` — spec del #14.
- `src/features/whatsapp/runner.ts` — `handleMedico` (lo que se reescribe) + `handlePaciente` (el patrón a espejar).
- `src/features/whatsapp/agent/runAgentTurn.ts`, `agent/tools.ts`, `agent/systemPrompt.ts` — patrón de agente + tools + prompt del paciente.
- `.superpowers/sdd/progress.md` — ledger del #13 (git-ignored; referencia de lo hecho).

## Notas contextuales
- Deploy: push a `main` dispara prod (Vercel `medicuenta-v2`). Esta rama NO está en main → nada de la tanda está en prod todavía. Deployar cuando Héctor lo diga.
- Memoria del proyecto (se carga sola): `~/.claude/projects/-Users-hector-proyectos-Medicuenta-V2-0/memory/`. Actualizada: onboarding (#12 jubilar alta manual).
- Paciente de prueba: **Héctor Fernando Martinez, DNI 23309087**. Médico con todo configurado: **Medina Vazquez** (`1bee7847-…`, celu `543834222049`).
- 385 tests baseline (subieron desde 351 por los tests agregados en la tanda). El #14 suma ~4 (test del prompt médico).

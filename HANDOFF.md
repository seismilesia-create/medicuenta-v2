# HANDOFF — MediCuenta V2 — 2026-07-14 (E2E pausado)

## Estado actual
- **Tarea**: E2E completo del bot de WhatsApp (onboarding → recetas → turnos → cobro). **PAUSADO** a propósito para implementar la tanda de mejoras que se fueron anotando, y después retomar el checklist solo con lo que falta.
- **Estado**: testing (E2E pausado) + backlog de mejoras por implementar en rama nueva.
- **Branch**: `main` (este HANDOFF se commitea en main; el TRABAJO de mejoras va en una rama nueva `mejoras-post-checklist` que crea el próximo chat).
- **Último commit antes de este handoff**: `a9e3699` merge: fix cobro de receta (vincularPago .or en UPDATE)

## Plan que pidió Héctor (próximo chat)
1. Crear rama nueva **`mejoras-post-checklist`**.
2. Implementar **TODOS** los cambios de la sección "TANDA DE MEJORAS" de abajo (incluido el bug duro de liberar).
3. Recién después, **retomar el checklist E2E** solo con lo que faltó: **Fase 8** (liberar receta por orden de consulta) y **Fase 9** (cargar órdenes OSEP de consulta/práctica por foto).
- Checklist E2E (artifact, actualizado a v3 esta sesión): https://claude.ai/code/artifact/2856c3a4-503f-48bd-ab98-b99706283078

## Lo que se DEPLOYÓ a prod esta sesión (crítico, ya está vivo)
1. **B4 system prompt endurecido** (`1267116`): bloque "REGLA DURA" en `buildSystemPromptPaciente` — deflecta diagnóstico/qué-remedio/dosis/acción-farmacológica/precio-de-remedio + anti-jailbreak + excepción emergencia→107; carve-outs (costo de gestión + nombrar medicamento). **Validado en vivo**: el bot dijo "costo de gestión $8.000" nombrando el medicamento (el carve-out más riesgoso, PASÓ). Los casos clínicos/emergencia NO se llegaron a probar.
2. **FIX CRÍTICO cobro de receta** (`4b77ac7` + merge `a9e3699`): `vincularPago` (`recetasService.ts`) usaba `.or('paciente_telefono.is.null,eq.X')` sobre un **UPDATE** → PostgREST lo rechaza (`42703 column recetas.paciente_telefono does not exist`; el mismo `.or()` en SELECT anda) → **el link de MercadoPago NUNCA se generaba**, y el error se tragaba → el bot decía "ya gestionada desde otro número". Roto desde que se construyó (el E2E previo se frenó antes del cobro). Fix: 2 updates atómicos (`.is('paciente_telefono', null)` para reclamar + `.eq(tel)` si ya es suya) + `vincularPago` ahora devuelve `VinculoPago = {ok:true}|{ok:false,motivo:'conflicto'|'error'}` y loguea. **Validado end-to-end**: receta de $8.000 pagó + se entregó. LECCIÓN: `.or()` de PostgREST NO es seguro en UPDATE/DELETE; usar filtros separados.

## Estado del E2E (qué se validó / qué falta)
- **VALIDADO (Fases 0–7):** onboarding médico x2 (por enlace **y** manual/+nuevo), secretaria x2 (por enlace + **compartida multi-médico** con selector), config del bot (Fase 3), carga de recetas por PDF (Fase 5: 2 recetas, OCR ok — TADALAFILO + SILDENAFIL), **cobro MercadoPago (Fase 7: funcionó tras el fix)**. Ruteo multi-médico y desambiguación por apellido: ok.
- **PENDIENTE re-correr (después de las mejoras):**
  - **Fase 8** — liberar receta por orden de consulta: **BLOQUEADA por bug duro** (ver TANDA #1).
  - **Fase 9** — cargar órdenes OSEP (consulta / práctica) por foto: **no se corrió**.
  - Casos B4 (deflección clínica + emergencia 107) por WhatsApp desde el celu del paciente: no se probaron (solo pasó el carve-out del cobro).
- **Base de datos prod (NO es solo-superadmin):** 3 médicos — `dr-prueba` (superadmin, Admin MediCuenta, `924014ac-…`), `dr-medina-vazquez` (`1bee7847-…`, celu `543834222049`, precio $10.000, tiene día particular lunes + fecha 18/07 + OS suspendida `osdepym`), `dr-figueroa-vega` (`543834030950`, SIN config). 2 secretarias activas. Recetas de prueba varias (paciente de prueba: **Héctor Fernando Martinez, DNI 23309087**). Nodo: 3/50.

## TANDA DE MEJORAS a implementar (rama `mejoras-post-checklist`) — LISTA COMPLETA
> Los chips del app se resetearon con un restart a mitad de sesión; esta es la fuente de verdad. Varias son solo-prompt/UI chicas; 2 son grandes (mini-spec).

**Bugs / correcciones**
1. **BUG DURO — liberar receta por orden de consulta (bloquea Fase 8):** `getRecetasPendientesConversacion` (`src/actions/consultorio-recetas.ts`) → `getRecetasPendientesPorTelefono` (`recetasService.ts`) busca las recetas por `paciente_telefono`, pero en la vía OS (sin pago) ese campo es **NULL** → 0 resultados → la secretaria no puede liberar. La vía de liberación depende de un vínculo que solo crea la vía de pago. **Fix propuesto:** que la secretaria las encuentre por **DNI** (el que lee en el chat) vía `buscarPendientesPorIdentidad` — un campo DNI en el diálogo `src/features/consultorio/components/conversaciones/liberar-receta.tsx`.
2. **Auth UX (`/update-password` + `/login`):** (a) el botón de submit "Actualizar Contraseña" tiene contraste casi nulo (mismo color que el fondo) → se pierde; hacerlo botón primario visible, estado disabled atenuado-pero-visible, claro+oscuro. (b) errores de auth de GoTrue salen crudos EN INGLÉS: "Invalid login credentials" (login) y "Password is known to be weak and easy to guess…" (leaked-password protection, ACTIVADA en prod) → traducir todos al español (helper central). (c) unificar hint "Elige contraseña segura" vs placeholder "Mínimo 6 caracteres".
3. **`siteUrl()` frágil (`src/lib/site-url.ts`):** es `PUBLIC_BASE_URL || 'http://localhost:3000'`, y `PUBLIC_BASE_URL` está SOLO en el env Production de Vercel → cualquier link generado fuera del deploy de Production (preview / pestaña vieja clavada a un deploy previo) sale `localhost`. Pasó con el enlace de secretaria. **Fix:** fallback a `https://${VERCEL_PROJECT_PRODUCTION_URL}` y luego `https://${VERCEL_URL}` antes de localhost. Afecta TODOS los enlaces (médico, secretaria, recovery, callback, QR).

**Features / mejoras de UX**
4. **Toggle 24h/12h de horarios no funciona (`horarios-editor.tsx`):** cambia el atributo `lang` de un `<input type="time">` nativo, que Chrome ignora (el formato lo decide el locale del navegador) → la opción 24h no muestra "13:00". Es una feature de display REAL para el médico. Fix: picker propio (selects HH 00–23/MM) o read-out canónico que respete el toggle. NO tocar el guardado (siempre 24h canónico en `wa_horarios`).
5. **OS suspendidas/no-atiendo → autocomplete (`config-view.tsx`, componente `BloqueOs`):** hoy input de texto libre → cambiar por el componente **ya existente** `OsAutocomplete` (`src/features/catalogo/components/OsAutocomplete.tsx`) contra el catálogo `aranceles_os` (54 OS). Aplicar en los 2 bloques. Que se guarde el nombre canónico (matching del bot con `normalizarOs`).
6. **Campo Número de WhatsApp — forzar código de país 54:** en `FormAltaMedico.tsx`, `FormNuevoMedico.tsx`, `FormEditarMedico.tsx`. `normalizeRecipient` (`lib/whatsapp/client.ts`) NO agrega el 54; si el médico lo carga sin 54, el bot no lo reconoce (falla silenciosa — lo trata como paciente). Poner prefijo +54 fijo o validación (y contemplar el 0 de trunk y el 15).
7. **Quitar campo "Teléfono" redundante del médico:** en los 3 forms de alta/edición + `/perfil` (`PerfilForm.tsx`). El `telefono` del médico se recolecta pero NO se usa (el bot usa `numero_personal`). Dejar solo "Número de WhatsApp". OJO: los `telefono` del PACIENTE (turno-manual-form, sobreturno-form, wa contacto, paciente_telefono) NO se tocan.
8. **Secretaria — quitar "Copiar enlace" redundante de la fila (`config-view.tsx` sección Secretaria):** hay dos "Copiar enlace" (la fila de la lista, que usa `panelService.ts:612` y era la del localhost; y el bloque de abajo, que sale bien). Quitar el de la fila, o (mejor) mostrar el bloque visible del enlace también para invitaciones pendientes (persistente, para re-copiar tras recargar). NO tocar el panel de médicos `PanelInvitaciones.tsx` (ahí el re-copiar es intencional).
9. **Bot paciente — primer mensaje redundante (`systemPrompt.ts` `buildSystemPromptPaciente`):** usa el saludo configurado (que ya dice "turno o receta") Y encima el agente repite las opciones → largo. Regla en el prompt para no repetir, o mandar el saludo determinístico y que el agente arranque desde el 2do mensaje. Solo-prompt.
10. **Disponibilidad de la secretaria flexible (`horarioSecretaria.ts` `secretariaDisponibleAhora`):** hoy el bot solo deriva al paciente a la secretaria durante el horario EXACTO del médico; si la secretaria sigue en la compu 15 min después, igual rebota al paciente. Flexibilizar: gracia / presencia real / toggle manual / cola asíncrona. ACLARACIÓN: el botón "liberar" (`liberarReceta`) NO chequea horario — eso ya anda fuera de hora.

**Hardening / seguridad**
11. **Privacidad — búsqueda de receta por nombre+DNI (`recetasService.ts` `buscarPendientesPorIdentidad`):** cualquier número que sepa nombre+DNI de un paciente ve sus recetas pendientes y puede pagar una y recibir el PDF (con medicación + diagnóstico) en su celu. El candado anti-secuestro solo evita desviar la entrega de una receta YA reclamada. Evaluar factor adicional (código por-receta / pre-atar al teléfono del paciente) o documentar el trade-off. Severidad baja-media.
12. **Alta manual de médico frágil (`/admin/medicos/nuevo`, `onboardMedico` en `admin-medicos.ts`):** usa `inviteUserByEmail` → deja la cuenta con contraseña aleatoria de Supabase + depende del email (frágil); si el set-password falla (rechazo por leaked-password) pero entra por el link, queda cuenta confirmada SIN contraseña conocida (le pasó a Héctor). Convergir con el flujo por enlace (`createUser` con password, sin email) o jubilar el manual.

**Grandes (arrancar con mini-spec/brainstorm)**
13. **Dashboard secretaria — acceso a config OPERATIVA (`config-view.tsx` + guards + `consultorio-config.ts`):** hoy la secretaria no entra a `/consultorio/config`. Darle acceso SOLO a: horarios, duración, días bloqueados, días particulares, OS suspendidas/no-atiende, **precio de receta**. NO a: "El asistente" (nombre/tono/saludo), Conexiones, Secretaria. Requiere: (a) permitir el guard; (b) render condicional por rol; (c) **separar el precio de la sección "El asistente"**; (d) autorizar las server actions por rol EN EL SERVER (que no toque personalidad/conexiones/MercadoPago/invitar-secretarias); (e) operar sobre **`medicoActivoId`** (secretaria multi-médico, hay selector `ConsultorioSelector`).
14. **Rama médico del bot = agente de IA (`runner.ts` `handleMedico`):** hoy es un parser de 4 comandos regex (`precio N`, `recetas`, `turnos`, PDF); cualquier otra cosa → menú de ayuda. Héctor lo critica fuerte (el paciente le habla a un agente, el médico a un parser). Convertirlo en agente REUSANDO el asistente in-app del médico (`src/features/assistant/` — ya tiene system prompt + tools médico-facing: órdenes, débitos, liquidaciones). Comandos → tools; el PDF sigue determinístico; system prompt del médico distinto al del paciente (es administrativo, no clínico); confirmar acciones con efecto. Alineado con la visión agéntica del proyecto.

## Decisiones tomadas (con el "por qué")
- Deployar B4 y el fix de cobro DIRECTO a prod (sin esperar) — ambos críticos y de bajo riesgo (B4 es estrictamente más restrictivo; el cobro estaba 100% roto). El fix de cobro se verificó empíricamente contra prod (con revert) antes de escribirlo.
- NO setear el password del médico vía SQL — implica manejar la contraseña en texto plano; se guió a Héctor a hacer el reset por la app.
- El reset de la base a solo-superadmin se hizo al inicio del E2E (borró un médico de prueba viejo "Moreno"), pero después el propio E2E volvió a llenar la base (3 médicos, 2 secretarias, recetas) — está OK, es data de prueba.

## Lo que NO funcionó (no repetir)
- `.or('col.is.null,col.eq.X')` de supabase-js en un **UPDATE**: PostgREST tira `42703 column does not exist` (en SELECT anda). Usar dos operaciones/filtros separados.
- Tragarse el `error` de supabase-js y devolver solo un booleano: ocultó un bug crítico y hizo que el bot mintiera. Siempre chequear y loguear `error`.
- Confiar en el atributo `lang` de `<input type="time">` para el formato 24h/12h: Chrome lo ignora.
- Buscar recetas por `paciente_telefono` en la vía de orden de consulta: ese campo solo se llena al pagar.

## Próximo paso concreto
En el chat nuevo: `git checkout -b mejoras-post-checklist` y empezar por el **#1 (bug duro de liberar receta por DNI)** — es el que desbloquea la Fase 8. Después el resto de la TANDA (los solo-prompt/UI chicos son rápidos; #13 y #14 arrancan con mini-spec). Al terminar, re-correr Fase 8 + Fase 9 del checklist.

## Comandos para verificar estado al retomar
```bash
git status                 # esperado: limpio (salvo este HANDOFF si no se pusheó)
git log --oneline -4       # top: el commit del handoff, y debajo a9e3699 (fix cobro)
git branch --show-current  # main → crear mejoras-post-checklist
npm run typecheck && npm run test   # esperado: limpio + 351 tests ok
```

## Archivos clave para releer en la próxima sesión
- `src/features/whatsapp/services/recetasService.ts` — `vincularPago` (recién arreglado), `getRecetasPendientesPorTelefono` (el bug de liberar #1), `buscarPendientesPorIdentidad` (hardening #11).
- `src/actions/consultorio-recetas.ts` + `src/features/consultorio/components/conversaciones/liberar-receta.tsx` — flujo de liberar (fix #1).
- `src/features/consultorio/components/config/config-view.tsx` — config del consultorio (#5, #8, #13) + `horarios-editor.tsx` (#4).
- `src/features/whatsapp/agent/runner.ts` — rama médico (#14) y paciente.
- `src/lib/site-url.ts` (#3), `src/lib/whatsapp/client.ts` `normalizeRecipient` (#6).
- Onboarding: `src/actions/admin-medicos.ts` (`onboardMedico` #12), `FormAltaMedico/FormNuevoMedico/FormEditarMedico.tsx` (#6, #7), `src/actions/onboarding-medico.ts`.

## Notas contextuales
- Memoria del proyecto (se carga sola al inicio): `~/.claude/projects/-Users-hector-proyectos-Medicuenta-V2-0/memory/` — el bug de cobro ya está en `reference_medicuenta_bot_recetas_flow.md`; B4 en `project_medicuenta_b4_system_prompt.md`.
- Deploy: push a `main` dispara prod en Vercel (proyecto `medicuenta-v2`). `PUBLIC_BASE_URL` = `https://medicuenta-v2.vercel.app` (solo env Production — ver #3).
- Paciente de prueba para todo: **Héctor Fernando Martinez, DNI 23309087**. Médico con todo configurado: **Medina Vazquez** (celu `543834222049`).

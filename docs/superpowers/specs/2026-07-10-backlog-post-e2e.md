# Backlog post-E2E — correcciones y features nuevas

**Fecha:** 2026-07-10
**Contexto:** E2E full pausado tras la Fase 4. Surgieron varios bugs, mejoras de UX y features
por construir. Se corrige todo en tanda y después se retoma el E2E desde donde quedó
(el checklist HTML guarda el progreso local: https://claude.ai/code/artifact/2856c3a4-503f-48bd-ab98-b99706283078).

Cada ítem indica su fuente verificada (código/DB), no suposiciones.

---

## Track A — Arreglos directos (no requieren decisión de negocio)

### A1. Email vacío en `/perfil` del médico — BUG
- **Qué:** el campo Email del perfil sale siempre vacío.
- **Causa:** `PerfilForm.tsx` lee `perfil.email`, pero `perfiles` no tiene columna `email`
  (vive en `auth.users`). `perfil/page.tsx` tiene `user.email` de la sesión pero no lo pasa.
- **Fix:** pasar `user.email` de la sesión al form (readOnly). No agregar columna a `perfiles`.
- **Estado:** chip `task_96b519f6`.

### A2. Días bloqueados: duplicados y solapamientos — GAP
- **Qué:** se puede bloquear la misma fecha dos veces (aparecen como dos) y no avisa al solapar períodos.
- **Causa:** `bloquearDias` (`consultorio-agenda.ts` ~181-200) siempre inserta `kind:'closed'` sin validar.
- **Fix:** validar duplicado exacto ("Ese día ya está bloqueado") y solapamiento parcial
  ("Parte de ese período ya figura como no disponible").
- **Estado:** chip `task_8df63683`.

### A3. Horarios de atención en formato 24 hs — UX
- **Qué:** poder cargar/ver las horas en formato 24 hs vía un toggle 12h/24h.
- **Dónde:** `HorariosEditor` en `config-view.tsx`. Guardar siempre canónico; el toggle es de presentación.
- **Estado:** chip `task_8df63683`.

### A4. Panel de invitaciones de médicos — UX (4 sub-ítems)
- Feedback "¡Copiado!" en los dos botones de copiar.
- Reabrir el QR de una invitación anterior clickeándola en la lista.
- Mostrar de quién es el QR que se ve arriba.
- **Ojito** para ver la contraseña en el formulario público `/alta/[token]` (`FormAltaMedico.tsx`).
- **Estado:** chip `task_800994c7`.

### A5. Aclarar label "Nombre" en config del asistente — UX menor
- **Qué:** el campo que confundió es **"Nombre del médico"** (cómo se presenta el bot:
  "el consultorio del Dr. X"). No hay bug; el label ya dice "Nombre del médico".
- **Nota:** NO existe un campo de "nombre propio del asistente". Si se quiere que el bot
  tenga nombre (ej. "Sofía"), eso es feature → ver B4.

### A6. Limpieza menor (código muerto) — opcional
- `perfiles` no tiene `email` pero el tipo `Perfil` lo declara; `getPerfil` en `actions/perfil.ts`
  no tiene callers; `wa_config_agente.system_prompt` es columna muerta (el prompt se arma dinámico).

---

## Track B — Features / rediseño (requieren decisión antes de construir)

### B1. Onboarding de secretaria por enlace — FEATURE (prioridad de Héctor)
- **Problema actual:** la secretaria NO tiene enlace. `invitarSecretaria` solo deja
  `equipo_consultorio` en `pendiente` y **no manda ningún email**. La secretaria debe ir a
  `/signup` y registrarse con el mismo email → depende del email de confirmación de Supabase.
  **Gotcha grave:** si se registra ANTES de ser invitada, `handle_new_user` la crea como MÉDICO.
- **Rol ya funciona:** una vez secretaria, ve `/agenda` y `/conversaciones` pero no
  `/consultorio/config` (guards por rol ya implementados). Lo que falta es el ALTA, no los permisos.
- **Dirección propuesta:** replicar el patrón del médico — el médico genera un **enlace de
  invitación** para la secretaria; ella lo abre, define su contraseña, y la cuenta se crea con
  `admin.createUser` (rol secretaria, email confirmado, sin email frágil). Mata las dos cosas:
  el cuelgue del email Y el gotcha de "se registra como médico".
- **A decidir:** confirmar este enfoque; si el enlace lo genera el médico (no el superadmin);
  qué datos carga la secretaria.

### B2. Rediseño de "obras sociales" — DECISIÓN DE NEGOCIO
- **Hallazgo:** hay 3 listas de OS distintas y una está muerta:
  - "Obras sociales **habilitadas**" (en `/perfil`, `perfiles.obras_sociales`) → **no la lee nadie.** Decorativa.
  - "Obras sociales **suspendidas**" (config asistente, `wa_os_suspendidas`) → la que SÍ usa el bot:
    avisa al paciente "esa OS está suspendida, sería particular" y pregunta si reserva igual
    (mantiene la OS, no la cambia a particular sola).
  - `aranceles_os` → catálogo con códigos, para el cálculo de aranceles en órdenes.
- **A decidir:** ¿qué debe significar "habilitadas" y para qué sirve? ¿Se unifica con "suspendidas"?
  ¿El bot debe filtrar/avisar según lo que el médico habilita?

### B3. "Día particular" — FEATURE NUEVA
- **Hoy:** lo particular se decide turno por turno (`obra_social='particular'` o `cobro='particular'`
  en sobreturnos). NO existe marcar un día entero como "todo particular".
- **A decidir:** cómo se marca (excepción de día tipo `wa_excepciones`), y cómo lo comunica el bot
  al paciente que pide turno ese día con una OS.

### B4. System prompt del asistente endurecido — COMPLIANCE + COSTO
- **Hoy:** `buildSystemPromptPaciente` (`systemPrompt.ts`) ya prohíbe diagnósticos y está acotado
  por el tool-set (solo recetas/turnos). **Falta** explicitar: no precios de medicamentos, no
  posología, no acción farmacológica, y rechazar todo lo que no sea turno/receta (evita gasto de
  tokens y riesgo de penalización de Meta por responder fuera de alcance).
- **A decidir:** el alcance exacto permitido/prohibido; se puede redactar y revisar.

---

## Orden sugerido
1. **Track A** completo (bugs + UX): rápido, sin decisiones, quita ruido.
2. **B1 secretaria por enlace**: es la prioridad y reusa lo del médico (bien acotado).
3. **B4 system prompt**: contenido, mejora compliance ya.
4. **B2 + B3 obras sociales / día particular**: los más de negocio; brainstorm dedicado.
5. Re-correr el E2E desde donde quedó.

# Plan: Ajustes de 3A tras la prueba en vivo del dueño — 2026-06-12

## Contexto

El dueño probó el panel (parte 2 completa, 138 tests verdes) y pidió cambios de diseño en
**agenda** y **config**. Conversaciones y pacientes quedaron aprobadas tal como están.
Este plan cierra 3A: después de ejecutarlo viene la re-prueba del dueño y el commit de cierre.

**Feedback textual del dueño (2026-06-12):**
1. La agenda "cómo está puesta visualmente no me gusta. Que sea como la visual que tiene
   Google Calendar": vistas **mes / semana / día**, default **día actual**, y mantener
   los **sobreturnos al costado sin horario**.
2. "Config consultorio" en realidad es la **configuración del asistente de turnos** → renombrar.
3. Horarios de atención con el patrón de **Google Business** (toggle abierto/cerrado + franjas).
4. Días bloqueados: quedan como están.
5. OS suspendidas: quedan como están.
6. Campos del asistente "no me dicen nada... está horrible" → labels visibles + ayuda + ejemplo.

**Decisiones del dueño (AskUserQuestion 2026-06-12):**
- Vista día = **timeline estilo GCal con huecos marcados** (franjas punteadas "libre" clickeables,
  no espacio vacío puro): estética GCal sin perder la info de qué slots ofrece el bot.
- Alta de turnos **como GCal**: click en hueco de día y semana abre el alta con fecha/hora
  cargadas; en mes, click en un día navega a ese día.

> **Reemplaza la decisión D11 del spec** (`2026-06-11-fase3-panel-consultorio-design.md`):
> el layout "día protagonista con tira semanal" se descarta tras verlo construido.
> La vista semana-grilla SÍ se construye en el panel (ya no se delega al espejo GCal de 3C).
> Anotar el reemplazo en el spec (Task 7).

## Decisiones de implementación (mías, con el porqué)

| # | Decisión | Por qué |
|---|----------|---------|
| 1 | La ruta `/consultorio/config` NO cambia; solo textos (sidebar, h1, metadata). | KISS; al dueño le importa el nombre visible, no la URL. |
| 2 | Click en un turno del timeline abre **popover/modal chico** con detalle + acciones (cancelar / no vino / sí vino). | En bloques de 15-20 min los botones inline no entran. Es el patrón GCal (click → tarjeta). De paso paga la deuda "acciones apretadas". |
| 3 | Vista semana = lunes a domingo (semana calendario AR), navegable ◀ ▶. | Convención GCal local. |
| 4 | Sobreturnos en semana/mes: chip contador por día ("N sobre."); el detalle vive en la vista día (panel lateral, pedido explícito del dueño). | La fila all-day de GCal con tarjetas completas no entra en 7 columnas. |
| 5 | Timeline acotado a la jornada del día (min apertura/primer turno → max cierre/último turno), líneas por hora, **línea roja "ahora"** si el día es hoy. | GCal 0-24 desperdicia pantalla en un consultorio. La línea roja es EL gesto GCal. |
| 6 | Solapes de turnos (raro: solo si cambió la duración con turnos ya dados): ancho repartido en columnas greedy, máx 3. | Caso borde; no justifica el algoritmo completo de GCal. |
| 7 | Huecos clickeables solo dentro del rango ofrecible (hoy → +90 días, ver Task 1); pasado y más allá: solo turnos, sin huecos. | `getDisponibilidad` no genera pasado y la action valida contra slots ofrecidos. |
| 8 | `turnoManual` action pasa `dias` calculados hasta la fecha pedida (cap 90) a `getDisponibilidad`. | Con el default (14) un alta a 3 semanas desde la vista mes/semana sería rechazada con "ese horario ya no está libre". **El bot queda intacto**: sigue llamando con el default. |
| 9 | `getSemana` (tira) se elimina de panelService; nacen `getAgendaSemana` y `getMesContadores`. | Único consumidor era la tira, que muere. |
| 10 | Helpers de fechas de calendario (`lib/consultorio/calendario.ts`) con **tests** (TDD como armarDia): `inicioSemana`, `addDias`, `gridMes`, `diasDesdeHoy`. | Aritmética de fechas con AR_OFFSET es exactamente donde se esconden los off-by-one. |
| 11 | Horarios Google Business: toggle por día; OFF borra los bloques del día, ON crea bloque 09:00–13:00. La validación de solapes sigue server-side (`guardarHorarios`, patrón insert-antes-de-borrar intacto). | La mecánica multi-bloque ya existe y funciona; cambia solo la presentación. |
| 12 | Asistente: label + línea de ayuda ("qué hace y dónde impacta") + placeholder de ejemplo por campo; intro de sección; feedback "Guardado ✓" + disabled al guardar (paga deuda anti-doble-click de esta pantalla). | Pedido textual del dueño. |

## Patrones de auto-blindaje que aplican (del plan parte 2 — OBLIGATORIOS)

- #1 lecturas nuevas del service con helper `ok()` (throw).
- #2 error de acción se setea DESPUÉS del refetch (patrón `onAccion` se preserva).
- #3 epoch guard (`seq`) en todo refetch — ahora también al cambiar **vista** y **rango**.
- #4 en carga inicial, `error ? banner : spinner`.
- #5 montos con `parseMontoArs` (ya está en config-view; no regresionarlo).
- #7 literales verificados: `DIAS_A_OFRECER = 14` · `mp_conexiones.estado = 'conectado'`.
- #10 `guardarHorarios` inserta antes de borrar — el rediseño UI no toca esa action.

## Tasks

### Task 1: Datos — panelService + helpers de calendario + action
- `lib/consultorio/calendario.ts` (+ `.test.ts` primero, TDD):
  `addDias(fecha, n)`, `inicioSemana(fecha)` (lunes), `gridMes(anio, mes)` → matriz de
  semanas YYYY-MM-DD (relleno de meses vecinos), `diasDesdeHoy(fecha)`. Todo sobre
  strings YYYY-MM-DD con `AR_OFFSET` (cero `new Date()` sin offset).
- `panelService.ts`:
  - `getAgendaSemana(db, medicoId, lunes)`: turnos del rango (1 query) + `getDisponibilidad`
    (1 llamada, `dias = diasDesdeHoy(domingo) + 1`, cap 90, solo si el rango toca el futuro)
    + sobreturnos count por fecha + excepciones del rango → `{ fecha, items: ItemDia[],
    sobreturnos: number, bloqueado: boolean }[]` (armarDia por día).
  - `getMesContadores(db, medicoId, anio, mes)`: turnos + sobreturnos count por día +
    días bloqueados del mes → `Map<fecha, { turnos, sobreturnos, bloqueado }>`-like array.
  - Eliminar `getSemana` + `DiaSemana` (único uso: la tira que muere).
  - Todo con `ok()`.
- `actions/consultorio-agenda.ts` → `turnoManual`: `getDisponibilidad(supabase, user.id,
  servicios[0], Math.min(Math.max(diasDesdeHoy(d.fecha) + 1, 1), 90))`. El bot NO se toca.
- Gates: tests nuevos verdes + suite completa + typecheck.

### Task 2: Timeline — componente compartido + popover de turno
- `components/agenda/timeline-dia.tsx`: presentacional. Props: `{ fecha, items: ItemDia[],
  jornada: {desdeMin, hastaMin}, compacto?: boolean, onSlotClick(fecha, hora),
  onTurnoClick(turno) }`. Posicionamiento absoluto (top/height por minuto), líneas por hora,
  bloques con chip de estado (color por estadoEfectivo), franjas punteadas "libre",
  línea roja "ahora" si `fecha === hoy`, solapes en columnas greedy (máx 3).
  `compacto` (semana): solo apellido + hora, sin subtítulos.
- `components/agenda/turno-popover.tsx`: tarjeta flotante con datos completos del turno +
  acciones según estadoEfectivo (cancelar con confirm / no vino / sí vino), cierra con
  Escape/click afuera. Recibe `onAccion` del orquestador (no llama actions directo).

### Task 3: Vistas día / semana / mes + orquestador
- `components/agenda/header-agenda.tsx`: `◀ | Hoy | ▶` + título del rango (capitalizado
  es-AR) + selector segmentado `[Día | Semana | Mes]`.
- `vista-dia.tsx`: timeline (grande) + panel sobreturnos al costado (se muda intacto de la
  vista actual: lista ámbar sin hora, acciones, + Sobreturno, Bloquear este día).
- `vista-semana.tsx`: 7 columnas timeline `compacto` con escala de jornada compartida
  (min/max sobre los 7 días) + cabecera por día (nombre + fecha + chips "N sobre." /
  "BLOQUEADO") clickeable → navega a vista día. Scroll horizontal en pantallas chicas.
- `vista-mes.tsx`: grilla L-D, celdas con número + contador turnos/sobreturnos + estilo
  apagado para bloqueados y meses vecinos; click → vista día de esa fecha. Sin huecos.
- `agenda-view.tsx` (reescritura del orquestador, ~mismo tamaño): estado `{vista, fecha}`,
  default `('dia', hoy)`; navegación ◀▶ según vista (±1d/±7d/±1mes); fetch según vista
  (`getDia` / `getAgendaSemana` / `getMesContadores`) con epoch guard y polling 15 s;
  `onAccion` preservado; modals TurnoManualForm/SobreturnoForm/TurnoPopover.
  La tira semanal muere.
- Gates: typecheck + build + smoke visual de las 3 vistas.

### Task 4: Renombrar a "Asistente de turnos"
- `sidebar.tsx`: `{ name: 'Asistente de turnos', href: '/consultorio/config', icon: CalendarCog }`
  (si `CalendarCog` no existe en la versión de lucide: `Settings2` se queda).
- `consultorio/config/page.tsx`: metadata `'Asistente de turnos | MediCuenta'`.
- `config-view.tsx`: h1 "Asistente de turnos".

### Task 5: Horarios estilo Google Business (`horarios-editor.tsx`)
- Fila por día: nombre (L→D) + **toggle** (switch accesible `role="switch"`) +
  - ON: franjas apiladas (time – time + 🗑) + link "+ Agregar horario".
  - OFF: texto "Cerrado" gris. Toggle OFF descarta los bloques del día (en el estado local;
    se persiste recién con "Guardar horarios"). Toggle ON crea `09:00–13:00`.
- Misma action `guardarHorarios` (valida solapes server-side), mismo banner de error,
  misma nota "los turnos ya dados se respetan". Guard anti-doble-click ya existe (`saving`).

### Task 6: Campos del asistente con contexto (`config-view.tsx`)
- Intro de la sección: "Así se presenta y habla el asistente de WhatsApp con tus pacientes."
- Por campo → `<label>` visible + ayuda corta + placeholder ejemplo:
  - **Nombre del médico** — "Cómo se presenta: «Consultorio del Dr. Pérez»." ej. `Dr. Juan Pérez`
  - **Especialidad** — "La menciona al presentarse y al dar información." ej. `Clínica médica`
  - **Tono** — "Cómo les habla a los pacientes." ej. `cordial, claro y breve`
  - **Saludo inicial** — "Lo primero que dice cuando un paciente escribe. Vacío = saludo estándar." ej. `¡Hola! Soy el asistente del Dr. Pérez…`
  - **Precio de la receta** — "Monto que informa cuando piden receta (pesos)." ej. `5.000`
- Feedback al guardar: botón disabled + "Guardando…" → "Guardado ✓" (3 s). `parseMontoArs` intacto.

### Task 7: Verificación integral + spec
- Anotar en el spec el reemplazo de D11 (nota fechada, apuntando a este plan).
- Gates: `npm test` (138 + nuevos) · `npm run typecheck` · `npm run build`.
- Smoke Playwright solo-lectura: las 3 vistas de agenda + config renombrada cargan sin
  errores de consola.
- Invariantes de la casa: cero policies RLS tocadas · bot intacto (`turnosService` sin
  cambios; `turnoManual` action solo parametriza `dias`) · migraciones: ninguna.
- Re-prueba en vivo del dueño → commit de cierre de 3A.

## Fuera de alcance (no re-debatir)
- Drag & drop de turnos en el timeline (GCal lo tiene; el consultorio no lo pidió).
- Vista "3 días" mobile de GCal; la semana hace scroll horizontal y listo.
- Realtime (sigue polling 15 s) · edición de FAQs (v2) · resto de deudas menores anotadas.

## Notas de la ejecución (2026-06-12, misma sesión del feedback)

Ejecutado completo en sesión directa (sin subagentes implementers): 7 tasks, 8 commits, smoke
funcional autenticado por accesibilidad-snapshot + reviewer fresco del diff al cierre.
Gates finales: 153 tests (15 nuevos de calendario) · typecheck limpio · build OK · bot intacto
(diff vacío en `src/features/whatsapp/`, `src/lib/turnos/`, `supabase/`).

**Hallazgos del smoke + review (todos arreglados):**
- **CRÍTICO (cazado por el smoke visual, confirmado por el reviewer):** `position:absolute`
  ignora el `padding` del contenedor (el containing block es el padding box) — el gutter de
  horas con `pl-14` dejaba las etiquetas pintadas FUERA de la card. Patrón correcto: gutter
  como columna flex propia + área `relative flex-1` (como la regla de la vista semana).
- **IMPORTANTE (reviewer):** `getDia` derivaba `cerrado` de la disponibilidad (`!delDia`),
  que excluye pasado/post-último-slot/horizonte>90 — con la navegación libre nueva, ayer o
  "hoy a la noche" mostraban "Día sin atención". `cerrado` ahora es estructural
  (`wa_horarios` por weekday), igual que en `getAgendaSemana`.
- Menores (reviewer): la vista día no indicaba bloqueo por excepción (ahora banner ámbar +
  "Quitar bloqueo" + se oculta "Bloquear este día" para no duplicar) · popover sin Escape
  (agregado).

**Auto-blindaje nuevo (para 3B/3C):**
1. **Gutters/columnas fijas junto a capas `absolute`: SIEMPRE columna flex aparte, nunca
   `padding` del contenedor** — los hijos absolute se posicionan contra el padding box.
2. **"Cerrado/sin atención" se deriva de la ESTRUCTURA (horarios semanales + excepciones),
   nunca de la disponibilidad calculada** — la disponibilidad excluye pasado y horizonte y
   eso no significa cerrado.
3. **Editar archivos con el dev server + Fast Refresh corriendo rompe el smoke en vivo**: el
   HMR compila los estados intermedios entre dos Edits (JSX desbalanceado → overlay de error
   + spam de consola). Terminar TODOS los edits de un archivo antes de tocar el browser.
4. **`page.screenshot` de Playwright puede colgar** ("fonts loaded" → timeout) con la página
   activa; los snapshots de accesibilidad (`browser_snapshot`) son la vía confiable para
   verificación funcional — los screenshots son solo decorativos.
5. El método doble (smoke visual propio + reviewer fresco del diff) volvió a pagar: el smoke
   cazó el crítico visual ANTES que el reviewer, y el reviewer cazó el funcional (cerrado)
   que el smoke no podía ver navegando solo el hoy.

**Deudas menores nuevas (no bloquean):** TurnoManualForm/SobreturnoForm tampoco cierran con
Escape (consistencia pendiente con el popover) · franjas "libre" en vista semana sin texto
(solo title/hover) · `getMesContadores` cuenta turnos de meses vecinos visibles pero la celda
apagada puede confundir (aceptado: GCal hace igual).

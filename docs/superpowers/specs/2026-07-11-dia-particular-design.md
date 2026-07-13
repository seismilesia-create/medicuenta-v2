# Día particular (diseño B3)

**Fecha:** 2026-07-11 · **Backlog:** `docs/superpowers/specs/2026-07-10-backlog-post-e2e.md` (B3)
**Estado:** diseño aprobado por Héctor en brainstorm. Se apoya en B2 (obras sociales, ya en prod).

## Problema
El médico a veces atiende un día entero como **particular** (no recibe órdenes de consulta de OS ese día);
oficialmente el Círculo se lo prohíbe, pero en la práctica pasa. Hoy no existe forma de marcarlo: lo
particular se decide turno por turno. Falta poder decir "este día / los viernes = todo particular".

## Modelo
Dos formas de marcar un día particular, ambas soportadas:
- **Recurrente por día de la semana** (ej: los viernes) — aplica a todos, sin excepciones a la regla
  (decisión Héctor: "los viernes siempre particular").
- **Fecha puntual** (ej: 18/07) — un día suelto.

Un día es particular si su fecha está en la lista de fechas puntuales **o** su día de la semana está
en la lista de días recurrentes.

Ortogonal a los **días bloqueados** (`wa_excepciones` kind='closed'): bloquear = *no atiendo ese día*
(disponibilidad); particular = *atiendo normal pero cobro particular* (modo de cobro). Ejes distintos.

## Componentes

### 1. DB — tabla nueva `wa_dias_particulares`
Separada de `wa_excepciones` (que es de disponibilidad). Columnas:
```
id           uuid pk default gen_random_uuid()
medico_id    uuid not null references auth.users(id) on delete cascade
tipo         text not null check (tipo in ('semanal','fecha'))
dia_semana   smallint  -- 0=domingo .. 6=sábado (JS getDay / Postgres dow); null salvo tipo='semanal'
fecha        date      -- null salvo tipo='fecha'
created_at   timestamptz not null default now()
check ((tipo='semanal' and dia_semana is not null and fecha is null)
    or (tipo='fecha'   and fecha is not null and dia_semana is null))
unique (medico_id, tipo, dia_semana, fecha)  -- no duplicar el mismo día/fecha
```
- Índice por `medico_id`.
- **RLS** (espeja `wa_horarios`): el médico gestiona (CRUD) los suyos; la **secretaria** tiene SELECT
  delegado vía `puede_acceder_consultorio(medico_id)` (necesita leerlos para la agenda). El bot lee por
  service-client (bypassa RLS).
- Aplicar a prod con OK de Héctor (aditiva).

### 2. Lógica pura — `esDiaParticular`
`src/lib/consultorio/diasParticulares.ts`:
- `esDiaParticular(dias: { tipo: 'semanal'|'fecha'; dia_semana: number|null; fecha: string|null }[], fechaISO: string): boolean`
  — dada la lista del médico y una fecha (YYYY-MM-DD, hora argentina), devuelve true si esa fecha
  coincide con una fila `fecha` o si su día de la semana coincide con una fila `semanal`.
- El cálculo del día de la semana de la fecha usa los helpers de fecha AR ya existentes
  (`src/shared/lib/fechas.ts` / `src/lib/turnos/`), no `new Date()` a secas (timezone).
- Testeable con Vitest (lógica pura).

### 3. Config UI — sección "Días particulares" en `/consultorio/config`
- **Recurrentes:** siete casilleros (Lun–Dom); tildar/destildar marca ese día de la semana como
  particular (tipo='semanal').
- **Puntuales:** un input de fecha para agregar un día suelto + lista con botón para quitar cada uno.
- Server actions nuevas en `src/actions/consultorio-config.ts` (o un archivo hermano): agregar/quitar
  día semanal, agregar/quitar fecha puntual. `getConfig` (`panelService.ts`) devuelve los días particulares.
- Estilo/patrón igual a la sección "Días bloqueados" existente.

### 4. Bot — aviso en `reservar_turno`
En `src/features/whatsapp/agent/toolsTurnos.ts`, además del chequeo de OS suspendida (B2), chequear si
la **fecha del turno** es un día particular:
- Cargar los días particulares del médico (`getDiasParticulares(db, medicoId)` en `turnosService.ts`,
  espeja `getOsSuspendidas`).
- Si `esDiaParticular(dias, fechaDelTurno)` y la OS del paciente NO es "particular" y `os_confirmada` != 'si':
  devolver un aviso tipo *"AVISO: ese día el profesional atiende todo de forma PARTICULAR (se abona en el
  consultorio). Explicáselo al paciente y preguntale si quiere reservar igual. SOLO si acepta, llamá de
  nuevo con os_confirmada:'si'."* — **reutiliza el mismo mecanismo de confirmación** (`os_confirmada`) que
  las suspendidas. Guarda la OS del paciente (no la cambia), no revela precio.
- Si la OS ya cae en aviso por suspendida/no_atiende (B2), un solo aviso alcanza (no duplicar); el día
  particular es otra razón para el mismo aviso.

### 5. Agenda — señalar el día
Las vistas de agenda (`src/features/consultorio/components/agenda/` — vista-dia / vista-semana /
vista-mes) muestran una **etiqueta "Particular"** en el encabezado de los días que sean particulares.
- La data de la agenda incluye qué días del rango visible son particulares (calculado con
  `esDiaParticular` sobre las fechas del rango + la lista del médico).
- Solo visual; no cambia turnos ni disponibilidad.

## Lo que NO toca
- Días bloqueados (`wa_excepciones`) — otro eje, intacto.
- Órdenes / facturación — el aviso al cargar una orden en un día particular queda **fuera de alcance**
  (se puede sumar después).
- Lógica de precios — el plus sigue confidencial; el bot nunca dice el monto.
- No hay excepciones a la regla recurrente (un viernes recurrente-particular es SIEMPRE particular).

## Testing
- **Unit (`esDiaParticular`):** fecha puntual que coincide → true; día de semana recurrente que coincide
  → true; fecha que no está y cuyo weekday no está → false; combinación; borde de timezone (una fecha AR
  que en UTC caería en otro día → usa el weekday AR correcto).
- **Config UI (manual):** tildar "viernes" → aparece; agregar 18/07 → aparece en la lista; quitar → sale.
- **Bot (manual):** paciente pide turno un viernes (marcado particular) con OS → el bot avisa "ese día es
  particular" y reserva si acepta; un martes normal → sin aviso.
- **Agenda (manual):** un viernes y el 18/07 muestran la etiqueta "Particular".

## Archivos afectados (previsión)
- `supabase/migrations/<fecha>_dias_particulares.sql` (tabla + RLS).
- `src/lib/consultorio/diasParticulares.ts` + su `.test.ts` (nuevo, lógica pura).
- `src/actions/consultorio-config.ts` (o hermano): acciones agregar/quitar semanal + fecha.
- `src/features/consultorio/services/panelService.ts` (`getConfig` devuelve días particulares).
- `src/features/consultorio/components/config/config-view.tsx` (sección nueva).
- `src/features/whatsapp/services/turnosService.ts` (`getDiasParticulares`).
- `src/features/whatsapp/agent/toolsTurnos.ts` (chequeo en `reservar_turno`).
- `src/features/consultorio/components/agenda/*` (etiqueta en las vistas).

## Decisiones confirmadas
1. ✅ Recurrente (por día de semana) + puntual (fecha) — las dos.
2. ✅ Recurrente = por día de la semana (sin patrones más finos).
3. ✅ El bot pregunta la OS igual y al reservar avisa que el día es particular (mismo mecanismo que suspendidas).
4. ✅ Alcance: marcar + bot avisa + verlo en la agenda. (Aviso en órdenes fuera de alcance.)
5. ✅ Sin excepciones a la regla recurrente.

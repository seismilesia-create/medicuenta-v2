# Obras sociales — dos listas de excepción (diseño B2)

**Fecha:** 2026-07-11 · **Backlog:** `docs/superpowers/specs/2026-07-10-backlog-post-e2e.md` (B2)
**Estado:** diseño aprobado por Héctor en brainstorm.

## Problema
Hoy conviven tres nociones de "obra social" y una está muerta:
- **"Obras sociales habilitadas"** (`/perfil`, `perfiles.obras_sociales`, whitelist fija de 10) → **no
  la lee nadie**. Campo muerto que confunde.
- **"Obras sociales suspendidas"** (`wa_os_suspendidas`, cargada a mano por el médico) → la que SÍ usa
  el bot: si el paciente pide turno con una OS de la lista, avisa que es particular y ofrece reservar igual.
- `aranceles_os` → catálogo con códigos, para el cálculo de aranceles en órdenes (no se toca acá).

**Realidad del negocio (Héctor):** el médico está *obligado por el Círculo* a tomar TODAS las obras
sociales y no cobrar plus, pero en la práctica no se cumple: a veces **no toma** alguna OS, y a veces
hace un **día particular**. Por eso el modelo correcto es "toma todas por defecto + lista de excepciones",
no una whitelist.

## Modelo
Por defecto el médico atiende **todas** las obras sociales. Mantiene **dos listas de excepción**, y
cualquier OS presente en cualquiera de las dos → el bot la ofrece como **particular**:

1. **Suspendidas por el Círculo** — temporal, cambia mes a mes (motivo externo). Es la lista actual.
2. **Las que no atiendo** — permanente, decisión del médico. Nueva.

Decisión (Héctor): se **distinguen** en la UI (para que el médico recuerde sacar la del Círculo cuando
vuelve), pero el bot las trata **igual**.

## Comportamiento del bot (confirmado)
Sin cambios de lógica. Cuando la OS del paciente cae en cualquiera de las dos listas, el bot:
- avisa "esa obra social es particular, se abona en el consultorio",
- **no** le cambia la OS por su cuenta,
- **no** revela precio (respeta la confidencialidad del plus),
- **ofrece el turno igual como particular** si el paciente acepta (comportamiento actual, para ambas listas).

El bot ya lee toda la tabla `wa_os_suspendidas` (`getOsSuspendidas` / `esOsSuspendida`), así que al
agregar la segunda lista en la misma tabla queda cubierto automáticamente.

## Cambios

### 1. DB — columna `motivo` en `wa_os_suspendidas`
- `alter table wa_os_suspendidas add column motivo text not null default 'suspendida' check (motivo in ('suspendida','no_atiende'));`
- Valores: `suspendida` = suspendida por el Círculo (la lista actual); `no_atiende` = el médico no la toma.
- **OJO — no confundir con la columna `fuente` que ya existe** (`'manual'|'circulo'`): esa es el ORIGEN del
  dato (carga manual del médico vs futuro feed automático del Círculo), un eje distinto del `motivo`. Se dejan las dos.
- La UNIQUE es `(medico_id, nombre_os)`: una OS vive en UNA sola lista (no puede estar en las dos a la vez);
  intentar agregarla a la otra da "ya está en la lista". Aceptable.
- Prod hoy tiene la tabla vacía (reset del E2E) → no hay filas que migrar; el default cubre inserts futuros.
- El nombre interno de la tabla queda igual (`wa_os_suspendidas`) por compatibilidad con RLS/código;
  el `motivo` es lo que distingue las dos listas. La UI reetiqueta.
- Aplicar a prod con OK de Héctor (aditiva).

### 2. Config UI — `/consultorio/config`
- Partir la sección actual "Obras sociales suspendidas" en **dos bloques**:
  - **"Suspendidas por el Círculo (este mes)"** → filas `motivo='circulo'`.
  - **"Obras sociales que no atiendo"** → filas `motivo='medico'`.
- Cada bloque con agregar/quitar, mismo mecanismo de input que hoy (se duplica para el segundo).
- Las acciones `agregarOsSuspendida` / `quitarOsSuspendida` (`src/actions/consultorio-config.ts`)
  reciben un `motivo`. El listado (`getConfig` / `panelService.ts`) devuelve las OS separadas por motivo.

### 3. `/perfil` — eliminar el campo muerto
- Quitar la sección "Obras sociales habilitadas" de `PerfilForm.tsx` (líneas ~209-246), el campo
  `obras_sociales` del tipo/estado y del payload de `updatePerfil` (`src/actions/perfil.ts`), y la
  constante `OBRAS_SOCIALES` si queda sin uso.
- Dropear la columna `perfiles.obras_sociales` es **opcional** (cleanup); alcanza con dejar de leer/escribir.
  Verificar con grep que no queden otros consumidores (el mapeo indica que solo la usa la feature `perfil`).

### 4. Bot — cambio menor de redacción
- La lógica no cambia (`esOsSuspendida` / `reservar_turno` leen la tabla completa sin filtrar por motivo).
- **Único ajuste:** el texto que el tool le pasa al modelo hoy dice que la OS "está suspendida" — impreciso
  para las `motivo='medico'` (esas no están suspendidas, el médico no las toma). Generalizar el mensaje a algo
  neutro tipo "con este profesional esa obra social es particular (se abona en el consultorio)", que sirve para
  los dos motivos. Sin revelar precio.

## Relación con B3 (día particular) — siguiente
"Día particular" (atender un día entero como particular, ignorando órdenes de OS) es una **tercera
fuente** de particular, temporal y por día. Se diseña aparte (próximo brainstorm) y reutiliza el mismo
mensaje "particular" del bot. No se incluye en este spec.

## Testing
- **Unit:** `esOsSuspendida` con filas de ambos motivos (mismo resultado). Matching normalizado
  (mayúsculas/acentos) sigue funcionando.
- **Config UI:** agregar una OS a cada lista → aparece en el bloque correcto; quitar la saca solo de ese bloque.
- **E2E bot (manual):** paciente pide turno con una OS `medico` → el bot ofrece particular y reserva si acepta.
- **/perfil:** ya no aparece la sección de obras sociales; el resto del perfil sigue guardando bien.

## Archivos afectados (previsión)
- `supabase/migrations/<fecha>_os_motivo.sql` (nuevo).
- `src/actions/consultorio-config.ts` (`agregarOsSuspendida`/`quitarOsSuspendida` con `motivo`).
- `src/features/consultorio/services/panelService.ts` (`getConfig` separa por motivo).
- `src/features/consultorio/components/config/config-view.tsx` (dos bloques).
- `src/features/perfil/components/PerfilForm.tsx`, `src/actions/perfil.ts`, `src/features/perfil/types/perfil.ts` (quitar obras sociales).
- Verificar `src/lib/consultorio/osSuspendidas.ts` / `src/features/whatsapp/services/turnosService.ts` (sin cambios esperados).

## Decisiones abiertas / menores
- **Input al agregar una OS:** hoy es el mecanismo actual (a confirmar en el plan si es texto libre o
  autocomplete de catálogo). Usar el catálogo canónico (`aranceles_os`) mejoraría el matching con lo que
  tipea el paciente, pero es una mejora opcional — no se fuerza en este spec (YAGNI).

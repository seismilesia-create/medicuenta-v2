# Config operativa para la secretaria — Diseño

**Fecha:** 2026-07-15
**Backlog:** item #13 de `docs/superpowers/specs/2026-07-10-backlog-post-e2e.md`
**Rama:** `mejoras-post-checklist`

## Contexto

Hoy `/consultorio/config` es **médico-only**: el guard redirige a la secretaria a `/agenda`
(`if (!esDueño) redirect('/agenda')`). Todas las server actions de config usan `ctxDueño()`
(exige dueño, opera sobre `userId`). La secretaria no puede tocar nada de la operatoria del
consultorio aunque es quien la maneja día a día.

## Objetivo

Darle a la secretaria acceso a la config **operativa** del médico que está operando
(`medicoActivoId`), sin exponerle lo médico-only.

**La secretaria SÍ edita:** horarios, duración de la consulta, días bloqueados (excepciones),
días particulares, obras sociales suspendidas/no-atiende, y el **precio de la receta**.

**La secretaria NO ve ni toca:** "El asistente" (personalidad: nombre/tono/saludo/FAQs),
Conexiones (WhatsApp/MercadoPago), y la sección Secretaria (invitar/revocar).

## No-objetivos (fuera de alcance)

- No se construye el selector multi-consultorio: ya existe en el `Sidebar` (layout `(main)`,
  app-wide) y setea la cookie `consultorio_activo` vía `consultorio-seleccion.ts`. La config lo
  hereda. Una secretaria multi-médico cambia de consultorio desde el sidebar como en el resto
  de la app.
- No se cambia el modelo de suscripción/plan: el candado `plan === 'full'` se mantiene.
- No se toca el flujo del bot ni la agenda.

## Estado actual relevante (verificado)

- **Acceso:** `resolverConsultorio()` (`src/features/consultorio/access/contexto.ts`) devuelve
  `ctx = { userId, rol, medicoActivoId, medicos, plan, esSuperadmin }`. `medicoActivoId` se
  deriva **server-side** de `mis_consultorios()` + la cookie (que solo elige entre permitidos,
  no puede apuntar a un médico ajeno). `esDueño(ctx) = rol==='medico' && medicoActivoId===userId`.
- **RLS de la secretaria sobre las tablas de config** (migración `20260612_fase3b_secretaria.sql`):
  - `wa_horarios`, `wa_servicios`: **solo SELECT** (lee, no escribe).
  - `wa_os_suspendidas`, `wa_config_agente`, `wa_dias_particulares`: **médico-only** (ni SELECT).
  - Predicado de acceso: `public.puede_acceder_consultorio(medico_id)`.
- **El precio vive en `wa_config_agente`** (`precio_receta_default`), la MISMA tabla y fila que la
  personalidad (nombre/tono/saludo/faqs). RLS es a nivel fila → no puede separar columnas.
- **Carga de config:** `config-view.tsx` llama `getConfig(createClient(), medicoId)` con el
  **client del navegador (RLS)** → para la secretaria fallaría (no tiene SELECT en varias tablas).
- **Precedente de autorización:** `liberarReceta`/`ctxConsultorio` (`src/actions/consultorio-recetas.ts`)
  ya autorizan por `medicoActivoId` y luego escriben con `createServiceClient()`.

## Enfoque elegido: app-authz + service-role (Opción B)

Descartadas: (A) agregar RLS de escritura a 4-5 tablas — **no resuelve el precio** (columna dentro
de `wa_config_agente` médico-only) y es más migración; (C) híbrida — mezcla dos mecanismos para el
mismo feature. B es consistente con `liberarReceta`, sin migración, y separa precio de personalidad
de forma natural.

**Regla:** las operaciones operativas autorizan con un guard nuevo `ctxOperativo` (médico dueño **o**
secretaria vinculada, scopeado a `medicoActivoId` derivado server-side) y escriben/leen con
**service-role**. Lo médico-only sigue en `ctxDueño`. La seguridad se ancla en que `medicoActivoId`
nunca viene del cliente.

## Diseño

### 1. Guard `ctxOperativo` (`src/actions/consultorio-config.ts`)

```
async function ctxOperativo() {
  const r = await resolverConsultorio()
  if (!r) return { error: 'No autenticado' }
  if (!r.ctx.medicoActivoId) return { error: 'No estás operando ningún consultorio' }
  return { medicoId: r.ctx.medicoActivoId, userId: r.ctx.userId, esDueño: esDueño(r.ctx) }
}
```

- Pasan médico dueño (medicoActivoId===userId) y secretaria vinculada (medicoActivoId = su médico).
- `ctxDueño` se mantiene sin cambios para lo médico-only.

### 2. Las 6 actions operativas → `ctxOperativo` + service-role

`guardarHorarios`, `guardarDuracionConsulta`, `agregarOsSuspendida`, `quitarOsSuspendida`,
`agregarDiaSemanalParticular`, `agregarFechaParticular`, `quitarDiaParticular`, y la **nueva**
`guardarPrecioReceta`. Cada una:
- cambia `const c = await ctxDueño()` → `await ctxOperativo()`;
- usa `createServiceClient()` para el/los write(s), scopeados por `.eq('medico_id', c.medicoId)`.

La validación de negocio (solapes de horario, rangos de duración, normalización de OS, etc.) no
cambia.

### 3. Separar el precio de "El asistente"

- `agenteSchema` y `guardarAsistente` (siguen `ctxDueño`, médico-only): **se les quita**
  `precio_receta` / `precio_receta_default`. `guardarAsistente` upsertea solo personalidad
  (nombre/especialidad/tono/saludo/faqs).
- **Nueva** `guardarPrecioReceta(precio: number | null)` (`ctxOperativo` + service-role):
  ```
  upsert({ medico_id, precio_receta_default: precio, updated_at }, { onConflict: 'medico_id' })
  ```
  El upsert parcial actualiza solo `precio_receta_default` sin tocar la personalidad; si no hay
  fila, la crea con el resto en null (aceptable).
- Validación: `z.number().nonnegative().nullable()`.

### 4. Lectura de la config → server action `cargarConfigConsultorio`

Nueva server action en `consultorio-config.ts`:
- autoriza con `ctxOperativo`;
- corre `getConfig(createServiceClient(), medicoActivoId)` (service-role → funciona para ambos roles);
- devuelve un `ConfigVista`:

```
interface ConfigVista {
  esDueño: boolean
  // operativa (SIEMPRE)
  horarios; duracionMin; servicioId; excepciones; osSuspendidas; diasParticulares
  precioReceta: number | null            // extraído de agente.precio_receta_default
  // médico-only (null para secretaria)
  agente: { nombre_medico; especialidad; tono; saludo; faqs } | null   // SIN precio
  conexiones: { whatsapp; mercadopago } | null
  secretarias: SecretariaRow[] | null
}
```

- Para la secretaria, `agente`/`conexiones`/`secretarias` van en `null` → los datos médico-only
  **no llegan** al browser de la secretaria (no es solo ocultarlos en la UI).
- `config-view.tsx` deja de llamar `getConfig(createClient(), …)` y usa esta action (unifica
  médico + secretaria). El `refetch` interno también pasa por la action.

### 5. Guard de la página `/consultorio/config`

`src/app/(main)/consultorio/config/page.tsx`:
- Se mantiene: `if (!r) redirect('/login')` y `if (r.ctx.plan !== 'full') redirect('/dashboard')`.
- **Cambia:** `if (!esDueño(r.ctx)) redirect('/agenda')` → `if (!r.ctx.medicoActivoId) redirect('/agenda')`
  (secretaria revocada/sin vínculo queda afuera; médico y secretaria vinculada entran).
- Pasa a `ConfigView`: `medicoId={r.ctx.medicoActivoId}` (NO `userId`) y `esDueño={esDueño(r.ctx)}`.

### 6. UI condicional por rol (`config-view.tsx`)

- `ConfigView` recibe `esDueño: boolean` y consume `ConfigVista`.
- **Operativa (siempre):** Horarios · Duración · Días bloqueados · Días particulares ·
  OS suspendidas/no-atiende · **Precio de la receta** (sección nueva, movida fuera de "El asistente").
- **Médico-only (solo `esDueño`):** El asistente (personalidad) · Conexiones · Secretaria.
  Estas secciones se renderizan solo si `esDueño` (y para la secretaria los datos vienen `null`).

### 7. Las actions médico-only NO se debilitan

`guardarAsistente` (ya `ctxDueño`, ahora personalidad-only), las conexiones de MercadoPago, y
`invitarSecretaria`/`revocarSecretaria` deben seguir rechazando a la secretaria **en el server**.
Se verifica que conservan su guard de dueño (no se tocan salvo para confirmar). La UI que no las
muestra es cosmética; el guard del server es la defensa.

## Autorización — resumen

| Acción | Guard | Opera sobre | Escribe con |
|---|---|---|---|
| horarios, duración, OS, días particulares, precio | `ctxOperativo` | `medicoActivoId` | service-role |
| carga de config (`cargarConfigConsultorio`) | `ctxOperativo` | `medicoActivoId` | service-role (lee) |
| El asistente (personalidad), conexiones, invitar/revocar secretaria | `ctxDueño` | `userId` | (sin cambios) |

## Manejo de errores

- `ctxOperativo`/`ctxDueño` devuelven `{ error }` que las actions propagan (patrón actual).
- `cargarConfigConsultorio` con error de autz → la UI muestra "No pude cargar la configuración".
- Los writes service-role chequean y devuelven `error.message` (patrón actual).

## Verificación

Convención del repo: no hay unit-tests de services con Supabase (solo funciones puras en `lib/`).
Este cambio no agrega lógica pura nueva significativa. Verificación:
1. `npm run typecheck` + `npm run test` (sin regresiones).
2. Render throwaway de `ConfigView` con `esDueño={false}` (mock de `ConfigVista` de secretaria):
   confirmar que aparecen solo las secciones operativas + precio, y NO El asistente/Conexiones/
   Secretaria.
3. E2E manual (queda para el checklist): secretaria loguea → `/consultorio/config` entra →
   edita horarios/precio/OS y persiste sobre el médico correcto → NO ve personalidad/conexiones/
   secretaria. **Chequeo de seguridad:** una llamada directa a `guardarAsistente`/conexiones desde
   una sesión de secretaria devuelve error (server-enforced).

## Riesgos / edge cases

- **Precio upsert sin fila previa:** crea la fila de `wa_config_agente` con solo el precio
  (personalidad null). Aceptable; el médico la completa después.
- **Secretaria multi-médico:** cambia de consultorio con el selector del sidebar (cookie validada
  server-side). La config opera sobre el `medicoActivoId` resultante.
- **Médico operando OTRO consultorio** (medicoActivoId ≠ userId, p. ej. médico también vinculado a
  otro equipo): `ctxOperativo` lo trata como operador válido de ese consultorio (consistente con
  `puede_acceder_consultorio`). No es dueño → no ve personalidad/conexiones de ese médico.
- **`getConfig` con service-role igual consulta secretarias/conexiones/agente** aunque no se
  devuelvan a la secretaria: costo menor de queries, sin fuga (se filtran en el server).

## Cambios por archivo

- `src/actions/consultorio-config.ts`: nuevo `ctxOperativo`; 7 actions operativas → `ctxOperativo` +
  service-role; `guardarAsistente`/`agenteSchema` sin precio; nueva `guardarPrecioReceta`; nueva
  `cargarConfigConsultorio` (+ tipo `ConfigVista`).
- `src/features/consultorio/services/panelService.ts`: `getConfig` se mantiene sin cambios (se
  invoca con service-role desde la action). El tipo `ConfigVista` se define y exporta desde
  `src/actions/consultorio-config.ts` (junto a `cargarConfigConsultorio`).
- `src/app/(main)/consultorio/config/page.tsx`: guard `!medicoActivoId` en vez de `!esDueño`; pasa
  `medicoId={medicoActivoId}` + `esDueño`.
- `src/features/consultorio/components/config/config-view.tsx`: prop `esDueño`; usa
  `cargarConfigConsultorio`; secciones médico-only condicionadas a `esDueño`; sección nueva
  "Precio de la receta" (movida fuera de "El asistente"); el form de "El asistente" sin el precio.
- (Verificar, sin cambios esperados) actions de conexiones MP y `consultorio-secretaria.ts`:
  confirmar guard de dueño.

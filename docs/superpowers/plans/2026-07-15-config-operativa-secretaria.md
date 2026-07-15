# Config operativa para la secretaria — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a la secretaria acceso a la config operativa del consultorio (horarios, duración, días bloqueados/particulares, OS suspendidas, precio de receta) sin exponerle lo médico-only.

**Architecture:** Guard nuevo `ctxOperativo` (médico dueño o secretaria vinculada, scopeado a `medicoActivoId` derivado server-side) + escritura/lectura con service-role. Se separa el precio de `wa_config_agente` en su propia action. La UI renderiza secciones médico-only solo para el dueño.

**Tech Stack:** Next.js App Router (server actions), Supabase (service-role client), TypeScript, Zod.

## Global Constraints

- **Testing (convención del repo):** solo se unit-testean funciones puras en `src/lib/`. Los services/actions con Supabase y los componentes NO se unit-testean. Este feature no agrega lógica pura nueva → la verificación de cada task es `npm run typecheck` + `npm run test` sin regresiones (**385 tests baseline**). NO inventar tests con mock de Supabase.
- **Cada task queda con typecheck VERDE.** Las tasks están ordenadas para no romper el build entre commits (los cambios acoplados por la firma de `guardarAsistente` van juntos en la Task 3).
- **Seguridad:** `medicoActivoId` SIEMPRE viene de `resolverConsultorio()` (server-side), nunca del cliente. Las actions médico-only (`guardarAsistente`, conexiones MP, invitar/revocar secretaria) NO se debilitan.
- **Idioma/tono:** español rioplatense (voseo) en copy visible.
- **Precio:** vive en `wa_config_agente.precio_receta_default`; se escribe con upsert parcial (no toca personalidad).
- Rama: `mejoras-post-checklist`. Un commit por task.

---

### Task 1: Guard `ctxOperativo` + actions operativas a service-role

**Files:**
- Modify: `src/actions/consultorio-config.ts`

**Interfaces:**
- Produces: `ctxOperativo(): Promise<{ medicoId: string; userId: string; esDueño: boolean } | { error: string }>` (privada del módulo; la usan las Tasks 2 y 3).

Esta task es **aditiva + migración de cuerpos** (no cambia firmas públicas) → el resto del código sigue compilando.

- [ ] **Step 1: Agregar import de `createServiceClient` y el guard `ctxOperativo`**

En `src/actions/consultorio-config.ts`, tras los imports actuales agregar el import y, debajo de `ctxDueño`, el nuevo guard:

```ts
import { createServiceClient } from '@/lib/supabase/server'
```

```ts
/** Config OPERATIVA: la puede tocar el médico dueño O la secretaria vinculada, sobre el
 *  consultorio que están operando (medicoActivoId, derivado server-side). Las actions que la
 *  usan escriben con service-role (RLS de la secretaria no cubre estas tablas). */
async function ctxOperativo() {
  const r = await resolverConsultorio()
  if (!r) return { error: 'No autenticado' as const }
  if (!r.ctx.medicoActivoId) return { error: 'No estás operando ningún consultorio' as const }
  return { medicoId: r.ctx.medicoActivoId as string, userId: r.ctx.userId, esDueño: esDueño(r.ctx) }
}
```

- [ ] **Step 2: Migrar las 7 actions operativas a `ctxOperativo` + service-role**

En cada una reemplazar el arranque `const c = await ctxDueño(); if ('error' in c) return c; const { supabase, medicoId } = c` por:

```ts
  const c = await ctxOperativo()
  if ('error' in c) return c
  const { medicoId } = c
  const supabase = createServiceClient()
```

NO cambiar validaciones ni queries (siguen `.eq('medico_id', medicoId)`). Actions: `guardarHorarios`, `guardarDuracionConsulta`, `agregarOsSuspendida`, `quitarOsSuspendida`, `agregarDiaSemanalParticular`, `agregarFechaParticular`, `quitarDiaParticular`.

`guardarAsistente` NO se toca acá (sigue `ctxDueño`; se ajusta en la Task 3).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: sin errores (`ctxDueño` sigue usada por `guardarAsistente`).

- [ ] **Step 4: Tests**

Run: `npm run test`
Expected: `385 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/actions/consultorio-config.ts
git commit -m "feat(config): ctxOperativo + actions operativas a service-role (secretaria)

Nuevo guard ctxOperativo (médico dueño o secretaria vinculada, scopeado a
medicoActivoId server-side). Las 7 actions operativas (horarios, duración, OS,
días particulares) pasan de ctxDueño a ctxOperativo + service-role."
```

---

### Task 2: `guardarPrecioReceta` + `cargarConfigConsultorio` + tipo `ConfigVista`

**Files:**
- Modify: `src/actions/consultorio-config.ts`

**Interfaces:**
- Consumes: `ctxOperativo` (Task 1), `getConfig`/`ConfigConsultorio` de panelService.
- Produces: `guardarPrecioReceta(precio: number | null): Promise<{ ok: true } | { error: string }>`; `interface ConfigVista` (exportada); `cargarConfigConsultorio(): Promise<ConfigVista | { error: string }>`.

Todo **aditivo** (no toca `guardarAsistente` todavía) → typecheck sigue verde.

- [ ] **Step 1: Import de `getConfig`/`ConfigConsultorio`**

```ts
import { getConfig, type ConfigConsultorio } from '@/features/consultorio/services/panelService'
```

- [ ] **Step 2: `guardarPrecioReceta` (al final del archivo)**

```ts
/** Precio de gestión de receta (operativa: lo puede tocar la secretaria). Upsert parcial:
 *  escribe SOLO precio_receta_default, sin tocar la personalidad de la misma fila. */
export async function guardarPrecioReceta(precio: number | null) {
  const c = await ctxOperativo()
  if ('error' in c) return c
  if (precio !== null && (!Number.isFinite(precio) || precio < 0)) return { error: 'Precio inválido' }
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('wa_config_agente')
    .upsert(
      { medico_id: c.medicoId, precio_receta_default: precio, updated_at: new Date().toISOString() },
      { onConflict: 'medico_id' },
    )
  if (error) return { error: error.message }
  return { ok: true as const }
}
```

- [ ] **Step 3: `ConfigVista` + `cargarConfigConsultorio` (al final del archivo)**

```ts
/** Config para la vista del consultorio. Operativa SIEMPRE; personalidad/conexiones/secretarias
 *  SOLO para el dueño (null para la secretaria → no le llegan al browser). */
export interface ConfigVista {
  esDueño: boolean
  horarios: ConfigConsultorio['horarios']
  duracionMin: number
  servicioId: string | null
  excepciones: ConfigConsultorio['excepciones']
  osSuspendidas: ConfigConsultorio['osSuspendidas']
  diasParticulares: ConfigConsultorio['diasParticulares']
  precioReceta: number | null
  agente: Omit<NonNullable<ConfigConsultorio['agente']>, 'precio_receta_default'> | null
  conexiones: ConfigConsultorio['conexiones'] | null
  secretarias: ConfigConsultorio['secretarias'] | null
}

/** Carga la config del consultorio operado (medicoActivoId). Autoriza con ctxOperativo y lee
 *  con service-role (la secretaria no tiene RLS sobre varias tablas). Recorta lo médico-only. */
export async function cargarConfigConsultorio(): Promise<ConfigVista | { error: string }> {
  const c = await ctxOperativo()
  if ('error' in c) return c
  const cfg = await getConfig(createServiceClient(), c.medicoId)
  const personalidad = cfg.agente
    ? (({ precio_receta_default: _p, ...rest }) => rest)(cfg.agente)
    : null
  return {
    esDueño: c.esDueño,
    horarios: cfg.horarios,
    duracionMin: cfg.duracionMin,
    servicioId: cfg.servicioId,
    excepciones: cfg.excepciones,
    osSuspendidas: cfg.osSuspendidas,
    diasParticulares: cfg.diasParticulares,
    precioReceta: cfg.agente?.precio_receta_default ?? null,
    agente: c.esDueño ? personalidad : null,
    conexiones: c.esDueño ? cfg.conexiones : null,
    secretarias: c.esDueño ? cfg.secretarias : null,
  }
}
```

- [ ] **Step 4: Typecheck + Tests**

Run: `npm run typecheck && npm run test`
Expected: sin errores, `385 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/actions/consultorio-config.ts
git commit -m "feat(config): guardarPrecioReceta + cargarConfigConsultorio (lectura service-role)

guardarPrecioReceta (operativa, upsert parcial de precio_receta_default) y
cargarConfigConsultorio (ctxOperativo + service-role, recorta personalidad/
conexiones/secretarias para la secretaria). Tipo ConfigVista exportado."
```

---

### Task 3: Cutover de la UI — precio fuera de "El asistente", config-view por rol, guard de página

Esta task junta los cambios ACOPLADOS por la firma de `guardarAsistente` (sacarle el precio rompe la llamada en config-view) + el prop `esDueño` (page ↔ config-view). Van juntos para dejar el typecheck verde.

**Files:**
- Modify: `src/actions/consultorio-config.ts` (quitar precio de `guardarAsistente`/`agenteSchema`)
- Modify: `src/app/(main)/consultorio/config/page.tsx`
- Modify: `src/features/consultorio/components/config/config-view.tsx`

**Interfaces:**
- Consumes: `cargarConfigConsultorio`, `guardarPrecioReceta`, `type ConfigVista` (Task 2); `guardarPrecioReceta(number|null)`.
- Produces: `ConfigView({ esDueño }: { esDueño: boolean })`.

- [ ] **Step 1: Quitar el precio de `agenteSchema` y `guardarAsistente`**

En `consultorio-config.ts`: sacar la línea `precio_receta: z.number().nonnegative().nullable(),` de `agenteSchema`, y sacar `precio_receta_default: d.precio_receta,` del upsert de `guardarAsistente`. Queda:

```ts
const agenteSchema = z.object({
  nombre_medico: z.string().trim(),
  especialidad: z.string().trim(),
  tono: z.string().trim(),
  saludo: z.string().trim(),
  faqs: z.array(z.object({ pregunta: z.string().min(1), respuesta: z.string().min(1) })).max(20),
})
```

`guardarAsistente` sigue con `ctxDueño` (médico-only). El upsert sin `precio_receta_default` no pisa el precio (upsert parcial).

- [ ] **Step 2: Guard + props de la página**

`src/app/(main)/consultorio/config/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { resolverConsultorio, esDueño } from '@/features/consultorio/access/contexto'
import { ConfigView } from '@/features/consultorio/components/config/config-view'

export const metadata = {
  title: 'Asistente de turnos | MediCuenta',
}

export default async function ConfigPage() {
  const r = await resolverConsultorio()
  if (!r) redirect('/login')
  if (r.ctx.plan !== 'full') redirect('/dashboard') // candado §3: consultorio = Full
  // Config operativa: entra el médico dueño O la secretaria vinculada. Sin vínculo activo → afuera.
  if (!r.ctx.medicoActivoId) redirect('/agenda')
  return <ConfigView esDueño={esDueño(r.ctx)} />
}
```

(`ConfigView` ya no recibe `medicoId`: el server action `cargarConfigConsultorio` deriva el consultorio de `medicoActivoId`. Solo se pasa `esDueño`.)

- [ ] **Step 3: config-view — imports**

En `src/features/consultorio/components/config/config-view.tsx`:
- Quitar `import { createClient } from '@/lib/supabase/client'`.
- Quitar la línea `import { getConfig, type ConfigConsultorio } from '@/features/consultorio/services/panelService'` (ambos quedan sin uso).
- En el import de `@/actions/consultorio-config`, agregar `guardarPrecioReceta`, `cargarConfigConsultorio`, `type ConfigVista`. Debe quedar:

```ts
import {
  guardarDuracionConsulta,
  agregarOsSuspendida,
  quitarOsSuspendida,
  guardarAsistente,
  guardarPrecioReceta,
  agregarDiaSemanalParticular,
  agregarFechaParticular,
  quitarDiaParticular,
  cargarConfigConsultorio,
  type ConfigVista,
} from '@/actions/consultorio-config'
```

(Se conserva `import { parseMontoArs } from '@/lib/recetas/normalizar'` — se usa en el handler de precio.)

- [ ] **Step 4: config-view — `BloqueOs` tipo `cfg`**

En la firma del componente `BloqueOs` (nivel módulo) cambiar `cfg: ConfigConsultorio` → `cfg: ConfigVista`. (Solo usa `props.cfg.osSuspendidas`.)

- [ ] **Step 5: config-view — firma, estado, refetch**

Reemplazar la firma y el estado inicial de `ConfigView`:

```ts
export function ConfigView({ esDueño }: { esDueño: boolean }) {
  const [cfg, setCfg] = useState<ConfigVista | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [osSusp, setOsSusp] = useState({ nombre: '', nota: '' })
  const [osNoAt, setOsNoAt] = useState({ nombre: '', nota: '' })
  const [bloqueo, setBloqueo] = useState({ desde: '', hasta: '', nota: '' })
  const [fechaPart, setFechaPart] = useState('')
  const [agenteSaving, setAgenteSaving] = useState(false)
  const [agenteOk, setAgenteOk] = useState(false)
  const [precioOk, setPrecioOk] = useState(false)
  const [emailSec, setEmailSec] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [catalogoOs, setCatalogoOs] = useState<OsCatalogoItem[]>([])
```

Reemplazar `refetch` (ya no depende de `medicoId`):

```ts
  const refetch = useCallback(async () => {
    const r = await cargarConfigConsultorio()
    if ('error' in r) { setError('No pude cargar la configuración. Recargá la página.'); return }
    setCfg(r)
  }, [])
```

- [ ] **Step 6: config-view — sacar precio de `guardarAgente` + handler `guardarPrecio`**

En `guardarAgente`: borrar `const precio = String(fd.get('precio_receta') ?? '').trim()` y la propiedad `precio_receta: precio ? parseMontoArs(precio) : null,`. El objeto pasado a `guardarAsistente` queda:

```ts
      guardarAsistente({
        nombre_medico: String(fd.get('nombre_medico') ?? ''),
        especialidad: String(fd.get('especialidad') ?? ''),
        tono: String(fd.get('tono') ?? ''),
        saludo: String(fd.get('saludo') ?? ''),
        faqs: cfg?.agente?.faqs ?? [],
      }),
```

Agregar el handler debajo de `guardarAgente`:

```ts
  async function guardarPrecio(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const raw = String(fd.get('precio_receta') ?? '').trim()
    const ok = await onAccion(() => guardarPrecioReceta(raw ? parseMontoArs(raw) : null))
    setPrecioOk(ok)
    if (ok) setTimeout(() => setPrecioOk(false), 3000)
  }
```

- [ ] **Step 7: config-view — quitar el campo precio del form "El asistente"**

Borrar el bloque `<Campo label="Precio de la receta"> … <input name="precio_receta" … /> … </Campo>` de dentro del `<form onSubmit={guardarAgente}>`.

- [ ] **Step 8: config-view — nueva sección "Precio de la receta" (antes de "El asistente")**

Insertar justo antes de `<Seccion titulo="El asistente">`:

```tsx
      <Seccion titulo="Precio de la receta">
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Monto que el asistente informa cuando un paciente pide una receta. Dejalo vacío si no cobrás la gestión.
        </p>
        <form onSubmit={guardarPrecio} className="flex items-end gap-2">
          <Campo label="Monto en pesos" ayuda="Ej: 5.000">
            <input name="precio_receta" defaultValue={cfg.precioReceta ?? ''} placeholder="5.000" className={input + ' !w-36'} />
          </Campo>
          <button className="rounded-xl bg-primary text-white px-4 py-2 text-sm font-medium">Guardar precio</button>
        </form>
        {precioOk && <p className="text-sm text-emerald-600 font-medium">Guardado ✓</p>}
      </Seccion>
```

- [ ] **Step 9: config-view — condicionar secciones médico-only a `esDueño` + accesos null-safe**

Envolver `<Seccion titulo="El asistente">…</Seccion>`, `<Seccion titulo="Conexiones">…</Seccion>` y `<Seccion titulo="Secretaria">…</Seccion>` (cada una completa hasta su cierre) en `{esDueño && ( … )}`.

Dentro de esas secciones, como `cfg.conexiones`/`cfg.secretarias` son `null` en el tipo cuando no es dueño, ajustar accesos para TypeScript:
- `cfg.conexiones.whatsapp` → `cfg.conexiones?.whatsapp`
- `cfg.conexiones.mercadopago` → `cfg.conexiones?.mercadopago`
- `cfg.secretarias.map(` → `(cfg.secretarias ?? []).map(`
- `cfg.secretarias.length === 0` → `(cfg.secretarias ?? []).length === 0`

(La personalidad ya se lee con `cfg.agente?.…` optional-chaining en el código existente.)

- [ ] **Step 10: Typecheck + Tests (todo verde)**

Run: `npm run typecheck && npm run test`
Expected: sin errores, `385 passed`.

- [ ] **Step 11: Sanity de compilación de la ruta**

Con el server de dev corriendo (`preview_start { name: "dev" }`), navegar a `/consultorio/config` (redirige a `/login` sin auth) y revisar `preview_logs` (level error): sin errores de compilación/runtime de la ruta. (El render condicional real secretaria-vs-dueño queda para el E2E autenticado.)

- [ ] **Step 12: Commit**

```bash
git add src/actions/consultorio-config.ts "src/app/(main)/consultorio/config/page.tsx" src/features/consultorio/components/config/config-view.tsx
git commit -m "feat(config): config operativa para la secretaria (UI por rol + precio propio)

Precio sale de 'El asistente' (personalidad médico-only) a su sección operativa
(guardarPrecioReceta). ConfigView recibe esDueño y carga vía cargarConfigConsultorio;
las secciones médico-only (El asistente, Conexiones, Secretaria) se renderizan solo
para el dueño con acceso null-safe. La página deja entrar a la secretaria vinculada."
```

---

### Task 4: Verificar que las actions médico-only no se debilitaron

**Files:**
- Read: `src/actions/consultorio-secretaria.ts` + actions de conexión MercadoPago (localizar).

- [ ] **Step 1: Localizar y leer los guards**

Run:
```bash
grep -rn "ctxDueño\|esDueño\|resolverConsultorio\|export async function" src/actions/consultorio-secretaria.ts
grep -rln "mp_conexiones\|conectarMp\|desconectarMp\|mercadopago" src/actions --include='*.ts'
```
Expected: `invitarSecretaria`/`revocarSecretaria` y las actions de conexión MP gatean por dueño (`esDueño`/guard equivalente).

- [ ] **Step 2: Confirmar o corregir**

Si alguna action médico-only NO exige dueño, agregarle el guard de dueño. Si ya lo hacen, no tocar nada.

- [ ] **Step 3: Typecheck + Tests**

Run: `npm run typecheck && npm run test`
Expected: `385 passed`.

- [ ] **Step 4: Commit (solo si hubo cambios)**

```bash
git add -A
git commit -m "chore(config): reforzar guard de dueño en actions médico-only"
```

Si no hubo cambios, saltear el commit y anotarlo en el reporte.

---

## Cierre

Al terminar: la secretaria entra a `/consultorio/config`, edita solo lo operativo (horarios, duración, días bloqueados/particulares, OS, precio) sobre el médico que opera, y no ve ni toca personalidad/conexiones/secretaria. Pendiente: **E2E manual autenticado** (secretaria real) para el checklist, incluido el chequeo de que `guardarAsistente`/conexiones rechazan a una secretaria (server-enforced).

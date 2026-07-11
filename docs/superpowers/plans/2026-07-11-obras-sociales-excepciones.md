# Obras sociales — dos listas de excepción · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El médico mantiene dos listas de excepción de obras sociales (suspendidas por el Círculo / las que no atiende); ambas hacen que el bot ofrezca el turno como particular. Se elimina el campo "habilitadas" muerto de /perfil.

**Architecture:** Se agrega una columna `motivo` a `wa_os_suspendidas` (la tabla que ya usa el bot); la UI de config parte la sección en dos bloques filtrando por `motivo`; el bot no cambia su lógica (lee toda la tabla) salvo un ajuste de redacción del aviso. Se remueve la sección de obras sociales de /perfil.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase, TypeScript, Zod, Tailwind, lucide-react.

## Global Constraints
- NUNCA usar `any` (usar `unknown`); seguir el patrón de casteo de filas Supabase existente.
- Valores de `motivo`: `'suspendida'` (Círculo) | `'no_atiende'` (médico). Default DB `'suspendida'`.
- NO confundir `motivo` con la columna `fuente` ya existente (`'manual'|'circulo'` = origen del dato); se dejan las dos.
- El bot NO revela precio (plus confidencial) y NO cambia la OS por su cuenta; ofrece el turno como particular si el paciente acepta.
- Migraciones = espejo versionado; aplicar a prod requiere OK de Héctor (aditiva y segura).
- Tests: no hay lógica pura nueva; el gate es `npm run typecheck` + `npm run build` + suite existente verde + verificación manual.
- File naming kebab-case, funciones camelCase.

---

### Task 1 — Migración: columna `motivo`

**Files:**
- Create: `supabase/migrations/20260711_os_motivo.sql`

**Interfaces:**
- Produces: `wa_os_suspendidas.motivo text not null default 'suspendida' check (motivo in ('suspendida','no_atiende'))`.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/20260711_os_motivo.sql
-- Dos listas de excepción de OS: 'suspendida' (por el Círculo, temporal) y
-- 'no_atiende' (el médico no la toma, permanente). Ambas → el bot ofrece particular.
-- Ortogonal a la columna `fuente` ('manual'|'circulo' = origen del dato).
alter table public.wa_os_suspendidas
  add column if not exists motivo text not null default 'suspendida'
  check (motivo in ('suspendida','no_atiende'));
```

- [ ] **Step 2: (controller) Aplicar a prod con OK de Héctor**

Vía Supabase MCP `apply_migration` (name `os_motivo`). NO lo hace el implementer.

- [ ] **Step 3: Verificar**

```sql
select column_name, column_default from information_schema.columns
where table_schema='public' and table_name='wa_os_suspendidas' and column_name='motivo';
```
Expected: existe, default `'suspendida'`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260711_os_motivo.sql
git commit -m "feat(os): columna motivo en wa_os_suspendidas (suspendida | no_atiende)"
```

---

### Task 2 — Backend: `agregarOsSuspendida` con motivo + `getConfig` devuelve motivo

**Files:**
- Modify: `src/actions/consultorio-config.ts` (`agregarOsSuspendida`, ~líneas 83-98)
- Modify: `src/features/consultorio/services/panelService.ts` (tipo `ConfigConsultorio.osSuspendidas` ~línea 513, el select ~línea 545, el return ~línea 569)

**Interfaces:**
- Consumes: nada nuevo.
- Produces:
  - `agregarOsSuspendida(nombreOs: string, nota: string, motivo: 'suspendida' | 'no_atiende'): Promise<{ ok: true } | { error: string }>`
  - `ConfigConsultorio.osSuspendidas: { id: string; nombre_os: string; nota: string | null; motivo: 'suspendida' | 'no_atiende' }[]`

- [ ] **Step 1: `agregarOsSuspendida` recibe y valida `motivo`**

En `src/actions/consultorio-config.ts`, reemplazar la firma y el insert (líneas 83-98) por:

```ts
export async function agregarOsSuspendida(
  nombreOs: string,
  nota: string,
  motivo: 'suspendida' | 'no_atiende',
) {
  const c = await ctxDueño()
  if ('error' in c) return c
  const { supabase, medicoId } = c
  if (motivo !== 'suspendida' && motivo !== 'no_atiende') return { error: 'Motivo inválido' }
  // Normalizada al guardar (review parte 1): el UNIQUE es sensible, el match no.
  const nombre = normalizarOs(nombreOs)
  if (!nombre || nombre === 'particular') return { error: 'Nombre de obra social inválido' }
  const { error } = await supabase
    .from('wa_os_suspendidas')
    .insert({ medico_id: medicoId, nombre_os: nombre, nota: nota.trim() || null, motivo })
  if (error) {
    if (error.code === '23505') return { error: 'Esa obra social ya está en tus listas' }
    return { error: error.message }
  }
  return { ok: true as const }
}
```

- [ ] **Step 2: `getConfig` incluye `motivo`**

En `src/features/consultorio/services/panelService.ts`:
- En el tipo `ConfigConsultorio` (~línea 513), cambiar:
  ```ts
  osSuspendidas: { id: string; nombre_os: string; nota: string | null; motivo: 'suspendida' | 'no_atiende' }[]
  ```
- En el select (~línea 545), agregar `motivo`:
  ```ts
  db.from('wa_os_suspendidas').select('id, nombre_os, nota, motivo').eq('medico_id', medicoId).order('nombre_os').then(ok),
  ```
  (el return ~línea 569 castea a `ConfigConsultorio['osSuspendidas']`, así que no hace falta tocarlo más allá de que el tipo ahora incluye `motivo`.)

- [ ] **Step 3: Verificar tipos**

Run: `npm run typecheck`
Expected: falla SOLO en `config-view.tsx` (el caller de `agregarOsSuspendida` todavía pasa 2 args) — se arregla en la Task 3. Confirmá que el error es ese y no otro.

- [ ] **Step 4: Commit**

```bash
git add src/actions/consultorio-config.ts src/features/consultorio/services/panelService.ts
git commit -m "feat(os): agregarOsSuspendida con motivo + getConfig lo expone"
```

---

### Task 3 — Config UI: dos bloques

**Files:**
- Modify: `src/features/consultorio/components/config/config-view.tsx` (sección "Obras sociales suspendidas", ~líneas 219-260, y el estado `osNueva` ~línea 41)

**Interfaces:**
- Consumes: `agregarOsSuspendida(nombre, nota, motivo)`, `quitarOsSuspendida(id)`, `cfg.osSuspendidas` con `motivo` (Task 2).

- [ ] **Step 1: Estado para los dos formularios de alta**

Reemplazar la línea del estado `osNueva` (~41) por dos:

```tsx
  const [osSusp, setOsSusp] = useState({ nombre: '', nota: '' })
  const [osNoAt, setOsNoAt] = useState({ nombre: '', nota: '' })
```

- [ ] **Step 2: Reemplazar la Seccion única por dos bloques**

Reemplazar TODA la `<Seccion titulo="Obras sociales suspendidas"> ... </Seccion>` (líneas 219-260) por un helper local + dos usos. Justo antes del `return` del componente, definí el helper (o como función interna del archivo):

```tsx
  function BloqueOs(props: {
    titulo: string
    ayuda: string
    motivo: 'suspendida' | 'no_atiende'
    estado: { nombre: string; nota: string }
    setEstado: (v: { nombre: string; nota: string }) => void
  }) {
    const items = cfg.osSuspendidas.filter((o) => o.motivo === props.motivo)
    return (
      <Seccion titulo={props.titulo}>
        <p className="text-[11px] text-[var(--color-muted-foreground)]">{props.ayuda}</p>
        <div className="space-y-1 text-sm">
          {items.map((os) => (
            <p key={os.id} className="flex items-center gap-2">
              <span className="font-medium">{os.nombre_os}</span>
              <span className="text-[var(--color-muted-foreground)] flex-1">{os.nota ?? ''}</span>
              <button onClick={() => onAccion(() => quitarOsSuspendida(os.id))}>
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
              </button>
            </p>
          ))}
        </div>
        <div className="flex gap-2">
          <input placeholder="OSEP" className={input + ' !w-36'} value={props.estado.nombre}
            onChange={(e) => props.setEstado({ ...props.estado, nombre: e.target.value })} />
          <input placeholder="Nota (opcional)" className={input} value={props.estado.nota}
            onChange={(e) => props.setEstado({ ...props.estado, nota: e.target.value })} />
          <button
            onClick={() => {
              if (props.estado.nombre.trim()) {
                onAccion(() => agregarOsSuspendida(props.estado.nombre, props.estado.nota, props.motivo))
                props.setEstado({ nombre: '', nota: '' })
              }
            }}
            className="rounded-xl border border-border px-3"
          >
            Agregar
          </button>
        </div>
      </Seccion>
    )
  }
```

Y donde estaba la Seccion, poner los dos bloques:

```tsx
      <BloqueOs
        titulo="Suspendidas por el Círculo (este mes)"
        ayuda="Las que el Círculo suspendió temporalmente. El bot avisa que es particular (no bloquea)."
        motivo="suspendida" estado={osSusp} setEstado={setOsSusp}
      />
      <BloqueOs
        titulo="Obras sociales que no atiendo"
        ayuda="Las que decidiste no tomar. El bot las trata igual: avisa que es particular."
        motivo="no_atiende" estado={osNoAt} setEstado={setOsNoAt}
      />
```

- [ ] **Step 3: Verificar tipos + build**

Run: `npm run typecheck && npm run build`
Expected: limpio (ya no queda el error del caller de Task 2).

- [ ] **Step 4: Commit**

```bash
git add src/features/consultorio/components/config/config-view.tsx
git commit -m "feat(os): dos bloques en config (suspendidas por el Círculo / no atiendo)"
```

---

### Task 4 — Bot: generalizar el aviso (que no diga "suspendida")

**Files:**
- Modify: `src/features/whatsapp/agent/toolsTurnos.ts` (mensaje ~línea 168; describe de `os_confirmada` ~línea 142)

**Interfaces:** ninguna nueva. La lógica (`getOsSuspendidas` lee toda la tabla, sin filtrar por motivo → cubre ambas listas) NO cambia.

- [ ] **Step 1: Cambiar el texto del aviso**

En `src/features/whatsapp/agent/toolsTurnos.ts`, el `return` de ~línea 166-169, reemplazar el `error` por:

```ts
            error: `AVISO: con este profesional la obra social "${obra_social.trim()}" es PARTICULAR (se abona en el consultorio). Explicáselo al paciente y preguntale si quiere reservar igual. SOLO si acepta, llamá de nuevo con os_confirmada:"si".`,
```

- [ ] **Step 2: Generalizar el describe de `os_confirmada`**

En el `.describe(...)` de `os_confirmada` (~línea 142), reemplazar por:

```ts
          .describe('"si" SOLO si la tool te avisó que la obra social es PARTICULAR con este profesional y el paciente confirmó que igual quiere reservar. "" en cualquier otro caso.'),
```

- [ ] **Step 3: Verificar build + suite**

Run: `npm run typecheck && npm test`
Expected: typecheck limpio; suite verde (si hay un test que asserta el texto viejo "suspendida", actualizarlo al nuevo).

- [ ] **Step 4: Commit**

```bash
git add src/features/whatsapp/agent/toolsTurnos.ts
git commit -m "feat(os): el aviso del bot dice 'particular' en vez de 'suspendida' (sirve para ambas listas)"
```

---

### Task 5 — Eliminar "Obras sociales habilitadas" de /perfil

**Files:**
- Modify: `src/features/perfil/components/PerfilForm.tsx` (sección obras sociales + estado `selectedOS`/`toggleOS` + submit + import)
- Modify: `src/actions/perfil.ts` (líneas 29 y 72)
- Modify: `src/features/perfil/types/perfil.ts` (líneas 2, 16, 28, 33)

**Interfaces:** ninguna nueva; se remueve `obras_sociales` del flujo de perfil.

- [ ] **Step 1: `PerfilForm.tsx`**

- Borrar toda la `<section>` con el comentario `{/* Obras Sociales */}` (el `<h2>Obras sociales habilitadas</h2>` y su grid de botones `OBRAS_SOCIALES.map(...)`).
- Borrar el estado `const [selectedOS, setSelectedOS] = useState<string[]>(perfil.obras_sociales ?? [])` y la función `toggleOS`.
- En el `const formData: PerfilFormData = { ... }` del submit, borrar la línea `obras_sociales: selectedOS,`.
- En el import de la línea 5, sacar `OBRAS_SOCIALES` (dejar `type Perfil, type PerfilFormData`).

- [ ] **Step 2: `src/actions/perfil.ts`**

- Línea ~29 (fallback insert de `getPerfil`): borrar `obras_sociales: [],`.
- Línea ~72 (update payload): borrar `obras_sociales: data.obras_sociales,`.

- [ ] **Step 3: `src/features/perfil/types/perfil.ts`**

- Borrar `obras_sociales: string[]` del `interface Perfil` (línea 16).
- Borrar `obras_sociales: z.array(z.string()).default([]),` del `perfilUpdateSchema` (línea 28).
- Grep `OBRAS_SOCIALES` en `src/` para ver si algún otro archivo lo importa DESDE `@/features/perfil/types/perfil`. Si nadie más lo usa desde acá, borrar el `import { OBRAS_SOCIALES } from '@/features/ordenes/types/ordenes'` (línea 2) y el `export { OBRAS_SOCIALES }` (línea 33). La definición en `@/features/ordenes/types/ordenes` NO se toca (la usan las órdenes).

- [ ] **Step 4: Verificar tipos + build**

Run: `npm run typecheck && npm run build`
Expected: limpio. Si el typecheck se queja de que `perfiles.obras_sociales` sigue en algún cast, revisar; la columna DB queda (no se dropea acá — cleanup opcional futuro).

- [ ] **Step 5: Commit**

```bash
git add src/features/perfil/components/PerfilForm.tsx src/actions/perfil.ts src/features/perfil/types/perfil.ts
git commit -m "refactor(perfil): eliminar campo 'obras sociales habilitadas' (estaba muerto)"
```

---

### Task 6 — Gate + verificación manual

**Files:** ninguno.

- [ ] **Step 1: Suite + typecheck + build**

Run: `npm test && npm run typecheck && npm run build`
Expected: suite verde, typecheck limpio, build OK.

- [ ] **Step 2: Verificación en el navegador (dev server, sesión de médico)**

1. `/consultorio/config` → aparecen DOS bloques: "Suspendidas por el Círculo" y "Obras sociales que no atiendo". Agregar una OS a cada uno → cae en el bloque correcto. Quitar una → sale solo de su bloque.
2. Verificar en DB: las filas quedaron con `motivo` correcto.
3. `/perfil` → ya NO aparece la sección "Obras sociales habilitadas"; el resto del perfil guarda bien.

- [ ] **Step 3: Verificación del bot (opcional, requiere WhatsApp)**

Paciente pide turno con una OS que esté en la lista `no_atiende` → el bot avisa "es particular (se abona en el consultorio)" (sin decir "suspendida") y reserva si acepta.

- [ ] **Step 4: Actualizar memoria**

Anotar que B2 (obras sociales, dos listas) quedó implementado; queda B3 (día particular) y B4 (system prompt).

---

## Self-Review (cobertura del spec)
- §Cambios 1 (motivo) → Task 1. ✅
- §Cambios 2 (config dos bloques) → Tasks 2 + 3. ✅
- §Cambios 3 (/perfil quita habilitadas) → Task 5. ✅
- §Cambios 4 (bot generaliza mensaje) → Task 4. ✅
- §Testing → Task 6. ✅
- Decisión abierta "input al agregar OS": se mantiene el input de texto libre actual (YAGNI); el catálogo canónico queda como mejora futura, NO en este plan.
- Decisión abierta "dropear columna perfiles.obras_sociales": NO se dropea (solo se deja de usar); cleanup opcional futuro.

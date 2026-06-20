# Honorario auto-calculado desde el arancel vigente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `ordenes.honorario_calculado` (hoy manual) se prellene solo, editable, desde el arancel vigente de `aranceles_os` según la categoría arancelaria del médico + recargo de interior, para órdenes `obra_social` nivel 1.

**Architecture:** Una regla pura (`src/lib/catalogo/honorario.ts`) elige la columna `valor_*` según la categoría del médico (con cadena de fallback para columnas en `null`) y aplica el recargo de interior. Dos server actions exponen el arancel vigente y la categoría del médico logueado. Los forms de orden (`NuevaOrdenForm`/`EditarOrdenForm`) convierten el campo de honorario a controlado y lo prellenan al elegir OS, dejándolo editable. La categoría se setea desde el panel de admin al onboardear/editar médicos.

**Tech Stack:** Next.js (App Router) + React (client components) + TypeScript + Zod + Supabase (`@/lib/supabase/server`) + vitest.

**Spec:** `docs/superpowers/specs/2026-06-20-honorario-arancel-design.md`

**Rama:** `feat/honorario-arancel` (ya creada, apilada sobre `feat/tabla-canonica-os`). NO mergear (Héctor integra al final).

**Patrón de testing (importante):** este repo testea la **lógica pura** con vitest (ver `src/lib/catalogo/obras-sociales.test.ts`); los server actions y los componentes React NO tienen tests (se verifican con `npm run typecheck` + `npm run build` + smoke manual). El plan respeta eso: TDD completo en la Tarea 2 (regla pura); el resto se verifica con typecheck/build y la suite existente en verde.

---

## Archivos (mapa)

- **Crear** `supabase/migrations/20260620_honorario_arancel.sql` — 4 columnas aditivas.
- **Crear** `src/lib/catalogo/honorario.ts` — regla pura + tipos.
- **Crear** `src/lib/catalogo/honorario.test.ts` — tests de la regla pura.
- **Modificar** `src/actions/catalogo.ts` — `getArancelVigente()` + `getMiCategoriaArancel()`.
- **Modificar** `src/features/admin/medicos/types.ts` — 3 campos en los schemas + `MedicoDetalle`.
- **Modificar** `src/actions/admin-medicos.ts` — persistir categoría en `onboardMedico`/`actualizarMedico`/`getMedicoDetalle`.
- **Modificar** `src/features/admin/medicos/components/FormNuevoMedico.tsx` — select + checkboxes.
- **Modificar** `src/features/admin/medicos/components/FormEditarMedico.tsx` — select + checkboxes (precargados).
- **Modificar** `src/features/ordenes/components/NuevaOrdenForm.tsx` — prellenado editable + nota.
- **Modificar** `src/features/ordenes/components/EditarOrdenForm.tsx` — prellenado al cambiar OS.
- **NO tocar** `src/actions/perfil.ts` (self-edit del médico): no debe escribir estos 3 campos.

---

## Task 1: Migración aditiva (perfiles + aranceles_os)

**Files:**
- Create: `supabase/migrations/20260620_honorario_arancel.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- Item 3: honorario auto-calculado desde el arancel vigente.
-- Aditiva, no destructiva. Sin uso hasta mergear el código.

-- Categoría arancelaria del médico (write admin-only; el self-edit del médico NO la toca).
ALTER TABLE perfiles ADD COLUMN IF NOT EXISTS categoria_arancel text;        -- 'comun' | 'especialista' | 'oftalmologica'
ALTER TABLE perfiles ADD COLUMN IF NOT EXISTS recertificado    boolean NOT NULL DEFAULT false;
ALTER TABLE perfiles ADD COLUMN IF NOT EXISTS atiende_interior boolean NOT NULL DEFAULT false;

-- % de recargo de interior, time-varying por OS/vigencia (NULL = 0%).
ALTER TABLE aranceles_os ADD COLUMN IF NOT EXISTS recargo_interior_pct numeric;
```

- [ ] **Step 2: Aplicar a prod (acción del CONTROLADOR, no subagente)**

El controlador la aplica con el MCP de Supabase (`apply_migration`, name `honorario_arancel`) y verifica. Es aditiva y queda sin uso hasta mergear el código (igual que las migraciones de items 2 y 4). Verificar:

Run (verificación):
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='perfiles' AND column_name IN ('categoria_arancel','recertificado','atiende_interior');
SELECT column_name FROM information_schema.columns
WHERE table_name='aranceles_os' AND column_name='recargo_interior_pct';
```
Expected: las 4 columnas listadas.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260620_honorario_arancel.sql
git commit -m "feat(honorario): migración aditiva — perfiles.categoria_arancel/recertificado/atiende_interior + aranceles_os.recargo_interior_pct"
```

---

## Task 2: Regla pura de cálculo (TDD)

**Files:**
- Create: `src/lib/catalogo/honorario.ts`
- Test: `src/lib/catalogo/honorario.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/lib/catalogo/honorario.test.ts
import { describe, it, expect } from 'vitest'
import { calcularHonorarioConsulta, type ArancelVigente } from './honorario'

const arancel = (over: Partial<ArancelVigente> = {}): ArancelVigente => ({
  valor_consulta_medica: 30000,
  valor_especialista: 25000,
  valor_consulta_oftalmologica: 36000,
  valor_recertificado: 38000,
  recargo_interior_pct: null,
  ...over,
})

describe('calcularHonorarioConsulta', () => {
  it('comun → valor_consulta_medica', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel(), categoria: 'comun', recertificado: false, atiendeInterior: false })
    expect(r?.base).toBe(30000)
    expect(r?.columna).toBe('valor_consulta_medica')
  })
  it('especialista → valor_especialista', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel(), categoria: 'especialista', recertificado: false, atiendeInterior: false })
    expect(r?.base).toBe(25000)
  })
  it('oftalmologica → valor_consulta_oftalmologica', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel(), categoria: 'oftalmologica', recertificado: false, atiendeInterior: false })
    expect(r?.base).toBe(36000)
  })
  it('recertificado=true usa valor_recertificado', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel(), categoria: 'especialista', recertificado: true, atiendeInterior: false })
    expect(r?.base).toBe(38000)
    expect(r?.columna).toBe('valor_recertificado')
  })
  it('recertificado con valor_recertificado null → cae a la columna base', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel({ valor_recertificado: null }), categoria: 'especialista', recertificado: true, atiendeInterior: false })
    expect(r?.base).toBe(25000)
    expect(r?.columna).toBe('valor_especialista')
  })
  it('columna base null → cae a valor_consulta_medica', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel({ valor_especialista: null }), categoria: 'especialista', recertificado: false, atiendeInterior: false })
    expect(r?.base).toBe(30000)
    expect(r?.columna).toBe('valor_consulta_medica')
  })
  it('todo null → null (campo manual)', () => {
    const r = calcularHonorarioConsulta({
      arancel: arancel({ valor_consulta_medica: null, valor_especialista: null, valor_consulta_oftalmologica: null, valor_recertificado: null }),
      categoria: 'comun', recertificado: false, atiendeInterior: false,
    })
    expect(r).toBeNull()
  })
  it('arancel null o categoria null → null', () => {
    expect(calcularHonorarioConsulta({ arancel: null, categoria: 'comun', recertificado: false, atiendeInterior: false })).toBeNull()
    expect(calcularHonorarioConsulta({ arancel: arancel(), categoria: null, recertificado: false, atiendeInterior: false })).toBeNull()
  })
  it('interior aplica recargo_interior_pct', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel({ recargo_interior_pct: 10 }), categoria: 'comun', recertificado: false, atiendeInterior: true })
    expect(r?.honorario).toBe(33000)
    expect(r?.recargoPct).toBe(10)
  })
  it('interior sin recargo (null) → sin recargo', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel({ recargo_interior_pct: null }), categoria: 'comun', recertificado: false, atiendeInterior: true })
    expect(r?.honorario).toBe(30000)
    expect(r?.recargoPct).toBe(0)
  })
  it('atiendeInterior=false ignora el recargo', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel({ recargo_interior_pct: 10 }), categoria: 'comun', recertificado: false, atiendeInterior: false })
    expect(r?.honorario).toBe(30000)
  })
  it('redondeo a 2 decimales', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel({ valor_especialista: 25316.62, recargo_interior_pct: 10 }), categoria: 'especialista', recertificado: false, atiendeInterior: true })
    expect(r?.honorario).toBe(27848.28)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm run test -- src/lib/catalogo/honorario.test.ts`
Expected: FAIL — `calcularHonorarioConsulta` no existe / no se puede importar.

- [ ] **Step 3: Implementar la regla pura**

```ts
// src/lib/catalogo/honorario.ts

export type CategoriaArancel = 'comun' | 'especialista' | 'oftalmologica'

export interface ArancelVigente {
  valor_consulta_medica: number | null
  valor_especialista: number | null
  valor_consulta_oftalmologica: number | null
  valor_recertificado: number | null
  recargo_interior_pct: number | null
}

export interface MiCategoriaArancel {
  categoria_arancel: CategoriaArancel | null
  recertificado: boolean
  atiende_interior: boolean
}

export interface ResultadoHonorario {
  honorario: number   // base + recargo, redondeado a 2 decimales
  base: number        // valor de la columna elegida
  columna: string     // p.ej. 'valor_especialista'
  recargoPct: number  // 0 si no aplica
  motivo: string      // legible para la UI
}

const COLUMNA_BASE: Record<CategoriaArancel, keyof ArancelVigente> = {
  comun: 'valor_consulta_medica',
  especialista: 'valor_especialista',
  oftalmologica: 'valor_consulta_oftalmologica',
}

const ETIQUETA: Record<string, string> = {
  valor_consulta_medica: 'consulta médica',
  valor_especialista: 'especialista',
  valor_consulta_oftalmologica: 'oftalmológica',
  valor_recertificado: 'recertificado',
}

function redondear2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Honorario de una consulta nivel 1 desde el arancel vigente.
 * Devuelve null cuando no se puede calcular (sin arancel, sin categoría, o
 * todas las columnas en null) → el form deja el campo manual.
 */
export function calcularHonorarioConsulta(params: {
  arancel: ArancelVigente | null
  categoria: CategoriaArancel | null
  recertificado: boolean
  atiendeInterior: boolean
}): ResultadoHonorario | null {
  const { arancel, categoria, recertificado, atiendeInterior } = params
  if (!arancel || !categoria) return null

  // 1) Elegir columna con cadena de fallback.
  const candidatas: (keyof ArancelVigente)[] = []
  if (recertificado) candidatas.push('valor_recertificado')
  candidatas.push(COLUMNA_BASE[categoria])
  candidatas.push('valor_consulta_medica')

  let columna: keyof ArancelVigente | null = null
  let base = 0
  for (const c of candidatas) {
    const v = arancel[c]
    if (typeof v === 'number' && v > 0) { columna = c; base = v; break }
  }
  if (columna === null) return null

  // 2) Recargo de interior.
  const pct = atiendeInterior && typeof arancel.recargo_interior_pct === 'number'
    ? arancel.recargo_interior_pct
    : 0
  const honorario = redondear2(base * (1 + pct / 100))

  // 3) Motivo legible.
  const fmt = (n: number) => n.toLocaleString('es-AR')
  const etiqueta = ETIQUETA[columna] ?? columna
  const motivo = pct > 0
    ? `${etiqueta} $${fmt(base)} +${pct}% interior = $${fmt(honorario)}`
    : `${etiqueta} $${fmt(base)}`

  return { honorario, base, columna, recargoPct: pct, motivo }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm run test -- src/lib/catalogo/honorario.test.ts`
Expected: PASS (13 tests verdes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalogo/honorario.ts src/lib/catalogo/honorario.test.ts
git commit -m "feat(honorario): regla pura calcularHonorarioConsulta + tests (fallback de columnas + recargo interior)"
```

---

## Task 3: Server actions (arancel vigente + categoría del médico)

**Files:**
- Modify: `src/actions/catalogo.ts`

- [ ] **Step 1: Agregar las dos acciones**

Agregar al final de `src/actions/catalogo.ts` (e importar los tipos arriba). **Importante:** las columnas `numeric` de Postgres pueden volver como string por PostgREST → coercer con `Number()` (si llegan como string, el `typeof === 'number'` de la regla pura las descartaría).

Import a agregar arriba del archivo:
```ts
import type { ArancelVigente, MiCategoriaArancel, CategoriaArancel } from '@/lib/catalogo/honorario'
```

Cuerpo a agregar al final:
```ts
/** Arancel de la vigencia más reciente de una OS, por codigo_os (lectura global). */
export async function getArancelVigente(codigoOs: number): Promise<ArancelVigente | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('aranceles_os')
    .select('valor_consulta_medica, valor_especialista, valor_consulta_oftalmologica, valor_recertificado, recargo_interior_pct, vigencia')
    .eq('codigo_os', codigoOs)
    .order('vigencia', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  const num = (v: unknown): number | null => (v == null ? null : Number(v))
  return {
    valor_consulta_medica: num(data.valor_consulta_medica),
    valor_especialista: num(data.valor_especialista),
    valor_consulta_oftalmologica: num(data.valor_consulta_oftalmologica),
    valor_recertificado: num(data.valor_recertificado),
    recargo_interior_pct: num(data.recargo_interior_pct),
  }
}

/** Categoría arancelaria del médico logueado (para auto-calcular el honorario). */
export async function getMiCategoriaArancel(): Promise<MiCategoriaArancel> {
  const vacio: MiCategoriaArancel = { categoria_arancel: null, recertificado: false, atiende_interior: false }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return vacio
  const { data } = await supabase
    .from('perfiles')
    .select('categoria_arancel, recertificado, atiende_interior')
    .eq('id', user.id)
    .maybeSingle()
  if (!data) return vacio
  return {
    categoria_arancel: (data.categoria_arancel as CategoriaArancel | null) ?? null,
    recertificado: (data.recertificado as boolean | null) ?? false,
    atiende_interior: (data.atiende_interior as boolean | null) ?? false,
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (sin errores nuevos).

- [ ] **Step 3: Commit**

```bash
git add src/actions/catalogo.ts
git commit -m "feat(honorario): actions getArancelVigente + getMiCategoriaArancel (coerción numeric)"
```

---

## Task 4: Categoría en el alta/edición de médico (admin-only)

**Files:**
- Modify: `src/features/admin/medicos/types.ts`
- Modify: `src/actions/admin-medicos.ts`
- Modify: `src/features/admin/medicos/components/FormNuevoMedico.tsx`
- Modify: `src/features/admin/medicos/components/FormEditarMedico.tsx`

- [ ] **Step 1: Agregar los 3 campos a los schemas + MedicoDetalle**

En `src/features/admin/medicos/types.ts`, agregar a **ambos** `onboardMedicoSchema` y `editarMedicoSchema` (dentro del `z.object({...})`):
```ts
  categoria_arancel: z.enum(['comun', 'especialista', 'oftalmologica']).optional(),
  recertificado: z.boolean().optional().default(false),
  atiende_interior: z.boolean().optional().default(false),
```

Y agregar a la interfaz `MedicoDetalle`:
```ts
  categoria_arancel: 'comun' | 'especialista' | 'oftalmologica' | ''
  recertificado: boolean
  atiende_interior: boolean
```

- [ ] **Step 2: Persistir en las actions**

En `src/actions/admin-medicos.ts`:

**(a)** En `onboardMedico`, después del bloque del RPC `onboard_medico_cablear` (justo antes de `return { slug: d.slug, ... }`), agregar el update de categoría (no toca la RPC):
```ts
  // Categoría arancelaria (admin-only) — se setea al onboardear.
  await service
    .from('perfiles')
    .update({
      categoria_arancel: d.categoria_arancel ?? null,
      recertificado: d.recertificado,
      atiende_interior: d.atiende_interior,
    })
    .eq('id', medicoId)
```

**(b)** En `actualizarMedico`, agregar las 3 claves al `.update({...})` de `perfiles` existente:
```ts
      categoria_arancel: d.categoria_arancel ?? null,
      recertificado: d.recertificado,
      atiende_interior: d.atiende_interior,
```

**(c)** En `getMedicoDetalle`, agregar las columnas al `.select(...)` de `perfiles`:
```ts
    .select('nombre, apellido, especialidad, matricula, cuit, telefono, categoria_arancel, recertificado, atiende_interior')
```
y al objeto `data` devuelto:
```ts
      categoria_arancel: (perfil.categoria_arancel as 'comun' | 'especialista' | 'oftalmologica' | null) ?? '',
      recertificado: (perfil.recertificado as boolean | null) ?? false,
      atiende_interior: (perfil.atiende_interior as boolean | null) ?? false,
```

- [ ] **Step 3: Campos en FormNuevoMedico**

En `src/features/admin/medicos/components/FormNuevoMedico.tsx`, dentro del `<form>` (después del campo `especialidad`, line ~76), agregar:
```tsx
      <select name="categoria_arancel" defaultValue="" className={input}>
        <option value="">Categoría arancelaria (definir luego)</option>
        <option value="comun">Consulta común (médica)</option>
        <option value="especialista">Especialista</option>
        <option value="oftalmologica">Oftalmológica</option>
      </select>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="recertificado" /> Recertificado</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="atiende_interior" /> Atiende en el interior</label>
      </div>
```

Y en `onSubmit`, agregar al objeto que se pasa a `onboardMedico({...})`:
```ts
      categoria_arancel: (form.get('categoria_arancel') as string) || undefined,
      recertificado: form.get('recertificado') === 'on',
      atiende_interior: form.get('atiende_interior') === 'on',
```
(El `categoria_arancel` vacío → `undefined` para que el `.optional()` lo deje en null.)

- [ ] **Step 4: Campos en FormEditarMedico (precargados)**

En `src/features/admin/medicos/components/FormEditarMedico.tsx`, agregar los mismos controles pero leyendo de la prop `detalle` (el `MedicoDetalle`). Usar `defaultValue={detalle.categoria_arancel}` en el `<select>` y `defaultChecked={detalle.recertificado}` / `defaultChecked={detalle.atiende_interior}` en los checkboxes. En el submit, pasar las 3 claves a `actualizarMedico` igual que en el Step 3.

```tsx
      <select name="categoria_arancel" defaultValue={detalle.categoria_arancel} className={input}>
        <option value="">Categoría arancelaria (definir luego)</option>
        <option value="comun">Consulta común (médica)</option>
        <option value="especialista">Especialista</option>
        <option value="oftalmologica">Oftalmológica</option>
      </select>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="recertificado" defaultChecked={detalle.recertificado} /> Recertificado</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="atiende_interior" defaultChecked={detalle.atiende_interior} /> Atiende en el interior</label>
      </div>
```

- [ ] **Step 5: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/medicos/types.ts src/actions/admin-medicos.ts src/features/admin/medicos/components/FormNuevoMedico.tsx src/features/admin/medicos/components/FormEditarMedico.tsx
git commit -m "feat(honorario): categoría arancelaria admin-only en alta/edición de médico"
```

---

## Task 5: Prellenado editable en NuevaOrdenForm

**Files:**
- Modify: `src/features/ordenes/components/NuevaOrdenForm.tsx`

- [ ] **Step 1: Imports + estado**

En el import de catalogo (line 18), sumar las dos acciones:
```ts
import { getCatalogoOs, getMisOsSuspendidas, getArancelVigente, getMiCategoriaArancel } from '@/actions/catalogo'
```
Agregar import de la regla pura:
```ts
import { calcularHonorarioConsulta, type MiCategoriaArancel } from '@/lib/catalogo/honorario'
```
Agregar estado (junto a los otros `useState`, ~line 142):
```ts
  const [miCategoria, setMiCategoria] = useState<MiCategoriaArancel | null>(null)
  const [honorario, setHonorario] = useState('')
  const [honorarioMotivo, setHonorarioMotivo] = useState<string | null>(null)
```

- [ ] **Step 2: Cargar la categoría en el mount**

En el `useEffect` de carga inicial (lines 148-150), agregar:
```ts
    getMiCategoriaArancel().then(setMiCategoria)
```

- [ ] **Step 3: Efecto de prellenado al elegir OS**

Agregar un `useEffect` nuevo (debajo del de carga inicial):
```ts
  // Prellenar honorario desde el arancel vigente (consulta nivel 1, sin práctica del nomenclador).
  useEffect(() => {
    if (tipo !== 'obra_social' || prestacionSeleccionada || codigoOs == null || !miCategoria?.categoria_arancel) {
      setHonorarioMotivo(null)
      return
    }
    let cancelado = false
    getArancelVigente(codigoOs).then((arancel) => {
      if (cancelado) return
      const r = calcularHonorarioConsulta({
        arancel,
        categoria: miCategoria.categoria_arancel,
        recertificado: miCategoria.recertificado,
        atiendeInterior: miCategoria.atiende_interior,
      })
      if (r) { setHonorario(String(r.honorario)); setHonorarioMotivo(r.motivo) }
      else setHonorarioMotivo(null)
    })
    return () => { cancelado = true }
  }, [codigoOs, miCategoria, tipo, prestacionSeleccionada])
```

- [ ] **Step 4: Sembrar honorario desde el OCR**

En `handleOcrExtracted` (después de `setOcr(data)`, ~line 190), agregar:
```ts
    setHonorario(data.importe ? String(data.importe) : '')
```
(Si la OS matchea, el efecto del Step 3 lo sobrescribe con el arancel.)

- [ ] **Step 5: Reemplazar el campo de honorario por uno controlado + nota**

Reemplazar el bloque actual (lines ~562-564):
```tsx
              {!prestacionSeleccionada && (
                <Campo name="honorario_calculado" label="Importe / Honorario" type="number" min="0" step="0.01" mono placeholder="0.00" defaultValue={ocr?.importe || ''} dudoso={isDudoso('importe')} />
              )}
```
por:
```tsx
              {!prestacionSeleccionada && (
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>Importe / Honorario</label>
                  <input
                    type="number" min="0" step="0.01" inputMode="decimal"
                    value={honorario}
                    onChange={(e) => { setHonorario(e.target.value); setHonorarioMotivo(null) }}
                    placeholder="0.00"
                    className={`${inputBase} font-mono`}
                    style={{ ...inputStyle, ...(isDudoso('importe') ? { outline: '2px solid var(--color-warning)' } : {}) }}
                  />
                  {honorarioMotivo
                    ? <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)' }}>Auto: {honorarioMotivo} — editable</p>
                    : (codigoOs != null && miCategoria && !miCategoria.categoria_arancel)
                      ? <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)' }}>Configurá la categoría del médico para auto-calcular.</p>
                      : null}
                </div>
              )}
```

- [ ] **Step 6: Usar el estado en el submit**

En `handleSubmit` (lines 325-327), reemplazar la rama manual del honorario:
```ts
          honorario_calculado: prestacionSeleccionada?.total
            ? Number(prestacionSeleccionada.total)
            : Number(honorario || 0),
```
(antes leía `Number(form.get('honorario_calculado') || 0)`; el campo ya no tiene `name`, ahora es estado controlado).

- [ ] **Step 7: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/ordenes/components/NuevaOrdenForm.tsx
git commit -m "feat(honorario): prellenado editable del honorario en NuevaOrdenForm"
```

---

## Task 6: Prellenado en EditarOrdenForm (solo al cambiar la OS)

**Files:**
- Modify: `src/features/ordenes/components/EditarOrdenForm.tsx`

> Diferencia con Nueva: el honorario inicial es el guardado (`orden.honorario_calculado`), que puede ser un override. Por eso solo se recalcula si el usuario **cambia** la OS (no en el mount).

- [ ] **Step 1: Imports + estado + ref**

En el import de catalogo, sumar `getArancelVigente, getMiCategoriaArancel`. Agregar:
```ts
import { calcularHonorarioConsulta, type MiCategoriaArancel } from '@/lib/catalogo/honorario'
```
Asegurarse de importar `useRef` desde 'react' (sumarlo al import existente de `useEffect, useState`).
Agregar estado (junto a los otros `useState`, ~line 94):
```ts
  const [miCategoria, setMiCategoria] = useState<MiCategoriaArancel | null>(null)
  const [honorario, setHonorario] = useState(orden.honorario_calculado ? String(orden.honorario_calculado) : '')
  const [honorarioMotivo, setHonorarioMotivo] = useState<string | null>(null)
  const osCambiada = useRef(false)
```

- [ ] **Step 2: Cargar categoría en el mount**

En el `useEffect` de carga inicial (lines 96-99), agregar:
```ts
    getMiCategoriaArancel().then(setMiCategoria)
```

- [ ] **Step 3: Marcar cuando el usuario cambia la OS**

En el `OsAutocomplete` (line ~265), agregar `osCambiada.current = true` al `onSelect`:
```tsx
                  onSelect={({ nombre_os, codigo_os }) => { setObraSocial(nombre_os); setCodigoOs(codigo_os); osCambiada.current = true }}
```

- [ ] **Step 4: Efecto de recálculo (gated por osCambiada)**

Agregar debajo del `useEffect` de carga inicial:
```ts
  useEffect(() => {
    if (!osCambiada.current || tipo !== 'obra_social' || prestacionSeleccionada || codigoOs == null || !miCategoria?.categoria_arancel) {
      return
    }
    let cancelado = false
    getArancelVigente(codigoOs).then((arancel) => {
      if (cancelado) return
      const r = calcularHonorarioConsulta({
        arancel,
        categoria: miCategoria.categoria_arancel,
        recertificado: miCategoria.recertificado,
        atiendeInterior: miCategoria.atiende_interior,
      })
      if (r) { setHonorario(String(r.honorario)); setHonorarioMotivo(r.motivo) }
      else setHonorarioMotivo(null)
    })
    return () => { cancelado = true }
  }, [codigoOs, miCategoria, tipo, prestacionSeleccionada])
```

- [ ] **Step 5: Reemplazar el campo de honorario por controlado + nota**

Reemplazar el bloque (lines ~307-309):
```tsx
            {!prestacionSeleccionada && (
              <Campo name="honorario_calculado" label="Importe / Honorario" type="number" min="0" step="0.01" mono placeholder="0.00" defaultValue={orden.honorario_calculado || ''} />
            )}
```
por:
```tsx
            {!prestacionSeleccionada && (
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>Importe / Honorario</label>
                <input
                  type="number" min="0" step="0.01" inputMode="decimal"
                  value={honorario}
                  onChange={(e) => { setHonorario(e.target.value); setHonorarioMotivo(null) }}
                  placeholder="0.00"
                  className={`${inputBase} font-mono`}
                  style={inputStyle}
                />
                {honorarioMotivo && (
                  <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)' }}>Auto: {honorarioMotivo} — editable</p>
                )}
              </div>
            )}
```

- [ ] **Step 6: Usar el estado en el submit**

En `handleSubmit` (lines 165-167), reemplazar la rama manual:
```ts
          honorario_calculado: prestacionSeleccionada?.total
            ? Number(prestacionSeleccionada.total)
            : Number(honorario || 0),
```

- [ ] **Step 7: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/ordenes/components/EditarOrdenForm.tsx
git commit -m "feat(honorario): prellenado del honorario al cambiar OS en EditarOrdenForm"
```

---

## Task 7: Verificación final

- [ ] **Step 1: Suite completa**

Run: `npm run test`
Expected: PASS — toda la suite verde, incluyendo `honorario.test.ts` (13 tests nuevos) y los existentes (`obras-sociales`, `riesgo-debito`, `planilla`).

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS, sin rutas rotas.

- [ ] **Step 3: Smoke manual (opcional, con la migración aplicada en prod)**

Setear una categoría de prueba a un médico (desde `/admin/medicos`), cargar una orden `obra_social` eligiendo una OS con arancel, y verificar que el importe se prellena con la nota de procedencia y se puede editar. Con `recargo_interior_pct` seteado en esa OS + médico `atiende_interior`, verificar el +%.

- [ ] **Step 4: Checklist de criterios de éxito (del spec)**

- [ ] Orden `obra_social` nivel 1 con OS con arancel → honorario prellenado + nota.
- [ ] Campo editable (override) y se guarda lo editado.
- [ ] Médico sin categoría / OS sin arancel → campo manual, sin romper.
- [ ] Nivel 2 (práctica del nomenclador) y particular intactos.
- [ ] Categoría seteada solo desde admin; `perfil.ts` no la toca.
- [ ] `npm run test` / `typecheck` / `build` verdes.

---

## Datos parametrizados (cuando Héctor vuelva del Círculo)

No requieren tocar código — son `UPDATE`/seteo de datos:
- **% de interior**: `UPDATE aranceles_os SET recargo_interior_pct = <n> WHERE …` (único o por OS).
- **Regla recertificado**: marcar `recertificado` en los perfiles que corresponda (admin).
- **¿Especialista = bucket único?**: si aparecen más cortes por especialidad → sumar valores al `z.enum` de `categoria_arancel` y a `COLUMNA_BASE` (cambio acotado, sin migración de datos).

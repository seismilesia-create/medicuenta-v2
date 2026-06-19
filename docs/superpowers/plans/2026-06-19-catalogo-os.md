# Catálogo de Obras Sociales en órdenes + aviso de suspendida — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el flujo de órdenes use el catálogo canónico de OS (`aranceles_os`, ya seedeado) en vez del enum hardcodeado, y que el estado suspendida (catálogo del mes + lista propia del médico) genere un aviso al cargar/editar.

**Architecture:** Helpers puros (`catalogoVigente`, `estaSuspendida`) testeables; server actions que leen `aranceles_os` + `wa_os_suspendidas`; un `OsAutocomplete` (catálogo + escape de texto libre) que reemplaza el `<select>` del enum en los forms de órdenes; `ordenes.codigo_os` (clave de negocio estable) con backfill suave. Migración aditiva — nada se rompe. El enum `OBRAS_SOCIALES` se mantiene (otras superficies lo usan).

**Tech Stack:** Next.js 16 + React 19 + TypeScript, Supabase (Postgres + RLS), Zod 4, Vitest 4. Migraciones = SQL en `supabase/migrations/`.

**Spec:** `docs/superpowers/specs/2026-06-19-catalogo-os-design.md`

---

## Convenciones del repo
- Tests Vitest co-locados, `npm run test`. Typecheck `npm run typecheck`. Build `npm run build`.
- Server actions en `src/actions/*.ts` (`'use server'`, `createClient` de `@/lib/supabase/server`).
- Alias `@/*` → `src/*`.
- `aranceles_os` (prod): `codigo_os int`, `nombre_os text`, `valor_*` numeric, `vigencia date`, `activa bool`. Hoy 50 filas, vigencia `2026-02-01`, todas activas. Nombres tipo `"O.S.E.P."`, `"GALENO"`.
- Reuso: `src/lib/consultorio/osSuspendidas.ts` exporta `normalizarOs(s)` y `esOsSuspendida(suspendidas: string[], os: string)`.

---

## File Structure
**Nuevos:**
- `supabase/migrations/20260619_ordenes_codigo_os.sql` — columna + índice + backfill + (verificar) RLS read de `aranceles_os`.
- `src/lib/catalogo/obras-sociales.ts` — puros `catalogoVigente` + `estaSuspendida` + tipos.
- `src/lib/catalogo/obras-sociales.test.ts` — tests vitest.
- `src/actions/catalogo.ts` — `getCatalogoOs()` + `getMisOsSuspendidas()`.
- `src/features/catalogo/components/OsAutocomplete.tsx` — combobox catálogo + escape.

**Modificados:**
- `src/features/ordenes/types/ordenes.ts` — `Orden.codigo_os` + `codigo_os` en `ordenObraSocialSchema` + `OrdenFilters.codigo_os`.
- `src/actions/ordenes.ts` — persistir `codigo_os` en create/update.
- `src/features/ordenes/components/NuevaOrdenForm.tsx` — OsAutocomplete + match OCR contra catálogo + codigo_os + aviso suspendida.
- `src/features/ordenes/components/EditarOrdenForm.tsx` — OsAutocomplete + codigo_os + aviso.
- `src/features/ordenes/components/OrdenFilters.tsx` — opciones del catálogo, filtro por `codigo_os`.
- `src/features/ordenes/components/OrdenesTable.tsx` — `fetchOrdenes` filtra por `codigo_os`.

---

## Task 1: Migración — `ordenes.codigo_os` + backfill + RLS read de `aranceles_os`

**Files:** Create `supabase/migrations/20260619_ordenes_codigo_os.sql`

- [ ] **Step 1: Escribir la migración**
```sql
-- supabase/migrations/20260619_ordenes_codigo_os.sql
-- Catálogo de OS en órdenes (item 4): clave de negocio estable + backfill suave.

alter table public.ordenes add column if not exists codigo_os integer;
comment on column public.ordenes.codigo_os is 'Código de OS del catálogo aranceles_os (clave de negocio estable; no FK, aranceles_os es time-varying). Null = OS fuera de catálogo o histórico sin match.';
create index if not exists idx_ordenes_codigo_os on public.ordenes(codigo_os);

-- Backfill suave: matchear obra_social (texto) contra el nombre canónico de aranceles_os,
-- normalizando acentos/mayúsculas/espacios y los separadores no alfanuméricos (O.S.E.P. ~ OSEP).
update public.ordenes o
set codigo_os = a.codigo_os
from (
  select distinct on (norm) codigo_os, norm from (
    select codigo_os,
           regexp_replace(lower(translate(nombre_os,'ÁÉÍÓÚÜÑáéíóúüñ','aeiouunaeiouun')), '[^a-z0-9]', '', 'g') as norm
    from public.aranceles_os
  ) s order by norm, codigo_os
) a
on regexp_replace(lower(translate(coalesce(o.obra_social,''),'ÁÉÍÓÚÜÑáéíóúüñ','aeiouunaeiouun')), '[^a-z0-9]', '', 'g') = a.norm
where o.codigo_os is null and coalesce(o.obra_social,'') <> '';
```

- [ ] **Step 2: (Controlador) Verificar RLS de `aranceles_os` y agregar policy de lectura si falta**

Correr (MCP `execute_sql`):
```sql
select relrowsecurity from pg_class where relname='aranceles_os';
select policyname, cmd from pg_policies where tablename='aranceles_os';
```
- Si `relrowsecurity = true` y NO hay policy de SELECT → aplicar (MCP `apply_migration`, name `aranceles_os_select`):
```sql
alter table public.aranceles_os enable row level security;
drop policy if exists "aranceles_os_select_auth" on public.aranceles_os;
create policy "aranceles_os_select_auth" on public.aranceles_os
  for select to authenticated using (true);
```
- Si `relrowsecurity = false`: el catálogo es legible (no hace falta policy). Documentar cuál fue el caso.

- [ ] **Step 3: Aplicar la migración** (MCP `apply_migration`, name `ordenes_codigo_os`, el SQL del Step 1).

- [ ] **Step 4: Verificar**
```sql
select count(*) as total, count(codigo_os) as con_codigo from public.ordenes;
select obra_social, codigo_os, count(*) from public.ordenes group by 1,2 order by 3 desc limit 20;
```
Expected: `codigo_os` poblado en las órdenes cuyo `obra_social` matchea una OS del catálogo (ej. las "OSEP"/"O.S.E.P." → 327); las demás quedan null. La columna existe.

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/20260619_ordenes_codigo_os.sql
git commit -m "feat(catalogo-os): ordenes.codigo_os + backfill por match tolerante"
```

---

## Task 2: Helpers puros `catalogoVigente` + `estaSuspendida` + tests (TDD)

**Files:** Create `src/lib/catalogo/obras-sociales.ts` + `src/lib/catalogo/obras-sociales.test.ts`

- [ ] **Step 1: Test que falla** — `src/lib/catalogo/obras-sociales.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { catalogoVigente, estaSuspendida, type ArancelOsRow } from './obras-sociales'

const row = (over: Partial<ArancelOsRow> = {}): ArancelOsRow => ({
  codigo_os: 327, nombre_os: 'O.S.E.P.', activa: true, vigencia: '2026-02-01', ...over,
})

describe('catalogoVigente', () => {
  it('deja una entrada por codigo_os, con la vigencia más reciente', () => {
    const cat = catalogoVigente([
      row({ codigo_os: 327, nombre_os: 'O.S.E.P.', vigencia: '2026-01-01', activa: false }),
      row({ codigo_os: 327, nombre_os: 'O.S.E.P.', vigencia: '2026-02-01', activa: true }),
      row({ codigo_os: 183, nombre_os: 'GALENO', vigencia: '2026-02-01', activa: true }),
    ])
    expect(cat).toHaveLength(2)
    const osep = cat.find((o) => o.codigo_os === 327)!
    expect(osep.activa).toBe(true) // ganó la vigencia 2026-02-01
  })
  it('ordena por nombre_os', () => {
    const cat = catalogoVigente([row({ codigo_os: 183, nombre_os: 'GALENO' }), row({ codigo_os: 327, nombre_os: 'O.S.E.P.' })])
    expect(cat.map((o) => o.nombre_os)).toEqual(['GALENO', 'O.S.E.P.'])
  })
})

describe('estaSuspendida', () => {
  const catalogo = [
    { codigo_os: 327, nombre_os: 'O.S.E.P.', activa: true },
    { codigo_os: 999, nombre_os: 'OSPACA', activa: false },
  ]
  it('OS activa → no suspendida', () => {
    expect(estaSuspendida({ codigoOs: 327, obraSocial: 'O.S.E.P.', catalogo, suspendidasMedico: [] })).toBe(false)
  })
  it('OS marcada inactiva en el catálogo → suspendida (por codigo)', () => {
    expect(estaSuspendida({ codigoOs: 999, obraSocial: 'OSPACA', catalogo, suspendidasMedico: [] })).toBe(true)
  })
  it('match por nombre tolerante cuando no hay codigo', () => {
    expect(estaSuspendida({ codigoOs: null, obraSocial: 'ospaca', catalogo, suspendidasMedico: [] })).toBe(true)
  })
  it('suspendida por la lista propia del médico', () => {
    expect(estaSuspendida({ codigoOs: 327, obraSocial: 'O.S.E.P.', catalogo, suspendidasMedico: ['OSEP'] })).toBe(true)
  })
  it('particular / vacío → nunca suspendida', () => {
    expect(estaSuspendida({ codigoOs: null, obraSocial: 'particular', catalogo, suspendidasMedico: ['particular'] })).toBe(false)
    expect(estaSuspendida({ codigoOs: null, obraSocial: '', catalogo, suspendidasMedico: [] })).toBe(false)
  })
})
```

- [ ] **Step 2: Correr → FALLA** — `npm run test -- obras-sociales` (módulo no existe).

- [ ] **Step 3: Implementar** — `src/lib/catalogo/obras-sociales.ts`:
```ts
import { normalizarOs, esOsSuspendida } from '@/lib/consultorio/osSuspendidas'

export interface ArancelOsRow {
  codigo_os: number
  nombre_os: string
  activa: boolean
  vigencia: string // YYYY-MM-DD
}

export interface OsCatalogoItem {
  codigo_os: number
  nombre_os: string
  activa: boolean
}

/** Una entrada por codigo_os, con la fila de vigencia más reciente. Ordenado por nombre_os. */
export function catalogoVigente(rows: ArancelOsRow[]): OsCatalogoItem[] {
  const porCodigo = new Map<number, ArancelOsRow>()
  for (const r of rows) {
    const prev = porCodigo.get(r.codigo_os)
    if (!prev || r.vigencia > prev.vigencia) porCodigo.set(r.codigo_os, r)
  }
  return Array.from(porCodigo.values())
    .map((r) => ({ codigo_os: r.codigo_os, nombre_os: r.nombre_os, activa: r.activa }))
    .sort((a, b) => a.nombre_os.localeCompare(b.nombre_os))
}

/** ¿La OS de la orden está suspendida? Catálogo del mes (activa=false) OR lista propia del médico. */
export function estaSuspendida(params: {
  codigoOs: number | null
  obraSocial: string | null
  catalogo: OsCatalogoItem[]
  suspendidasMedico: string[]
}): boolean {
  const { codigoOs, obraSocial, catalogo, suspendidasMedico } = params
  const os = normalizarOs(obraSocial ?? '')
  if (!os || os === 'particular') return false

  // 1) Por catálogo: ubicar por codigo (si hay) o por nombre tolerante.
  const item = codigoOs != null
    ? catalogo.find((c) => c.codigo_os === codigoOs)
    : catalogo.find((c) => normalizarOs(c.nombre_os) === os)
  if (item && !item.activa) return true

  // 2) Por la lista propia del médico (mismo match tolerante que el bot).
  return esOsSuspendida(suspendidasMedico, obraSocial ?? '')
}
```

- [ ] **Step 4: Correr → PASA** — `npm run test -- obras-sociales` (PASS).

- [ ] **Step 5: Commit**
```bash
git add src/lib/catalogo/obras-sociales.ts src/lib/catalogo/obras-sociales.test.ts
git commit -m "feat(catalogo-os): helpers puros catalogoVigente + estaSuspendida"
```

---

## Task 3: Server actions `getCatalogoOs` + `getMisOsSuspendidas`

**Files:** Create `src/actions/catalogo.ts`

- [ ] **Step 1: Implementar**
```ts
// src/actions/catalogo.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { catalogoVigente, type OsCatalogoItem, type ArancelOsRow } from '@/lib/catalogo/obras-sociales'

/** Catálogo de OS de la vigencia más reciente (lectura global). */
export async function getCatalogoOs(): Promise<OsCatalogoItem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('aranceles_os')
    .select('codigo_os, nombre_os, activa, vigencia')
  if (error || !data) return []
  return catalogoVigente(data as ArancelOsRow[])
}

/** OS suspendidas que el médico cargó a mano (wa_os_suspendidas). */
export async function getMisOsSuspendidas(): Promise<string[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('wa_os_suspendidas')
    .select('nombre_os')
    .eq('medico_id', user.id)
  if (error || !data) return []
  return data.map((r) => r.nombre_os as string)
}
```

- [ ] **Step 2: Verificar** — `npm run typecheck` (sin errores).

- [ ] **Step 3: Commit**
```bash
git add src/actions/catalogo.ts
git commit -m "feat(catalogo-os): actions getCatalogoOs + getMisOsSuspendidas"
```

---

## Task 4: Componente `OsAutocomplete`

**Files:** Create `src/features/catalogo/components/OsAutocomplete.tsx`

- [ ] **Step 1: Implementar** (combobox: input con dropdown filtrado del catálogo; escape = texto libre):
```tsx
'use client'

import { useState, useMemo } from 'react'
import { normalizarOs } from '@/lib/consultorio/osSuspendidas'
import type { OsCatalogoItem } from '@/lib/catalogo/obras-sociales'

interface Props {
  catalogo: OsCatalogoItem[]
  valor: string                       // obra_social actual (texto)
  onSelect: (sel: { nombre_os: string; codigo_os: number | null }) => void
  inputClassName?: string
  inputStyle?: React.CSSProperties
}

export function OsAutocomplete({ catalogo, valor, onSelect, inputClassName, inputStyle }: Props) {
  const [texto, setTexto] = useState(valor)
  const [abierto, setAbierto] = useState(false)

  const sugerencias = useMemo(() => {
    const q = normalizarOs(texto)
    if (!q) return catalogo.slice(0, 8)
    return catalogo.filter((c) => normalizarOs(c.nombre_os).includes(q)).slice(0, 8)
  }, [texto, catalogo])

  function elegir(item: OsCatalogoItem) {
    setTexto(item.nombre_os)
    setAbierto(false)
    onSelect({ nombre_os: item.nombre_os, codigo_os: item.codigo_os })
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={texto}
        placeholder="Buscar obra social..."
        onChange={(e) => { setTexto(e.target.value); setAbierto(true); onSelect({ nombre_os: e.target.value, codigo_os: null }) }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        className={inputClassName}
        style={inputStyle}
      />
      {abierto && sugerencias.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg shadow-lg"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          {sugerencias.map((c) => (
            <li key={c.codigo_os}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); elegir(c) }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-primary/10"
                style={{ color: 'var(--color-foreground)' }}>
                <span>{c.nombre_os}</span>
                {!c.activa && <span className="text-xs" style={{ color: 'var(--color-warning)' }}>suspendida</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar** — `npm run typecheck`.

- [ ] **Step 3: Commit**
```bash
git add src/features/catalogo/components/OsAutocomplete.tsx
git commit -m "feat(catalogo-os): componente OsAutocomplete (catálogo + escape)"
```

---

## Task 5: Tipos + actions — persistir `codigo_os`

**Files:** Modify `src/features/ordenes/types/ordenes.ts`, `src/actions/ordenes.ts`

- [ ] **Step 1: `Orden` interface.** En `types/ordenes.ts`, en `interface Orden`, después de `obra_social: string | null` agregar:
```ts
  codigo_os: number | null
```

- [ ] **Step 2: Zod.** En `ordenObraSocialSchema`, después de `obra_social: z.string().min(1, 'Obra social requerida'),` agregar:
```ts
  codigo_os: z.coerce.number().int().optional(),
```

- [ ] **Step 3: Filtro.** En `interface OrdenFilters`, después de `obra_social?: string` agregar:
```ts
  codigo_os?: number
```

- [ ] **Step 4: Actions.** En `src/actions/ordenes.ts`, en `createOrden` (`insertData`) y `updateOrden` (`updateData`), después de la línea `obra_social: data.tipo === 'obra_social' ? data.obra_social : null,` agregar en AMBOS:
```ts
    codigo_os: data.tipo === 'obra_social' ? (data.codigo_os ?? null) : null,
```

- [ ] **Step 5: Verificar** — `npm run typecheck`.

- [ ] **Step 6: Commit**
```bash
git add src/features/ordenes/types/ordenes.ts src/actions/ordenes.ts
git commit -m "feat(catalogo-os): codigo_os en tipos/schema/actions de orden"
```

---

## Task 6: Cablear `NuevaOrdenForm` (autocomplete + OCR + codigo_os + aviso)

**Files:** Modify `src/features/ordenes/components/NuevaOrdenForm.tsx`

**Contexto (estado actual):** la OS es un `<select>` con `OBRAS_SOCIALES` en L499-502 (`value={obraSocial} onChange={... setObraSocial}`). `matchesOsFromScan` (L76-86) matchea contra el enum. `handleOcrExtracted` setea `setObraSocial` (L198-199). El submit escribe `obra_social: obraSocial` (L313). Ya existe estado `obraSocial` (L141) y el patrón de aviso de item 2 (IIFE antes de Botones).

- [ ] **Step 1: Imports.**
```ts
import { OsAutocomplete } from '@/features/catalogo/components/OsAutocomplete'
import { getCatalogoOs, getMisOsSuspendidas } from '@/actions/catalogo'
import { estaSuspendida, type OsCatalogoItem } from '@/lib/catalogo/obras-sociales'
import { normalizarOs } from '@/lib/consultorio/osSuspendidas'
```

- [ ] **Step 2: Estado + carga del catálogo.** Junto a los `useState`, agregar:
```ts
  const [codigoOs, setCodigoOs] = useState<number | null>(null)
  const [catalogo, setCatalogo] = useState<OsCatalogoItem[]>([])
  const [suspendidasMedico, setSuspendidasMedico] = useState<string[]>([])
```
y un efecto de carga (una vez):
```ts
  useEffect(() => {
    getCatalogoOs().then(setCatalogo)
    getMisOsSuspendidas().then(setSuspendidasMedico)
  }, [])
```
(Si `useEffect` no está importado de `react`, agregarlo al import existente.)

- [ ] **Step 2b: Resolver la OS del OCR contra el catálogo + preservar el nomenclador.** En `handleOcrExtracted`, reemplazar la resolución por enum (`const matched = matchesOsFromScan(...)` + `if (matched) setObraSocial(matched)`) y el argumento de `buscarPrestacionPorCodigo`:
```ts
    const scan = normalizarOs(data.obra_social ?? '')
    const m = scan ? catalogo.find((c) => normalizarOs(c.nombre_os).includes(scan) || scan.includes(normalizarOs(c.nombre_os))) : undefined
    if (m) { setObraSocial(m.nombre_os); setCodigoOs(m.codigo_os) }
    else if (data.obra_social) { setObraSocial(data.obra_social); setCodigoOs(null) }
    // El nomenclador (prestaciones) usa la clave 'OSEP'. OSEP (cód 327) → 'OSEP'; el resto no matchea (igual que hoy).
    const osNom = m?.codigo_os === 327 ? 'OSEP' : (m?.nombre_os ?? data.obra_social ?? 'OSEP')
    if (data.codigo_practica) prestacion = await buscarPrestacionPorCodigo(osNom, data.codigo_practica)
```
**Borrar** la función `matchesOsFromScan` (L76-86) — queda sin uso. (Mantener la línea previa `let prestacion: Prestacion | null = null` y NO duplicar la llamada a `buscarPrestacionPorCodigo`.)

- [ ] **Step 3: Reemplazar el `<select>` de OS** (L499-502) por el autocomplete:
```tsx
                  <OsAutocomplete
                    catalogo={catalogo}
                    valor={obraSocial}
                    onSelect={({ nombre_os, codigo_os }) => { setObraSocial(nombre_os); setCodigoOs(codigo_os) }}
                    inputClassName={inputBase}
                    inputStyle={inputStyle}
                  />
```
(Mantener el `<label>Obra Social *</label>` que lo precede.)

- [ ] **Step 4: Submit.** En el objeto `obra_social`, después de `obra_social: obraSocial,` (L313) agregar:
```ts
          codigo_os: codigoOs ?? undefined,
```

- [ ] **Step 4b: Preservar el nomenclador OSEP en el render.** En `<PracticaAutocomplete obraSocial={obraSocial || 'OSEP'} ...>` (L538), cambiar el prop a una clave de nomenclador: `obraSocial={codigoOs === 327 ? 'OSEP' : (obraSocial || 'OSEP')}`. (Igual que en Step 2b: preserva el match del nomenclador OSEP — `prestaciones.obra_social = 'OSEP'` — sin romperlo al usar el nombre canónico "O.S.E.P.".)

- [ ] **Step 5: Aviso de suspendida.** Justo después del aviso de riesgo de débito (el IIFE de item 2, antes de `{/* Botones */}`), agregar otro bloque:
```tsx
        {(() => {
          if (tipo !== 'obra_social' || !obraSocial) return null
          if (!estaSuspendida({ codigoOs, obraSocial, catalogo, suspendidasMedico })) return null
          return (
            <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-warning)' }}>
              <p className="font-medium" style={{ color: 'var(--color-warning)' }}>⚠️ Obra social suspendida</p>
              <p className="mt-1" style={{ color: 'var(--color-foreground)' }}>
                Esta obra social está suspendida este mes. Presentarla puede ser debitada — conviene cobrarla como particular.
              </p>
            </div>
          )
        })()}
```

- [ ] **Step 6: Verificar** — `npm run typecheck && npm run build`.

- [ ] **Step 7: Commit**
```bash
git add src/features/ordenes/components/NuevaOrdenForm.tsx
git commit -m "feat(catalogo-os): autocomplete de OS + aviso suspendida en nueva orden"
```

---

## Task 7: Cablear `EditarOrdenForm` (autocomplete + codigo_os + aviso)

**Files:** Modify `src/features/ordenes/components/EditarOrdenForm.tsx`

**Contexto:** OS es un `<select>` con `OBRAS_SOCIALES` en L251-253. Estado `obraSocial` (L71). Submit escribe `obra_social: obraSocial` (L146). Recibe `orden` como prop (tiene `orden.codigo_os` tras Task 5).

- [ ] **Step 1: Imports** (igual que Task 6 Step 1).

- [ ] **Step 2: Estado + carga.**
```ts
  const [codigoOs, setCodigoOs] = useState<number | null>(orden.codigo_os ?? null)
  const [catalogo, setCatalogo] = useState<OsCatalogoItem[]>([])
  const [suspendidasMedico, setSuspendidasMedico] = useState<string[]>([])
```
```ts
  useEffect(() => {
    getCatalogoOs().then(setCatalogo)
    getMisOsSuspendidas().then(setSuspendidasMedico)
  }, [])
```
(agregar `useEffect` al import de react si falta.)

- [ ] **Step 3: Reemplazar el `<select>` de OS** (L251-253) por:
```tsx
                <OsAutocomplete
                  catalogo={catalogo}
                  valor={obraSocial}
                  onSelect={({ nombre_os, codigo_os }) => { setObraSocial(nombre_os); setCodigoOs(codigo_os) }}
                  inputClassName={inputBase}
                  inputStyle={inputStyle}
                />
```

- [ ] **Step 4: Submit.** Después de `obra_social: obraSocial,` (L146) agregar:
```ts
          codigo_os: codigoOs ?? undefined,
```

- [ ] **Step 4b: Preservar el nomenclador OSEP.** En `<PracticaAutocomplete obraSocial={obraSocial || 'OSEP'} ...>` (L284), cambiar el prop a `obraSocial={codigoOs === 327 ? 'OSEP' : (obraSocial || 'OSEP')}` (mismo motivo que Task 6 Step 4b: el nomenclador `prestaciones` usa la clave 'OSEP').

- [ ] **Step 5: Aviso de suspendida.** Agregar el mismo bloque del Task 6 Step 5 antes de los botones del form (gateado en `tipo === 'obra_social' && obraSocial`).

- [ ] **Step 6: Verificar** — `npm run typecheck && npm run build`.

- [ ] **Step 7: Commit**
```bash
git add src/features/ordenes/components/EditarOrdenForm.tsx
git commit -m "feat(catalogo-os): autocomplete de OS + aviso suspendida en editar orden"
```

---

## Task 8: Filtro del listado por `codigo_os`

**Files:** Modify `src/features/ordenes/components/OrdenFilters.tsx`, `src/features/ordenes/components/OrdenesTable.tsx`

**Contexto:** `OrdenFilters` (L85-90) ofrece OS del enum vía `FilterSelect` y llama `updateFilter('obra_social', v)`. `OrdenesTable.fetchOrdenes` filtra `query.eq('obra_social', currentFilters.obra_social)`.

- [ ] **Step 1: `OrdenFilters` carga el catálogo y filtra por codigo_os.** Agregar imports + estado + efecto:
```ts
import { useState, useEffect } from 'react'
import { getCatalogoOs } from '@/actions/catalogo'
import type { OsCatalogoItem } from '@/lib/catalogo/obras-sociales'
```
```ts
  const [catalogo, setCatalogo] = useState<OsCatalogoItem[]>([])
  useEffect(() => { getCatalogoOs().then(setCatalogo) }, [])
```
Reemplazar el bloque `{/* Obra Social */}` (L84-90) por uno que filtra por codigo_os:
```tsx
          {/* Obra Social (catálogo) */}
          <FilterSelect
            value={filters.codigo_os != null ? String(filters.codigo_os) : ''}
            onChange={(v) => updateFilter('codigo_os', v)}
            placeholder="Todas las OS"
            options={catalogo.map((c) => ({ value: String(c.codigo_os), label: c.nombre_os }))}
          />
```
`updateFilter` hoy hace `{ ...filters, [key]: value || undefined }`. Para `codigo_os` (número), ajustar la firma para convertir:
```ts
  function updateFilter(key: keyof FilterType, value: string) {
    const v = key === 'codigo_os' ? (value ? Number(value) : undefined) : (value || undefined)
    const updated = { ...filters, [key]: v }
    setFilters(updated)
    onFilterChange(updated)
  }
```
(Se puede quitar el import de `OBRAS_SOCIALES` de este archivo si ya no se usa.)

- [ ] **Step 2: `OrdenesTable.fetchOrdenes` filtra por codigo_os.** Reemplazar:
```ts
    if (currentFilters.obra_social) query = query.eq('obra_social', currentFilters.obra_social)
```
por:
```ts
    if (currentFilters.codigo_os != null) query = query.eq('codigo_os', currentFilters.codigo_os)
```

- [ ] **Step 3: Verificar** — `npm run typecheck && npm run build`.

- [ ] **Step 4: Commit**
```bash
git add src/features/ordenes/components/OrdenFilters.tsx src/features/ordenes/components/OrdenesTable.tsx
git commit -m "feat(catalogo-os): filtro de órdenes por codigo_os del catálogo"
```

---

## Verificación final
- [ ] `npm run test` (incluye obras-sociales) verde.
- [ ] `npm run typecheck && npm run build` sin errores.
- [ ] E2E (al final, en prod): cargar orden eligiendo OS del catálogo (autocomplete) → se guarda con codigo_os; marcar una OS como suspendida (en `/consultorio/config` o `aranceles_os.activa=false` de prueba) → aparece el aviso; filtrar el listado por esa OS.

---

## Notas de auto-blindaje
- Si `getCatalogoOs` devuelve `[]` (RLS sin policy / tabla vacía): el autocomplete cae a texto libre (no rompe la carga). Revisar Task 1 Step 2 (policy de SELECT).
- El enum `OBRAS_SOCIALES` se mantiene (liquidaciones/cirugías/perfil/NuevaFojaForm lo usan); NO borrarlo en este item.
- El backfill no toca `obra_social` (texto); solo setea `codigo_os`. Históricos sin match quedan con codigo_os null (se filtran por su texto si hiciera falta, o no aparecen bajo el filtro canónico — aceptado).

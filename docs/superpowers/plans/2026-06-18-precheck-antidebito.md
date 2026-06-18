# Pre-check anti-débito + Emisión de planilla — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevenir débitos avisando/confirmando faltantes (firma del afiliado, diagnóstico, firma y sello del médico) al cargar y al presentar, y emitir una planilla imprimible por obra social con su registro guardado.

**Architecture:** Una función pura `evaluarRiesgoOrden` (riesgo derivado, no persistido) consumida por los 3 puntos de UI. La firma/sello del médico es un dato nuevo detectado por OCR y corregible. La presentación crea un registro liviano en `presentaciones` (una por OS) y vincula las órdenes vía `presentacion_id`; la planilla se imprime desde ese registro. Nivel 2 y particulares quedan fuera.

**Tech Stack:** Next.js 16 (App Router, RSC) + React 19 + TypeScript, Supabase (Postgres + RLS), Zod 4, Vitest 4 (tests co-locados), Tailwind. Migraciones = archivos SQL en `supabase/migrations/`.

**Spec:** `docs/superpowers/specs/2026-06-18-precheck-antidebito-design.md`

---

## Convenciones del repo (leer antes de empezar)

- **Tests:** Vitest, co-locados (`foo.ts` → `foo.test.ts`). Correr: `npm run test`. Estilo: `import { describe, it, expect } from 'vitest'`.
- **Typecheck:** `npm run typecheck`. **Build:** `npm run build`.
- **Migraciones:** crear archivo en `supabase/migrations/AAAAMMDD_desc.sql` y aplicarlo con la MCP de Supabase `apply_migration` (o `supabase db push` si usás CLID). RLS por `auth.uid() = medico_id`, políticas `to authenticated`.
- **Perfil del médico:** tabla `perfiles`, PK `id` = `auth.uid()`, campos `nombre`, `apellido`, `matricula`.
- **Alias de imports:** `@/*` → `src/*`.
- **Plus es privado:** `monto_plus` NUNCA va en la planilla del Círculo. El total de planilla = suma de `honorario_calculado`.

---

## File Structure

**Milestone A — Pre-check anti-débito**
- Create `supabase/migrations/20260618_ordenes_faltantes.sql` — columnas `firma_sello_medico`, `faltantes_confirmados_at`.
- Create `src/lib/ordenes/riesgo-debito.ts` — función pura `evaluarRiesgoOrden` + tipos/labels.
- Create `src/lib/ordenes/riesgo-debito.test.ts` — tests vitest.
- Create `src/features/ordenes/components/ResolverFaltantesPanel.tsx` — panel "Resolver faltantes".
- Modify `src/lib/ai/ocr-orden.ts` — agregar `firma_sello_medico` al schema + prompt.
- Modify `src/features/ordenes/types/ordenes.ts` — `firma_sello_medico` en `Orden` + `ordenObraSocialSchema`.
- Modify `src/actions/ordenes.ts` — plomería de `firma_sello_medico` en create/update + nueva action `resolverFaltantes`.
- Modify `src/features/ordenes/components/NuevaOrdenForm.tsx` — sección Firmas (toda OS) + aviso de riesgo ①.
- Modify `src/features/ordenes/components/OrdenesTable.tsx` — punto de riesgo ③ en filas borrador.
- Modify `src/app/(main)/ordenes/[id]/page.tsx` — montar `ResolverFaltantesPanel`.

**Milestone B — Emisión de planilla**
- Create `supabase/migrations/20260618_presentaciones.sql` — tabla `presentaciones` + `ordenes.presentacion_id` + RLS + índices.
- Create `src/lib/ordenes/planilla.ts` — helpers puros (agrupar por OS, derivar período, total honorarios).
- Create `src/lib/ordenes/planilla.test.ts` — tests vitest.
- Create `src/actions/presentaciones.ts` — `emitirPlanilla`, `getPresentaciones`, `getPresentacionConOrdenes`.
- Create `src/features/ordenes/components/PresentarPlanillaDialog.tsx` — diálogo de 3 botones (②).
- Create `src/app/(main)/ordenes/presentaciones/page.tsx` — historial de presentaciones.
- Create `src/app/imprimir/presentacion/[id]/page.tsx` — planilla imprimible (sin chrome).
- Create `src/features/ordenes/components/ImprimirBoton.tsx` — botón `window.print()`.
- Modify `src/features/ordenes/components/OrdenesTable.tsx` — reemplazar "Marcar como presentadas" por "Emitir planilla" (abre el diálogo).
- Modify `src/features/ordenes/types/ordenes.ts` — interface `Presentacion` + `presentacion_id` en `Orden`.

---

# MILESTONE A — Pre-check anti-débito

## Task A1: Migración — columnas de faltantes

**Files:**
- Create: `supabase/migrations/20260618_ordenes_faltantes.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/20260618_ordenes_faltantes.sql
-- Pre-check anti-débito (item 2 backlog contador): firma/sello del médico + constancia.

alter table public.ordenes
  add column if not exists firma_sello_medico boolean not null default false,
  add column if not exists faltantes_confirmados_at timestamptz;

comment on column public.ordenes.firma_sello_medico is 'Firma Y sello del médico presentes en la orden. Detectado por OCR, corregible por el médico.';
comment on column public.ordenes.faltantes_confirmados_at is 'Constancia: cuándo el médico confirmó haber resuelto los faltantes (Resolver faltantes).';
```

- [ ] **Step 2: Aplicar la migración**

Aplicar con la MCP de Supabase (`apply_migration`, name `ordenes_faltantes`, el SQL de arriba). Si se usa CLI: `supabase db push`.

- [ ] **Step 3: Verificar columnas**

Correr (MCP `execute_sql`):
```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'ordenes' and column_name in ('firma_sello_medico','faltantes_confirmados_at');
```
Expected: 2 filas (`firma_sello_medico` boolean NO, `faltantes_confirmados_at` timestamptz YES).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260618_ordenes_faltantes.sql
git commit -m "feat(ordenes): columnas firma_sello_medico + faltantes_confirmados_at"
```

---

## Task A2: Función pura de riesgo + tests (TDD)

**Files:**
- Create: `src/lib/ordenes/riesgo-debito.ts`
- Test: `src/lib/ordenes/riesgo-debito.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/lib/ordenes/riesgo-debito.test.ts
import { describe, it, expect } from 'vitest'
import { evaluarRiesgoOrden } from './riesgo-debito'

const base = {
  tipo: 'obra_social' as const,
  obra_social: 'OSEP',
  nivel: 1,
  firma_paciente: true,
  diagnostico_cie10: 'J00',
  firma_sello_medico: true,
}

describe('evaluarRiesgoOrden', () => {
  it('orden completa de obra social nivel 1 → sin riesgo', () => {
    expect(evaluarRiesgoOrden(base)).toEqual({ enRiesgo: false, faltantes: [] })
  })

  it('detecta falta de firma del afiliado', () => {
    const r = evaluarRiesgoOrden({ ...base, firma_paciente: false })
    expect(r.enRiesgo).toBe(true)
    expect(r.faltantes).toEqual(['firma_afiliado'])
  })

  it('detecta falta de diagnóstico (vacío o solo espacios)', () => {
    expect(evaluarRiesgoOrden({ ...base, diagnostico_cie10: '' }).faltantes).toEqual(['diagnostico'])
    expect(evaluarRiesgoOrden({ ...base, diagnostico_cie10: '   ' }).faltantes).toEqual(['diagnostico'])
    expect(evaluarRiesgoOrden({ ...base, diagnostico_cie10: null }).faltantes).toEqual(['diagnostico'])
  })

  it('detecta falta de firma y sello del médico', () => {
    expect(evaluarRiesgoOrden({ ...base, firma_sello_medico: false }).faltantes).toEqual(['firma_sello_medico'])
  })

  it('acumula múltiples faltantes en orden estable', () => {
    const r = evaluarRiesgoOrden({ ...base, firma_paciente: false, diagnostico_cie10: '', firma_sello_medico: false })
    expect(r.faltantes).toEqual(['firma_afiliado', 'diagnostico', 'firma_sello_medico'])
  })

  it('órdenes particulares JAMÁS tienen riesgo', () => {
    expect(evaluarRiesgoOrden({ ...base, tipo: 'particular', firma_paciente: false, diagnostico_cie10: '' }))
      .toEqual({ enRiesgo: false, faltantes: [] })
  })

  it('nivel 2 (cirugía) JAMÁS tiene riesgo — lo presenta el sanatorio', () => {
    expect(evaluarRiesgoOrden({ ...base, nivel: 2, firma_paciente: false }))
      .toEqual({ enRiesgo: false, faltantes: [] })
  })

  it('nivel ausente se asume 1', () => {
    expect(evaluarRiesgoOrden({ ...base, nivel: undefined, firma_paciente: false }).enRiesgo).toBe(true)
  })
})
```

- [ ] **Step 2: Correr el test para verque falla**

Run: `npm run test -- riesgo-debito`
Expected: FAIL ("Cannot find module './riesgo-debito'" o `evaluarRiesgoOrden is not a function`).

- [ ] **Step 3: Implementar la función mínima**

```ts
// src/lib/ordenes/riesgo-debito.ts

/** Faltantes que generan débito (item 2 backlog contador). */
export type FaltanteDebito = 'firma_afiliado' | 'diagnostico' | 'firma_sello_medico'

export const FALTANTE_LABELS: Record<FaltanteDebito, string> = {
  firma_afiliado: 'Firma del afiliado',
  diagnostico: 'Diagnóstico',
  firma_sello_medico: 'Firma y sello del médico',
}

/** Forma mínima necesaria para evaluar riesgo. Sirve para datos de form o filas de DB. */
export interface OrdenRiesgoInput {
  tipo: string
  obra_social?: string | null
  nivel?: number | null
  firma_paciente?: boolean | null
  diagnostico_cie10?: string | null
  firma_sello_medico?: boolean | null
}

export interface ResultadoRiesgo {
  enRiesgo: boolean
  faltantes: FaltanteDebito[]
}

function tieneTexto(v: string | null | undefined): boolean {
  return !!v && v.trim().length > 0
}

/**
 * Riesgo de débito derivado (no se persiste). Solo aplica a obra social, nivel 1.
 * El orden de `faltantes` es estable: firma_afiliado, diagnostico, firma_sello_medico.
 */
export function evaluarRiesgoOrden(orden: OrdenRiesgoInput): ResultadoRiesgo {
  const nivel = orden.nivel ?? 1
  if (orden.tipo !== 'obra_social' || nivel !== 1) {
    return { enRiesgo: false, faltantes: [] }
  }
  const faltantes: FaltanteDebito[] = []
  if (!orden.firma_paciente) faltantes.push('firma_afiliado')
  if (!tieneTexto(orden.diagnostico_cie10)) faltantes.push('diagnostico')
  if (!orden.firma_sello_medico) faltantes.push('firma_sello_medico')
  return { enRiesgo: faltantes.length > 0, faltantes }
}
```

- [ ] **Step 4: Correr el test para verque pasa**

Run: `npm run test -- riesgo-debito`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ordenes/riesgo-debito.ts src/lib/ordenes/riesgo-debito.test.ts
git commit -m "feat(ordenes): evaluarRiesgoOrden (regla central de riesgo de débito)"
```

---

## Task A3: OCR — detectar firma y sello del médico

**Files:**
- Modify: `src/lib/ai/ocr-orden.ts` (schema `ordenExtraidaSchema` ~L85; prompt `OCR_ORDEN_PROMPT` ~L112)

- [ ] **Step 1: Agregar el campo al schema**

En `src/lib/ai/ocr-orden.ts`, justo después de la línea `firma_paciente: z.boolean().describe('true si hay firma del afiliado, false si no.'),` agregar:

```ts
  firma_sello_medico: z.boolean().describe('true si hay firma Y sello del médico en la orden, false si no.'),
```

- [ ] **Step 2: Agregar la instrucción al prompt**

En `OCR_ORDEN_PROMPT`, después de la línea que empieza con `- **Token OSEP** = 6 dígitos.`, agregar una viñeta:

```
- **Firmas**: firma_paciente = ¿hay firma manuscrita del AFILIADO? firma_sello_medico = ¿hay firma Y sello del MÉDICO? Son dos cosas distintas; evaluá cada una por separado.
```

- [ ] **Step 3: Verificar que el tipo OCR propaga al form**

Read `src/features/ordenes/components/EscanearOrdenButton.tsx` y confirmar que `OrdenEscaneada` deriva de `OrdenExtraida` (o la incluye). Si `OrdenEscaneada` lista campos a mano, agregar `firma_sello_medico: boolean`. Objetivo: que `ocr?.firma_sello_medico` exista en `NuevaOrdenForm`.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/ocr-orden.ts src/features/ordenes/components/EscanearOrdenButton.tsx
git commit -m "feat(ocr): detectar firma y sello del médico"
```

---

## Task A4: Tipos + plomería en server actions

**Files:**
- Modify: `src/features/ordenes/types/ordenes.ts` (interface `Orden` ~L56; `ordenObraSocialSchema` ~L204)
- Modify: `src/actions/ordenes.ts` (`createOrden` insertData ~L44; `updateOrden` updateData ~L142; agregar `resolverFaltantes`)

- [ ] **Step 1: Agregar `firma_sello_medico` a la interface `Orden`**

En `src/features/ordenes/types/ordenes.ts`, dentro de `interface Orden`, después de `firma_paciente: boolean`, agregar:

```ts
  firma_sello_medico: boolean
  faltantes_confirmados_at: string | null
```

- [ ] **Step 2: Agregar `firma_sello_medico` al schema de obra social**

En `ordenObraSocialSchema`, después de `firma_paciente: z.boolean().default(false),`, agregar:

```ts
  firma_sello_medico: z.boolean().default(false),
```

- [ ] **Step 3: Plomería en `createOrden` y `updateOrden`**

En `src/actions/ordenes.ts`, en `createOrden` (objeto `insertData`) y en `updateOrden` (objeto `updateData`), después de la línea `firma_paciente: data.tipo === 'obra_social' ? data.firma_paciente : false,` agregar en AMBOS:

```ts
    firma_sello_medico: data.tipo === 'obra_social' ? data.firma_sello_medico : false,
```

- [ ] **Step 4: Agregar la action `resolverFaltantes`**

Al final de `src/actions/ordenes.ts`, agregar:

```ts
export async function resolverFaltantes(
  ordenId: string,
  campos: { firma_paciente?: boolean; firma_sello_medico?: boolean; diagnostico_cie10?: string },
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const update: Record<string, unknown> = {
    faltantes_confirmados_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  if (campos.firma_paciente !== undefined) update.firma_paciente = campos.firma_paciente
  if (campos.firma_sello_medico !== undefined) update.firma_sello_medico = campos.firma_sello_medico
  if (campos.diagnostico_cie10 !== undefined) update.diagnostico_cie10 = campos.diagnostico_cie10

  const { error } = await supabase
    .from('ordenes')
    .update(update)
    .eq('id', ordenId)
    .eq('medico_id', user.id)

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: sin errores nuevos.

- [ ] **Step 6: Commit**

```bash
git add src/features/ordenes/types/ordenes.ts src/actions/ordenes.ts
git commit -m "feat(ordenes): firma_sello_medico en tipos/actions + action resolverFaltantes"
```

---

## Task A5: Form de carga — sección Firmas (toda OS) + aviso de riesgo ①

**Files:**
- Modify: `src/features/ordenes/components/NuevaOrdenForm.tsx`

**Contexto:** hoy el checkbox `firma_paciente` está SOLO dentro del bloque `obraSocial === 'OSEP'` (L506-516). El pre-check aplica a toda obra social, así que las firmas y el diagnóstico se vuelven controlados (useState) y se muestra una sección para toda OS. El aviso se calcula en vivo con `evaluarRiesgoOrden`.

- [ ] **Step 1: Importar la regla y los labels**

En el bloque de imports de `NuevaOrdenForm.tsx`, agregar:

```ts
import { evaluarRiesgoOrden, FALTANTE_LABELS } from '@/lib/ordenes/riesgo-debito'
```

- [ ] **Step 2: Estado controlado para los 3 campos del checklist**

Dentro de `NuevaOrdenForm`, junto a los otros `useState`, agregar:

```ts
  const [firmaPaciente, setFirmaPaciente] = useState(false)
  const [firmaSelloMedico, setFirmaSelloMedico] = useState(false)
  const [diagnostico, setDiagnostico] = useState('')
```

- [ ] **Step 3: Inicializar desde el OCR**

En `handleOcrExtracted`, después de `setOcr(data)`, agregar:

```ts
    setFirmaPaciente(!!data.firma_paciente)
    setFirmaSelloMedico(!!data.firma_sello_medico)
    setDiagnostico(data.diagnostico ?? '')
```

- [ ] **Step 4: Usar el estado controlado en el submit**

En `handleSubmit`, en el objeto de `tipo: 'obra_social'`, reemplazar:
```ts
          firma_paciente: form.get('firma_paciente') === 'on',
```
por:
```ts
          firma_paciente: firmaPaciente,
          firma_sello_medico: firmaSelloMedico,
```
y reemplazar:
```ts
          diagnostico_cie10: str('diagnostico_cie10'),
```
por:
```ts
          diagnostico_cie10: diagnostico || undefined,
```

- [ ] **Step 5: Reemplazar el bloque OSEP de firma por una sección Firmas para TODA OS**

Quitar el checkbox `firma_paciente` del bloque `obraSocial === 'OSEP'` (L509-514: el `<div className="flex items-end">…Firma del paciente…</div>`), dejando solo el token dentro del grid OSEP. Luego, dentro del bloque `tipo === 'obra_social'`, después de la `</section>` de "Práctica", agregar una sección nueva:

```tsx
            {/* Firmas y diagnóstico (checklist anti-débito, toda OS) */}
            <section className="space-y-4 p-6 rounded-xl" style={sectionStyle}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>Firmas</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={firmaPaciente} onChange={(e) => setFirmaPaciente(e.target.checked)}
                    className="w-4 h-4 rounded" style={{ accentColor: 'var(--color-primary)' }} />
                  <span className="text-sm" style={{ color: 'var(--color-foreground)' }}>Firma del afiliado</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={firmaSelloMedico} onChange={(e) => setFirmaSelloMedico(e.target.checked)}
                    className="w-4 h-4 rounded" style={{ accentColor: 'var(--color-primary)' }} />
                  <span className="text-sm" style={{ color: 'var(--color-foreground)' }}>Firma y sello del médico</span>
                </label>
              </div>
            </section>
```

En la sección "Práctica", hacer el diagnóstico controlado: reemplazar
```tsx
                <Campo name="diagnostico_cie10" label="Diagnóstico CIE-10" colSpan defaultValue={ocr?.diagnostico ?? ''} />
```
por
```tsx
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>Diagnóstico CIE-10</label>
                  <input value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)}
                    className={inputBase} style={inputStyle} placeholder="Ej: J00 — Rinofaringitis aguda" />
                </div>
```

- [ ] **Step 6: Aviso de riesgo ① arriba de los botones**

Justo antes del bloque de `{/* Botones */}`, agregar (se calcula en vivo y solo para obra social):

```tsx
        {(() => {
          if (tipo !== 'obra_social') return null
          const { enRiesgo, faltantes } = evaluarRiesgoOrden({
            tipo, obra_social: obraSocial, nivel: 1,
            firma_paciente: firmaPaciente, diagnostico_cie10: diagnostico, firma_sello_medico: firmaSelloMedico,
          })
          if (!enRiesgo) return null
          return (
            <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-warning)' }}>
              <p className="font-medium" style={{ color: 'var(--color-warning)' }}>⚠️ Riesgo de débito</p>
              <p className="mt-1" style={{ color: 'var(--color-foreground)' }}>
                Falta: {faltantes.map((f) => FALTANTE_LABELS[f]).join(', ')}. Revisá la orden antes de presentarla (podés guardarla igual).
              </p>
            </div>
          )
        })()}
```

- [ ] **Step 7: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: sin errores.

- [ ] **Step 8: Verificación manual (Playwright o navegador)**

Con `npm run dev`: ir a `/ordenes/nueva`, escanear/cargar una orden de obra social sin firma → debe aparecer el cartel ámbar "Riesgo de débito" listando lo que falta; tildar las firmas y escribir diagnóstico → el cartel desaparece.

- [ ] **Step 9: Commit**

```bash
git add src/features/ordenes/components/NuevaOrdenForm.tsx
git commit -m "feat(ordenes): sección Firmas para toda OS + aviso de riesgo al cargar"
```

---

## Task A6: Punto de riesgo ③ en el listado

**Files:**
- Modify: `src/features/ordenes/components/OrdenesTable.tsx` (imports L7-14; render de fila L290-343)

- [ ] **Step 1: Importar la regla**

En los imports de `OrdenesTable.tsx`, agregar:

```ts
import { evaluarRiesgoOrden, FALTANTE_LABELS } from '@/lib/ordenes/riesgo-debito'
```

- [ ] **Step 2: Mostrar el punto en la celda Paciente (solo borradores con riesgo)**

En el `map` de filas, reemplazar la celda del paciente:
```tsx
                        <td className="px-3 md:px-5 py-4 font-medium text-foreground">{orden.nombre_paciente}</td>
```
por:
```tsx
                        <td className="px-3 md:px-5 py-4 font-medium text-foreground">
                          <span className="inline-flex items-center gap-2">
                            {(() => {
                              if (!isBorrador) return null
                              const { enRiesgo, faltantes } = evaluarRiesgoOrden(orden)
                              if (!enRiesgo) return null
                              return (
                                <span
                                  className="inline-block h-2 w-2 rounded-full bg-amber-500 shrink-0"
                                  title={`Riesgo de débito: falta ${faltantes.map((f) => FALTANTE_LABELS[f]).join(', ')}`}
                                />
                              )
                            })()}
                            {orden.nombre_paciente}
                          </span>
                        </td>
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/features/ordenes/components/OrdenesTable.tsx
git commit -m "feat(ordenes): punto de riesgo en borradores del listado"
```

---

## Task A7: Panel "Resolver faltantes" en el detalle de la orden

**Files:**
- Create: `src/features/ordenes/components/ResolverFaltantesPanel.tsx`
- Modify: `src/app/(main)/ordenes/[id]/page.tsx`

- [ ] **Step 1: Crear el panel**

```tsx
// src/features/ordenes/components/ResolverFaltantesPanel.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { resolverFaltantes } from '@/actions/ordenes'
import { evaluarRiesgoOrden, FALTANTE_LABELS } from '@/lib/ordenes/riesgo-debito'
import type { Orden } from '../types/ordenes'

export function ResolverFaltantesPanel({ orden }: { orden: Orden }) {
  const router = useRouter()
  const { enRiesgo, faltantes } = evaluarRiesgoOrden(orden)
  const [firmaPaciente, setFirmaPaciente] = useState(orden.firma_paciente)
  const [firmaSelloMedico, setFirmaSelloMedico] = useState(orden.firma_sello_medico)
  const [diagnostico, setDiagnostico] = useState(orden.diagnostico_cie10 ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Solo se muestra en borradores con riesgo.
  if (orden.estado !== 'borrador' || !enRiesgo) return null

  async function confirmar() {
    setLoading(true)
    setError(null)
    const res = await resolverFaltantes(orden.id, {
      firma_paciente: firmaPaciente,
      firma_sello_medico: firmaSelloMedico,
      diagnostico_cie10: diagnostico,
    })
    setLoading(false)
    if (res?.error) { setError(res.error); return }
    router.refresh()
  }

  return (
    <section className="space-y-4 p-6 rounded-xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-warning)' }}>
      <div>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-warning)' }}>⚠️ Resolver faltantes</h3>
        <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)' }}>
          Esta orden tiene riesgo de débito ({faltantes.map((f) => FALTANTE_LABELS[f]).join(', ')}). Corregí la orden física y confirmá acá; queda registrado como constancia.
        </p>
      </div>

      {faltantes.includes('firma_afiliado') && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={firmaPaciente} onChange={(e) => setFirmaPaciente(e.target.checked)} className="w-4 h-4 rounded" style={{ accentColor: 'var(--color-primary)' }} />
          <span className="text-sm" style={{ color: 'var(--color-foreground)' }}>Ya está la firma del afiliado</span>
        </label>
      )}
      {faltantes.includes('firma_sello_medico') && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={firmaSelloMedico} onChange={(e) => setFirmaSelloMedico(e.target.checked)} className="w-4 h-4 rounded" style={{ accentColor: 'var(--color-primary)' }} />
          <span className="text-sm" style={{ color: 'var(--color-foreground)' }}>Ya está mi firma y sello</span>
        </label>
      )}
      {faltantes.includes('diagnostico') && (
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>Diagnóstico</label>
          <input value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)} placeholder="Ej: J00"
            className="w-full px-4 py-3 rounded-lg text-sm"
            style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-foreground)' }} />
        </div>
      )}

      {error && <p className="text-sm" style={{ color: 'var(--color-error)' }}>{error}</p>}

      <button onClick={confirmar} disabled={loading}
        className="px-4 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
        style={{ background: 'var(--color-primary)' }}>
        {loading ? 'Guardando...' : 'Confirmar que corregí los faltantes'}
      </button>
    </section>
  )
}
```

- [ ] **Step 2: Montar el panel en el detalle de la orden**

Read `src/app/(main)/ordenes/[id]/page.tsx` para ver cómo obtiene la `orden` (variable y tipo). Importar el panel:
```tsx
import { ResolverFaltantesPanel } from '@/features/ordenes/components/ResolverFaltantesPanel'
```
y renderizarlo cerca del tope del detalle, pasándole la orden ya cargada:
```tsx
<ResolverFaltantesPanel orden={orden} />
```
(El panel se auto-oculta si no es borrador con riesgo, así que es seguro renderizarlo siempre.)

- [ ] **Step 3: Exportar desde el barrel si corresponde**

Si `src/features/ordenes/components/index.ts` re-exporta componentes, agregar `export { ResolverFaltantesPanel } from './ResolverFaltantesPanel'`.

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: sin errores.

- [ ] **Step 5: Verificación manual**

Abrir el detalle de una orden borrador sin firma → ver el panel; confirmar → el panel desaparece (riesgo resuelto) y `faltantes_confirmados_at` queda seteado.

- [ ] **Step 6: Commit**

```bash
git add src/features/ordenes/components/ResolverFaltantesPanel.tsx "src/app/(main)/ordenes/[id]/page.tsx" src/features/ordenes/components/index.ts
git commit -m "feat(ordenes): panel Resolver faltantes con constancia"
```

**✅ Milestone A entregable:** anti-débito funcionando (aviso al cargar, punto en listado, resolver faltantes). La planilla (Milestone B) usa la misma regla para la barrera al presentar.

---

# MILESTONE B — Emisión de planilla

## Task B1: Migración — tabla `presentaciones` + vínculo

**Files:**
- Create: `supabase/migrations/20260618_presentaciones.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/20260618_presentaciones.sql
-- Emisión de planilla: registro liviano por presentación (una por OS) + vínculo de órdenes.

create table if not exists public.presentaciones (
  id uuid primary key default gen_random_uuid(),
  medico_id uuid not null references auth.users(id) on delete cascade,
  periodo_mes date not null,
  obra_social text not null,
  agente_facturador text not null,
  fecha_emision timestamptz not null default now(),
  cantidad_ordenes int not null,
  monto_total numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table public.ordenes
  add column if not exists presentacion_id uuid references public.presentaciones(id) on delete set null;

create index if not exists idx_ordenes_presentacion on public.ordenes(presentacion_id);
create index if not exists idx_presentaciones_medico on public.presentaciones(medico_id);

alter table public.presentaciones enable row level security;

drop policy if exists "presentaciones_select_own" on public.presentaciones;
create policy "presentaciones_select_own" on public.presentaciones
  for select to authenticated using (auth.uid() = medico_id);

drop policy if exists "presentaciones_insert_own" on public.presentaciones;
create policy "presentaciones_insert_own" on public.presentaciones
  for insert to authenticated with check (auth.uid() = medico_id);

drop policy if exists "presentaciones_update_own" on public.presentaciones;
create policy "presentaciones_update_own" on public.presentaciones
  for update to authenticated using (auth.uid() = medico_id);

drop policy if exists "presentaciones_delete_own" on public.presentaciones;
create policy "presentaciones_delete_own" on public.presentaciones
  for delete to authenticated using (auth.uid() = medico_id);
```

- [ ] **Step 2: Aplicar** (MCP `apply_migration` name `presentaciones`, o `supabase db push`).

- [ ] **Step 3: Verificar**

MCP `execute_sql`:
```sql
select tablename from pg_tables where tablename = 'presentaciones';
select column_name from information_schema.columns where table_name='ordenes' and column_name='presentacion_id';
```
Expected: `presentaciones` existe; `presentacion_id` existe. Y `get_advisors` (security) sin nuevos hallazgos de RLS.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260618_presentaciones.sql
git commit -m "feat(presentaciones): tabla + ordenes.presentacion_id + RLS"
```

---

## Task B2: Helpers puros de planilla + tests (TDD)

**Files:**
- Create: `src/lib/ordenes/planilla.ts`
- Test: `src/lib/ordenes/planilla.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/lib/ordenes/planilla.test.ts
import { describe, it, expect } from 'vitest'
import { agruparPorObraSocial, periodoMesDe, totalHonorarios } from './planilla'

const o = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'x', obra_social: 'OSEP', fecha_atencion: '2026-06-10',
  honorario_calculado: 1000, monto_plus: 500, ...over,
})

describe('periodoMesDe', () => {
  it('devuelve el primer día del mes (YYYY-MM-01)', () => {
    expect(periodoMesDe('2026-06-10')).toBe('2026-06-01')
    expect(periodoMesDe('2026-12-31')).toBe('2026-12-01')
  })
})

describe('totalHonorarios', () => {
  it('suma honorario_calculado y EXCLUYE el plus (privado)', () => {
    expect(totalHonorarios([o(), o({ honorario_calculado: 2000 })])).toBe(3000)
  })
})

describe('agruparPorObraSocial', () => {
  it('agrupa por OS y arma un grupo por cada una', () => {
    const grupos = agruparPorObraSocial([o(), o({ obra_social: 'PAMI' }), o()])
    expect(grupos.map((g) => g.obra_social).sort()).toEqual(['OSEP', 'PAMI'])
    const osep = grupos.find((g) => g.obra_social === 'OSEP')!
    expect(osep.ordenes).toHaveLength(2)
    expect(osep.periodo_mes).toBe('2026-06-01')
    expect(osep.monto_total).toBe(2000)
  })
})
```

- [ ] **Step 2: Correr para verque falla**

Run: `npm run test -- planilla`
Expected: FAIL ("Cannot find module './planilla'").

- [ ] **Step 3: Implementar**

```ts
// src/lib/ordenes/planilla.ts

export interface OrdenPlanilla {
  id: string
  obra_social: string | null
  fecha_atencion: string
  honorario_calculado: number
  monto_plus: number
}

export interface GrupoPlanilla {
  obra_social: string
  periodo_mes: string // YYYY-MM-01
  ordenes: OrdenPlanilla[]
  monto_total: number
}

/** Primer día del mes de una fecha YYYY-MM-DD. */
export function periodoMesDe(fechaAtencion: string): string {
  return `${fechaAtencion.slice(0, 7)}-01`
}

/** Total de honorarios de la planilla. EXCLUYE monto_plus (es privado, no va al Círculo). */
export function totalHonorarios(ordenes: OrdenPlanilla[]): number {
  return ordenes.reduce((acc, o) => acc + Number(o.honorario_calculado), 0)
}

/** Agrupa órdenes por obra social. El período de cada grupo sale de la 1ª orden del grupo. */
export function agruparPorObraSocial(ordenes: OrdenPlanilla[]): GrupoPlanilla[] {
  const mapa = new Map<string, OrdenPlanilla[]>()
  for (const o of ordenes) {
    const os = o.obra_social ?? 'Otra'
    const arr = mapa.get(os) ?? []
    arr.push(o)
    mapa.set(os, arr)
  }
  return Array.from(mapa.entries()).map(([obra_social, ords]) => ({
    obra_social,
    periodo_mes: periodoMesDe(ords[0].fecha_atencion),
    ordenes: ords,
    monto_total: totalHonorarios(ords),
  }))
}
```

- [ ] **Step 4: Correr para verque pasa**

Run: `npm run test -- planilla`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ordenes/planilla.ts src/lib/ordenes/planilla.test.ts
git commit -m "feat(ordenes): helpers puros de planilla (agrupar por OS, período, total)"
```

---

## Task B3: Tipos + server actions de presentaciones

**Files:**
- Modify: `src/features/ordenes/types/ordenes.ts` (agregar `presentacion_id` a `Orden` + interface `Presentacion`)
- Create: `src/actions/presentaciones.ts`

- [ ] **Step 1: Tipos**

En `src/features/ordenes/types/ordenes.ts`, dentro de `interface Orden` (después de `turno_id`), agregar:
```ts
  presentacion_id: string | null
```
Y al final de la sección de interfaces, agregar:
```ts
export interface Presentacion {
  id: string
  medico_id: string
  periodo_mes: string
  obra_social: string
  agente_facturador: AgenteFacturador
  fecha_emision: string
  cantidad_ordenes: number
  monto_total: number
  created_at: string
}
```

- [ ] **Step 2: Crear las actions**

```ts
// src/actions/presentaciones.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { totalHonorarios, periodoMesDe } from '@/lib/ordenes/planilla'

export interface EmitirPlanillaInput {
  obra_social: string
  agente_facturador: string
  orden_ids: string[]
}

/** Crea UNA presentación para una OS y marca/vincula sus órdenes (borrador → presentada). */
export async function emitirPlanilla(input: EmitirPlanillaInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }
  if (input.orden_ids.length === 0) return { error: 'No hay órdenes para presentar' }

  const { data: ordenes, error: qErr } = await supabase
    .from('ordenes')
    .select('id, obra_social, fecha_atencion, honorario_calculado, monto_plus, estado')
    .in('id', input.orden_ids)
    .eq('medico_id', user.id)
    .eq('estado', 'borrador')
    .eq('obra_social', input.obra_social)
  if (qErr) return { error: qErr.message }
  const validas = ordenes ?? []
  if (validas.length === 0) return { error: 'No hay órdenes válidas (borrador, de esa obra social)' }

  const periodo_mes = periodoMesDe(
    [...validas].sort((a, b) => a.fecha_atencion.localeCompare(b.fecha_atencion))[0].fecha_atencion,
  )
  const monto_total = totalHonorarios(validas)

  const { data: pres, error: insErr } = await supabase
    .from('presentaciones')
    .insert({
      medico_id: user.id,
      periodo_mes,
      obra_social: input.obra_social,
      agente_facturador: input.agente_facturador,
      cantidad_ordenes: validas.length,
      monto_total,
    })
    .select('id')
    .single()
  if (insErr || !pres) return { error: insErr?.message ?? 'No se pudo crear la presentación' }

  const { error: updErr } = await supabase
    .from('ordenes')
    .update({ estado: 'presentada', presentacion_id: pres.id, updated_at: new Date().toISOString() })
    .in('id', validas.map((o) => o.id))
    .eq('medico_id', user.id)
    .eq('estado', 'borrador')
  if (updErr) return { error: updErr.message }

  return { success: true, presentacion_id: pres.id as string, cantidad: validas.length }
}

export async function getPresentaciones() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' as const }
  const { data, error } = await supabase
    .from('presentaciones')
    .select('*')
    .eq('medico_id', user.id)
    .order('fecha_emision', { ascending: false })
  if (error) return { error: error.message }
  return { presentaciones: data ?? [] }
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/features/ordenes/types/ordenes.ts src/actions/presentaciones.ts
git commit -m "feat(presentaciones): tipos + actions emitirPlanilla/getPresentaciones"
```

---

## Task B4: Diálogo "Emitir planilla" en el listado (②)

**Files:**
- Create: `src/features/ordenes/components/PresentarPlanillaDialog.tsx`
- Modify: `src/features/ordenes/components/OrdenesTable.tsx` (reemplazar `handleBatchPresentar` + botón de la barra flotante)

**Comportamiento:** el médico selecciona borradores (filtrando por período/agente con los filtros existentes) y toca **Emitir planilla**. El diálogo agrupa por OS, muestra las en riesgo y ofrece: Presentar igual (todas) · Presentar solo las OK · Cancelar. Al confirmar emite una planilla por OS y redirige al historial.

- [ ] **Step 1: Crear el diálogo**

```tsx
// src/features/ordenes/components/PresentarPlanillaDialog.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { emitirPlanilla } from '@/actions/presentaciones'
import { agruparPorObraSocial } from '@/lib/ordenes/planilla'
import { evaluarRiesgoOrden, FALTANTE_LABELS } from '@/lib/ordenes/riesgo-debito'
import type { Orden } from '../types/ordenes'

export function PresentarPlanillaDialog({ ordenes, onClose }: { ordenes: Orden[]; onClose: () => void }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Solo obra social entra en la planilla (las particulares no se debitan ni se presentan).
  const ordenesOS = ordenes.filter((o) => o.tipo === 'obra_social')
  const particulares = ordenes.length - ordenesOS.length
  const enRiesgoIds = new Set(ordenesOS.filter((o) => evaluarRiesgoOrden(o).enRiesgo).map((o) => o.id))
  const riesgosas = ordenesOS.filter((o) => enRiesgoIds.has(o.id))

  async function emitir(soloOk: boolean) {
    const aPresentar = soloOk ? ordenesOS.filter((o) => !enRiesgoIds.has(o.id)) : ordenesOS
    if (aPresentar.length === 0) { setError('No quedan órdenes para presentar'); return }
    setLoading(true)
    setError(null)
    const grupos = agruparPorObraSocial(aPresentar.map((o) => ({
      id: o.id, obra_social: o.obra_social, fecha_atencion: o.fecha_atencion,
      honorario_calculado: Number(o.honorario_calculado), monto_plus: Number(o.monto_plus),
    })))
    for (const g of grupos) {
      const res = await emitirPlanilla({
        obra_social: g.obra_social,
        agente_facturador: aPresentar.find((o) => o.obra_social === g.obra_social)?.agente_facturador ?? 'circulo_medico',
        orden_ids: g.ordenes.map((o) => o.id),
      })
      if (res?.error) { setError(res.error); setLoading(false); return }
    }
    setLoading(false)
    router.push('/ordenes/presentaciones')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-foreground">Emitir planilla</h2>
        <p className="text-sm text-muted-foreground">
          {ordenesOS.length} órdenes de obra social. Se emitirá una planilla por cada OS.{particulares > 0 ? ` (${particulares} particular${particulares === 1 ? '' : 'es'} no entran)` : ''}
        </p>

        {riesgosas.length > 0 && (
          <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-warning)' }}>
            <p className="font-medium" style={{ color: 'var(--color-warning)' }}>
              ⚠️ {riesgosas.length} con riesgo de débito
            </p>
            <ul className="mt-2 space-y-1" style={{ color: 'var(--color-foreground)' }}>
              {riesgosas.map((o) => (
                <li key={o.id}>• {o.nombre_paciente} ({o.obra_social}) — falta {evaluarRiesgoOrden(o).faltantes.map((f) => FALTANTE_LABELS[f]).join(', ')}</li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="text-sm" style={{ color: 'var(--color-error)' }}>{error}</p>}

        <div className="flex flex-col gap-2 pt-2">
          <button disabled={loading} onClick={() => emitir(false)}
            className="px-4 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ background: 'var(--color-primary)' }}>
            {loading ? 'Emitiendo...' : 'Presentar igual (todas)'}
          </button>
          {riesgosas.length > 0 && riesgosas.length < ordenesOS.length && (
            <button disabled={loading} onClick={() => emitir(true)}
              className="px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-foreground)' }}>
              Presentar solo las OK ({ordenesOS.length - riesgosas.length})
            </button>
          )}
          <button disabled={loading} onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: 'transparent', color: 'var(--color-muted-foreground)' }}>
            Cancelar y revisar
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Cablear en OrdenesTable**

En `OrdenesTable.tsx`:
1. Importar: `import { PresentarPlanillaDialog } from './PresentarPlanillaDialog'`
2. Agregar estado: `const [showPlanilla, setShowPlanilla] = useState(false)`
3. **Limpiar lo que queda sin uso:** borrar la función `handleBatchPresentar`, el estado `const [batchLoading, setBatchLoading] = useState(false)` y el import `batchUpdateOrdenesEstado` (todos quedan sin referencias → fallarían lint/build). **Conservar** `batchResult` y su banner (los usan los handlers de selección). `Loader2` y `Check` siguen usándose en otras partes del archivo, no los borres.
4. En la barra flotante, reemplazar el botón "Marcar como presentadas" (que dependía de `batchLoading`) por:
```tsx
          <button
            onClick={() => setShowPlanilla(true)}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            Emitir planilla
          </button>
```
5. Antes del cierre del `return` (después de la barra flotante), renderizar el diálogo:
```tsx
      {showPlanilla && (
        <PresentarPlanillaDialog
          ordenes={selectedBorradores}
          onClose={() => { setShowPlanilla(false); setSelected(new Set()); fetchOrdenes(filters) }}
        />
      )}
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: sin errores. (Si `batchUpdateOrdenesEstado` queda sin uso, eliminar su import para que no falle lint.)

- [ ] **Step 4: Verificación manual**

Seleccionar borradores (algunos sin firma) → "Emitir planilla" → el diálogo lista las en riesgo → "Presentar solo las OK" presenta las completas y deja las riesgosas en borrador; redirige a `/ordenes/presentaciones`.

- [ ] **Step 5: Commit**

```bash
git add src/features/ordenes/components/PresentarPlanillaDialog.tsx src/features/ordenes/components/OrdenesTable.tsx
git commit -m "feat(ordenes): diálogo Emitir planilla con barrera de riesgo"
```

---

## Task B5: Historial + planilla imprimible

**Files:**
- Create: `src/app/(main)/ordenes/presentaciones/page.tsx`
- Create: `src/app/imprimir/presentacion/[id]/page.tsx`
- Create: `src/features/ordenes/components/ImprimirBoton.tsx`

- [ ] **Step 1: Botón de imprimir (cliente)**

```tsx
// src/features/ordenes/components/ImprimirBoton.tsx
'use client'

export function ImprimirBoton() {
  return (
    <button
      data-no-print
      onClick={() => window.print()}
      className="px-4 py-2.5 rounded-lg text-sm font-medium text-white"
      style={{ background: 'var(--color-primary)' }}
    >
      Imprimir / Guardar PDF
    </button>
  )
}
```

- [ ] **Step 2: Historial de presentaciones (bajo el shell de la app)**

```tsx
// src/app/(main)/ordenes/presentaciones/page.tsx
import Link from 'next/link'
import { getPresentaciones } from '@/actions/presentaciones'
import { AGENTE_LABELS } from '@/features/ordenes/types/ordenes'
import type { AgenteFacturador } from '@/features/ordenes/types/ordenes'

export const metadata = { title: 'Presentaciones | MediCuenta' }

function fmtMes(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}
function fmtMonto(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

export default async function PresentacionesPage() {
  const res = await getPresentaciones()
  const presentaciones = 'presentaciones' in res ? res.presentaciones : []

  return (
    <div className="px-4 md:px-8 py-6 space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Presentaciones</h1>
      {presentaciones.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no emitiste ninguna planilla.</p>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3">Período</th>
                <th className="px-4 py-3">Obra social</th>
                <th className="px-4 py-3">Agente</th>
                <th className="px-4 py-3 text-right">Órdenes</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {presentaciones.map((p) => (
                <tr key={p.id} className="border-b border-border/50">
                  <td className="px-4 py-3 text-foreground capitalize">{fmtMes(p.periodo_mes)}</td>
                  <td className="px-4 py-3 text-foreground">{p.obra_social}</td>
                  <td className="px-4 py-3 text-muted-foreground">{AGENTE_LABELS[p.agente_facturador as AgenteFacturador] ?? p.agente_facturador}</td>
                  <td className="px-4 py-3 text-right font-mono">{p.cantidad_ordenes}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmtMonto(Number(p.monto_total))}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/imprimir/presentacion/${p.id}`} target="_blank" className="text-primary hover:underline">Imprimir</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Planilla imprimible (ruta limpia, fuera del shell)**

```tsx
// src/app/imprimir/presentacion/[id]/page.tsx
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { ImprimirBoton } from '@/features/ordenes/components/ImprimirBoton'

function fmtMes(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}
function fmtFecha(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('es-AR')
}
function fmtMonto(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

export default async function PlanillaImprimible({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: pres } = await supabase
    .from('presentaciones').select('*').eq('id', id).eq('medico_id', user.id).single()
  if (!pres) notFound()

  const { data: perfil } = await supabase
    .from('perfiles').select('nombre, apellido, matricula').eq('id', user.id).single()
  const { data: ordenes } = await supabase
    .from('ordenes')
    .select('nombre_paciente, fecha_atencion, codigo_practica, nombre_practica, honorario_calculado')
    .eq('presentacion_id', id)
    .order('fecha_atencion', { ascending: true })

  const filas = ordenes ?? []
  const medico = perfil ? `${perfil.nombre ?? ''} ${perfil.apellido ?? ''}`.trim() : ''

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 24, color: '#111', background: '#fff' }}>
      <style>{`@media print { [data-no-print] { display: none !important; } }`}</style>

      <div data-no-print style={{ marginBottom: 16 }}>
        <ImprimirBoton />
      </div>

      <header style={{ borderBottom: '2px solid #111', paddingBottom: 12, marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Planilla de presentación</h1>
        <p style={{ margin: '4px 0' }}><strong>{medico}</strong>{perfil?.matricula ? ` — Mat. ${perfil.matricula}` : ''}</p>
        <p style={{ margin: '4px 0' }}>
          Obra social: <strong>{pres.obra_social}</strong> · Período: <strong style={{ textTransform: 'capitalize' }}>{fmtMes(pres.periodo_mes)}</strong>
        </p>
      </header>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #111', textAlign: 'left' }}>
            <th style={{ padding: '6px 4px' }}>Fecha</th>
            <th style={{ padding: '6px 4px' }}>Paciente</th>
            <th style={{ padding: '6px 4px' }}>Código</th>
            <th style={{ padding: '6px 4px' }}>Práctica</th>
            <th style={{ padding: '6px 4px', textAlign: 'right' }}>Honorario</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((o, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #ddd' }}>
              <td style={{ padding: '6px 4px' }}>{fmtFecha(o.fecha_atencion)}</td>
              <td style={{ padding: '6px 4px' }}>{o.nombre_paciente}</td>
              <td style={{ padding: '6px 4px' }}>{o.codigo_practica ?? '-'}</td>
              <td style={{ padding: '6px 4px' }}>{o.nombre_practica ?? '-'}</td>
              <td style={{ padding: '6px 4px', textAlign: 'right' }}>{fmtMonto(Number(o.honorario_calculado))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid #111', fontWeight: 700 }}>
            <td style={{ padding: '6px 4px' }} colSpan={4}>Total ({pres.cantidad_ordenes} órdenes)</td>
            <td style={{ padding: '6px 4px', textAlign: 'right' }}>{fmtMonto(Number(pres.monto_total))}</td>
          </tr>
        </tfoot>
      </table>

      <p style={{ marginTop: 32, fontSize: 12 }}>Firma y sello del profesional: __________________________</p>
    </div>
  )
}
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: sin errores.

- [ ] **Step 5: Verificación manual (E2E)**

Emitir una planilla → en `/ordenes/presentaciones` aparece la fila → "Imprimir" abre `/imprimir/presentacion/<id>` con encabezado (médico + matrícula + OS + período), filas con honorarios (SIN el plus) y total; el botón "Imprimir / Guardar PDF" abre el diálogo del navegador y no sale en la impresión.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(main)/ordenes/presentaciones/page.tsx" "src/app/imprimir/presentacion/[id]/page.tsx" src/features/ordenes/components/ImprimirBoton.tsx
git commit -m "feat(presentaciones): historial + planilla imprimible por OS"
```

**✅ Milestone B entregable:** emisión de planilla con barrera de riesgo, registro guardado e impresión por OS.

---

## Verificación final (toda la feature)

- [ ] `npm run test` (todos los tests verdes, incluidos riesgo-debito y planilla).
- [ ] `npm run typecheck && npm run build` sin errores.
- [ ] E2E: cargar orden sin firma → aviso ① → guardar borrador → punto ③ en listado → Resolver faltantes → seleccionar y Emitir planilla → barrera ② → historial → imprimir (honorarios sin plus, agrupado por OS).

---

## Notas de auto-blindaje (documentar si surge un error)
- Si `gen_random_uuid()` no existe: `create extension if not exists pgcrypto;` antes de la tabla.
- Si la RLS de `ordenes` usa otro patrón de policy, replicar EXACTAMENTE ese patrón en `presentaciones`.
- Si `OrdenEscaneada` no deriva de `OrdenExtraida`, agregar `firma_sello_medico` a mano (Task A3 Step 3).

# Extracción genérica de órdenes por foto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalizar el OCR de órdenes (hoy OSEP-específico) a un núcleo común de datos de facturación que funciona con la foto de cualquier obra social, marcando lo no leído como "cargar a mano" y bloqueando solo la presentación de órdenes incompletas.

**Architecture:** Enfoque A del spec. Schema OCR **plano** (no se anida) con una constante `CAMPOS_NUCLEO` que define el subconjunto común + un campo nuevo `no_encontrados`. Prompt agnóstico de OS. Una función pura `evaluarCompletitud` deriva `incompleta` de las columnas existentes (no se persiste, patrón `riesgo-debito`). Se persiste el OCR crudo en `ordenes.datos_ocr` (única columna nueva) para reproceso futuro. El form generaliza: núcleo siempre visible, secciones OSEP condicionales a `codigo_os === 327`.

**Tech Stack:** Next.js 16 + React 19 + TypeScript, Zod, Vercel AI SDK (`generateObject`) + OpenRouter (Haiku), Supabase, Vitest (tests co-locados `*.test.ts`).

## Desviación consciente del spec (§5)

El spec proponía bloques anidados `nucleo` / `extras_osep` en el schema OCR. El plan lo implementa como **schema plano + constante `CAMPOS_NUCLEO`** (mismo outcome: distinguir núcleo de extras y marcar `no_encontrados`), porque anidar obligaría a reescribir todos los bindings `ocr?.campo` del form de 770 líneas y a cambiar la forma que produce el modelo Haiku (schema hoy "validado E2E"). El resto del spec se respeta 1:1.

## Global Constraints

- TypeScript strict. **NUNCA `any`** — usar `unknown`. (CLAUDE.md)
- Validar entradas con **Zod**. RLS habilitado (ya está en `ordenes`).
- Modelo de visión OCR = `anthropic/claude-haiku-4.5` (`MODELS.vision`). **No se cambia el modelo**; solo el texto del prompt y un campo aditivo del schema.
- Copy en **español** (rioplatense, como el resto de la app).
- Completitud y riesgo de débito son **derivados, no se persisten**.
- Única columna nueva permitida por este plan: `ordenes.datos_ocr jsonb`.
- Tests co-locados `*.test.ts`; correr con `npx vitest run <archivo>`. Typecheck: `npm run typecheck`.
- El honorario lo calcula el sistema (arancel/nomenclador); **nunca** se siembra desde el importe leído.

---

### Task 1: Schema OCR agnóstico + núcleo + `no_encontrados`

**Files:**
- Modify: `src/lib/ai/ocr-orden.ts`
- Test: `src/lib/ai/ocr-orden.test.ts` (create)

**Interfaces:**
- Produces:
  - `CAMPOS_NUCLEO: readonly string[]` — claves OCR del núcleo (texto/número).
  - `type CampoNucleo = (typeof CAMPOS_NUCLEO)[number]`.
  - `NUCLEO_LABELS: Record<CampoNucleo, string>`.
  - `OCR_ORDEN_PROMPT_VERSION: string`.
  - `ordenExtraidaSchema` ahora incluye `no_encontrados: string[]`.
  - `OrdenExtraida` (inferido) gana `no_encontrados: string[]`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/ocr-orden.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  ordenExtraidaSchema,
  CAMPOS_NUCLEO,
  NUCLEO_LABELS,
  OCR_ORDEN_PROMPT,
  OCR_ORDEN_PROMPT_VERSION,
} from './ocr-orden'

describe('ordenExtraidaSchema — núcleo genérico', () => {
  it('CAMPOS_NUCLEO tiene las 11 claves de texto/número del núcleo', () => {
    expect([...CAMPOS_NUCLEO].sort()).toEqual(
      [
        'cobertura',
        'codigo_practica',
        'diagnostico',
        'fecha_emision',
        'fecha_realizacion',
        'nombre_practica',
        'nro_afiliado',
        'nro_comprobante',
        'nro_documento',
        'obra_social',
        'paciente',
      ].sort(),
    )
  })

  it('cada campo del núcleo tiene label en español', () => {
    for (const campo of CAMPOS_NUCLEO) {
      expect(NUCLEO_LABELS[campo]).toBeTruthy()
    }
  })

  it('parsea una respuesta con no_encontrados poblado', () => {
    const parsed = ordenExtraidaSchema.parse({
      es_orden_medica: true,
      motivo_rechazo: '',
      delegacion: '', titulo_autorizacion: '', nro_comprobante: '12345678',
      nro_internacion: '', fecha_solicitud: '', fecha_vencimiento: '',
      fecha_prescripcion: '', fecha_emision: '2026-07-01', hora_emision: '',
      titular_nombre: 'PEREZ JUAN', medico_solicitante: '', grupo_afiliado: '01',
      nro_afiliado: '033883', paciente: 'PEREZ JUAN', cobertura: '', parentesco: '',
      domicilio: '', tipo_documento: 'DNI', nro_documento: '',
      obra_social: 'SWISS MEDICAL', codigo_practica: '', alias: '',
      nombre_practica: 'CONSULTA', cantidad: 1, cara: '', pieza: '', importe: 0,
      forma_pago: '', cod_pago: '', origen: '', diagnostico: '', arancelista: '',
      cajero: '', total_cargo_afiliado: 0, fecha_realizacion: '2026-07-01',
      horario_realizacion: '', matricula_profesional: '', profesional: '',
      entidad: '', responsable: '', agente_facturador: '', token_osep: '',
      firma_paciente: false, firma_sello_medico: false, observaciones: '',
      confianza: 'media', campos_dudosos: [],
      no_encontrados: ['nro_documento', 'cobertura'],
    })
    expect(parsed.no_encontrados).toEqual(['nro_documento', 'cobertura'])
  })

  it('el prompt es agnóstico de OS (no hardcodea "OSEP")', () => {
    expect(OCR_ORDEN_PROMPT.toLowerCase()).toContain('cualquier obra social')
    expect(OCR_ORDEN_PROMPT_VERSION).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ai/ocr-orden.test.ts`
Expected: FAIL (`CAMPOS_NUCLEO` / `NUCLEO_LABELS` / `OCR_ORDEN_PROMPT_VERSION` no exportados; `no_encontrados` no está en el schema).

- [ ] **Step 3: Implement — agregar núcleo, `no_encontrados` y prompt agnóstico**

En `src/lib/ai/ocr-orden.ts`:

3a. Agregar el campo al schema, justo antes de `confianza:` (dentro de `z.object({...})`):

```ts
  no_encontrados: z
    .array(z.string())
    .describe('Claves del núcleo (nro_comprobante, fecha_emision, fecha_realizacion, paciente, nro_documento, nro_afiliado, cobertura, obra_social, nombre_practica, codigo_practica, diagnostico) que NO pudiste encontrar/leer en la imagen. Solo texto/número; NO incluyas firmas.'),
```

3b. Después de `export type OrdenExtraida = z.infer<typeof ordenExtraidaSchema>` agregar:

```ts
/** Versión del prompt/schema OCR — se guarda con el crudo para reproceso. */
export const OCR_ORDEN_PROMPT_VERSION = 'v2-generico-2026-07'

/**
 * Núcleo común de facturación: los campos de texto/número que se extraen de
 * CUALQUIER obra social (no solo OSEP). Las claves son las del schema OCR.
 * Las firmas (booleanos) NO forman parte de esta lista (ver completitud).
 */
export const CAMPOS_NUCLEO = [
  'nro_comprobante',
  'fecha_emision',
  'fecha_realizacion',
  'paciente',
  'nro_documento',
  'nro_afiliado',
  'cobertura',
  'obra_social',
  'nombre_practica',
  'codigo_practica',
  'diagnostico',
] as const

export type CampoNucleo = (typeof CAMPOS_NUCLEO)[number]

export const NUCLEO_LABELS: Record<CampoNucleo, string> = {
  nro_comprobante: 'N° de orden',
  fecha_emision: 'Fecha de emisión',
  fecha_realizacion: 'Fecha de práctica',
  paciente: 'Apellido y nombre',
  nro_documento: 'DNI',
  nro_afiliado: 'N° de afiliado',
  cobertura: 'Plan / cobertura',
  obra_social: 'Obra social',
  nombre_practica: 'Tipo de práctica',
  codigo_practica: 'Codificación',
  diagnostico: 'Diagnóstico',
}
```

3c. Reescribir `OCR_ORDEN_PROMPT` para que sea agnóstico. Reemplazar la primera línea y agregar la instrucción de `no_encontrados`. La primera línea pasa a:

```
Analizá esta imagen de una orden médica de CUALQUIER obra social argentina (puede ser OSEP, PAMI, Swiss Medical, OSDE u otra) y extraé TODOS los campos que reconozcas. Cada obra social tiene un formato distinto: leé por SIGNIFICADO, no por posición fija. Si un campo propio de OSEP (delegación, arancelista, cajero, token, cara/pieza) no existe en esta orden, dejalo vacío.
```

Y agregar, antes de la línea `- confianza:`, este bullet:

```
- **no_encontrados**: además de dejar en "" lo que no está, listá en `no_encontrados` las claves del NÚCLEO que no pudiste encontrar/leer: nro_comprobante, fecha_emision, fecha_realizacion, paciente, nro_documento, nro_afiliado, cobertura, obra_social, nombre_practica, codigo_practica, diagnostico. NO incluyas firmas. Si encontraste todo el núcleo, no_encontrados=[].
```

(El resto del prompt —regla de oro, beneficiario vs titular, fechas, etc.— se mantiene.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ai/ocr-orden.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/ocr-orden.ts src/lib/ai/ocr-orden.test.ts
git commit -m "feat(ocr): schema de orden agnóstico de OS + núcleo común + no_encontrados"
```

---

### Task 2: `evaluarCompletitud` (pura, gate de presentación)

**Files:**
- Create: `src/lib/ordenes/completitud.ts`
- Test: `src/lib/ordenes/completitud.test.ts` (create)

**Interfaces:**
- Consumes: `type Orden` de `@/features/ordenes/types/ordenes` (solo las columnas del núcleo).
- Produces:
  - `type CampoFaltante = 'nro_orden' | 'fecha_emision' | 'nro_afiliado' | 'nro_documento' | 'obra_social' | 'nombre_practica' | 'honorario'`
  - `CAMPO_FALTANTE_LABELS: Record<CampoFaltante, string>`
  - `interface OrdenCompletitudInput` (forma mínima: campos de identidad de facturación).
  - `evaluarCompletitud(orden: OrdenCompletitudInput): { completa: boolean; faltantes: CampoFaltante[] }`

**Nota de negocio (ajustable):** el gate de presentación exige la **identidad de facturación** (quién, qué OS, qué práctica, cuándo se emitió, cuánto se factura). Diagnóstico, firmas y plan/cobertura NO gatean acá: el diagnóstico y las firmas ya los cubre `riesgo-debito.ts` (aviso de débito + `resolverFaltantes`), y el plan es informativo. Solo aplica a `tipo === 'obra_social'`. Es un set chico y explícito para poder tunearlo.

- [ ] **Step 1: Write the failing test**

Create `src/lib/ordenes/completitud.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { evaluarCompletitud, CAMPO_FALTANTE_LABELS } from './completitud'

const base = {
  tipo: 'obra_social' as const,
  nro_comprobante: '12345678',
  token_osep: null,
  fecha_emision: '2026-07-01',
  nro_afiliado: '033883',
  nro_documento: '30111222',
  obra_social: 'SWISS MEDICAL',
  nombre_practica: 'Consulta médica',
  honorario_calculado: 4500,
}

describe('evaluarCompletitud', () => {
  it('orden OS con todos los datos de identidad → completa', () => {
    expect(evaluarCompletitud(base)).toEqual({ completa: true, faltantes: [] })
  })

  it('particular siempre completa (no se presenta a OS)', () => {
    const r = evaluarCompletitud({ ...base, tipo: 'particular', obra_social: null })
    expect(r.completa).toBe(true)
  })

  it('N° de orden vale por comprobante O por token', () => {
    const r = evaluarCompletitud({ ...base, nro_comprobante: '', token_osep: '123456' })
    expect(r.completa).toBe(true)
  })

  it('sin comprobante ni token → falta nro_orden', () => {
    const r = evaluarCompletitud({ ...base, nro_comprobante: '', token_osep: null })
    expect(r.completa).toBe(false)
    expect(r.faltantes).toContain('nro_orden')
  })

  it('honorario en 0 → falta honorario', () => {
    const r = evaluarCompletitud({ ...base, honorario_calculado: 0 })
    expect(r.faltantes).toContain('honorario')
  })

  it('acumula varios faltantes en orden estable', () => {
    const r = evaluarCompletitud({
      ...base, nro_comprobante: '', token_osep: null,
      fecha_emision: '', nro_afiliado: '', nro_documento: '',
      obra_social: '', nombre_practica: '', honorario_calculado: 0,
    })
    expect(r.faltantes).toEqual([
      'nro_orden', 'fecha_emision', 'nro_afiliado',
      'nro_documento', 'obra_social', 'nombre_practica', 'honorario',
    ])
  })

  it('cada faltante tiene label', () => {
    for (const k of Object.keys(CAMPO_FALTANTE_LABELS)) {
      expect(CAMPO_FALTANTE_LABELS[k as keyof typeof CAMPO_FALTANTE_LABELS]).toBeTruthy()
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ordenes/completitud.test.ts`
Expected: FAIL (`Cannot find module './completitud'`).

- [ ] **Step 3: Implement**

Create `src/lib/ordenes/completitud.ts`:

```ts
/**
 * Completitud de la orden para PRESENTARLA a la obra social. Derivada, no se
 * persiste (mismo patrón que riesgo-debito.ts). Exige la identidad de
 * facturación; diagnóstico y firmas los cubre riesgo-debito, el plan es
 * informativo. Solo aplica a obra social.
 */
export type CampoFaltante =
  | 'nro_orden'
  | 'fecha_emision'
  | 'nro_afiliado'
  | 'nro_documento'
  | 'obra_social'
  | 'nombre_practica'
  | 'honorario'

export const CAMPO_FALTANTE_LABELS: Record<CampoFaltante, string> = {
  nro_orden: 'N° de orden',
  fecha_emision: 'Fecha de emisión',
  nro_afiliado: 'N° de afiliado',
  nro_documento: 'DNI',
  obra_social: 'Obra social',
  nombre_practica: 'Tipo de práctica',
  honorario: 'Honorario',
}

/** Forma mínima para evaluar: sirve para datos de form o filas de DB. */
export interface OrdenCompletitudInput {
  tipo: string
  nro_comprobante?: string | null
  token_osep?: string | null
  fecha_emision?: string | null
  nro_afiliado?: string | null
  nro_documento?: string | null
  obra_social?: string | null
  nombre_practica?: string | null
  honorario_calculado?: number | null
}

function tieneTexto(v: string | null | undefined): boolean {
  return !!v && v.trim().length > 0
}

export function evaluarCompletitud(
  orden: OrdenCompletitudInput,
): { completa: boolean; faltantes: CampoFaltante[] } {
  if (orden.tipo !== 'obra_social') {
    return { completa: true, faltantes: [] }
  }
  const faltantes: CampoFaltante[] = []
  if (!tieneTexto(orden.nro_comprobante) && !tieneTexto(orden.token_osep)) {
    faltantes.push('nro_orden')
  }
  if (!tieneTexto(orden.fecha_emision)) faltantes.push('fecha_emision')
  if (!tieneTexto(orden.nro_afiliado)) faltantes.push('nro_afiliado')
  if (!tieneTexto(orden.nro_documento)) faltantes.push('nro_documento')
  if (!tieneTexto(orden.obra_social)) faltantes.push('obra_social')
  if (!tieneTexto(orden.nombre_practica)) faltantes.push('nombre_practica')
  if (!(orden.honorario_calculado && orden.honorario_calculado > 0)) {
    faltantes.push('honorario')
  }
  return { completa: faltantes.length === 0, faltantes }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ordenes/completitud.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ordenes/completitud.ts src/lib/ordenes/completitud.test.ts
git commit -m "feat(ordenes): evaluarCompletitud puro (gate de presentación por identidad de facturación)"
```

---

### Task 3: `estadoCampoOcr` (pura, decide chip rojo/ámbar/ok)

**Files:**
- Create: `src/lib/ordenes/estado-campo-ocr.ts`
- Test: `src/lib/ordenes/estado-campo-ocr.test.ts` (create)

**Interfaces:**
- Produces:
  - `type EstadoCampoOcr = 'ok' | 'dudoso' | 'no_encontrado'`
  - `estadoCampoOcr(campo: string, noEncontrados: string[], dudosos: string[]): EstadoCampoOcr`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ordenes/estado-campo-ocr.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { estadoCampoOcr } from './estado-campo-ocr'

describe('estadoCampoOcr', () => {
  it('no encontrado tiene prioridad sobre dudoso', () => {
    expect(estadoCampoOcr('nro_documento', ['nro_documento'], ['nro_documento']))
      .toBe('no_encontrado')
  })
  it('dudoso si está en la lista de dudosos', () => {
    expect(estadoCampoOcr('paciente', [], ['paciente'])).toBe('dudoso')
  })
  it('ok si no está en ninguna lista', () => {
    expect(estadoCampoOcr('paciente', [], [])).toBe('ok')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ordenes/estado-campo-ocr.test.ts`
Expected: FAIL (`Cannot find module './estado-campo-ocr'`).

- [ ] **Step 3: Implement**

Create `src/lib/ordenes/estado-campo-ocr.ts`:

```ts
/** Estado visual de un campo autopoblado por OCR en el form de la orden. */
export type EstadoCampoOcr = 'ok' | 'dudoso' | 'no_encontrado'

/**
 * no_encontrado (no se leyó → cargar a mano, rojo) tiene prioridad sobre
 * dudoso (leído con baja confianza → verificá, ámbar).
 */
export function estadoCampoOcr(
  campo: string,
  noEncontrados: string[],
  dudosos: string[],
): EstadoCampoOcr {
  if (noEncontrados.includes(campo)) return 'no_encontrado'
  if (dudosos.includes(campo)) return 'dudoso'
  return 'ok'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ordenes/estado-campo-ocr.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ordenes/estado-campo-ocr.ts src/lib/ordenes/estado-campo-ocr.test.ts
git commit -m "feat(ordenes): estadoCampoOcr puro (chip no_encontrado/dudoso/ok)"
```

---

### Task 4: Persistir `datos_ocr` (migración + tipos + createOrden)

**Files:**
- Create: `supabase/migrations/20260707_ordenes_datos_ocr.sql`
- Modify: `src/features/ordenes/types/ordenes.ts` (interface `Orden`, `ordenBaseSchema`)
- Modify: `src/actions/ordenes.ts` (`createOrden` insert)

**Interfaces:**
- Consumes: `OrdenExtraida`, `OCR_ORDEN_PROMPT_VERSION` de Task 1.
- Produces: `Orden.datos_ocr: unknown | null`; `ordenBaseSchema` acepta `datos_ocr?: unknown`; `createOrden` persiste `datos_ocr`.

- [ ] **Step 1: Crear la migración**

Create `supabase/migrations/20260707_ordenes_datos_ocr.sql`:

```sql
-- OCR crudo de la orden (para reprocesar sin re-fotografiar cuando haya
-- modelos de otras OS). Aditiva, nullable → segura sobre datos existentes.
alter table public.ordenes
  add column if not exists datos_ocr jsonb;

comment on column public.ordenes.datos_ocr is
  'OCR crudo { version, datos } de la foto de la orden. Habilita reproceso.';
```

- [ ] **Step 2: Aplicar la migración**

Aplicar vía el MCP de Supabase (`apply_migration`, name `ordenes_datos_ocr`) o el flujo de migraciones del proyecto.
Verificar: `select column_name from information_schema.columns where table_name='ordenes' and column_name='datos_ocr';` devuelve 1 fila.

- [ ] **Step 3: Tipos — agregar `datos_ocr`**

En `src/features/ordenes/types/ordenes.ts`:

3a. En la interface `Orden`, después de `imagen_comprobante: string | null` (línea ~127):

```ts
  // OCR crudo de la foto (para reproceso). { version, datos: OrdenExtraida }.
  datos_ocr: unknown | null
```

3b. En `ordenBaseSchema`, después de `imagen_comprobante: z.string().optional(),` (línea ~230):

```ts
  datos_ocr: z.unknown().optional(),
```

- [ ] **Step 4: Persistir en `createOrden`**

En `src/actions/ordenes.ts`, dentro del objeto `insertData` de `createOrden`, después de `imagen_comprobante: data.imagen_comprobante ?? null,` (línea ~94):

```ts
    datos_ocr: data.datos_ocr ?? null,
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260707_ordenes_datos_ocr.sql src/features/ordenes/types/ordenes.ts src/actions/ordenes.ts
git commit -m "feat(ordenes): persistir OCR crudo en ordenes.datos_ocr para reproceso"
```

---

### Task 5: Gate de presentación (bloquear presentar incompletas)

**Files:**
- Modify: `src/actions/ordenes.ts` (`updateOrdenEstado`, `batchUpdateOrdenesEstado`)

**Interfaces:**
- Consumes: `evaluarCompletitud` (Task 2).
- Produces: ambas actions rechazan pasar a `presentada` una orden incompleta.

**Columnas del núcleo a traer para evaluar:** `tipo, nro_comprobante, token_osep, fecha_emision, nro_afiliado, nro_documento, obra_social, nombre_practica, honorario_calculado`.

- [ ] **Step 1: Import de `evaluarCompletitud`**

En `src/actions/ordenes.ts`, tras los imports existentes:

```ts
import { evaluarCompletitud } from '@/lib/ordenes/completitud'
```

- [ ] **Step 2: Gate en `updateOrdenEstado`**

Reemplazar el bloque que hoy trae solo `estado` (líneas ~238-247) para traer también el núcleo y chequear completitud cuando el destino es `presentada`:

```ts
  const NUCLEO_SEL =
    'estado, tipo, nro_comprobante, token_osep, fecha_emision, nro_afiliado, nro_documento, obra_social, nombre_practica, honorario_calculado'
  const { data: ordenActual } = await supabase
    .from('ordenes')
    .select(NUCLEO_SEL)
    .eq('id', ordenId)
    .eq('medico_id', user.id)
    .maybeSingle()
  if (!ordenActual) return { error: 'Orden no encontrada' }
  if (!transicionOrdenPermitida(ordenActual.estado as EstadoOrden, estado)) {
    return { error: `No se puede pasar de "${ordenActual.estado}" a "${estado}".` }
  }
  if (estado === 'presentada') {
    const { completa, faltantes } = evaluarCompletitud(ordenActual)
    if (!completa) {
      return { error: `Orden incompleta: faltan ${faltantes.length} datos. Completala antes de presentarla.` }
    }
  }
```

- [ ] **Step 3: Gate en `batchUpdateOrdenesEstado`**

En `batchUpdateOrdenesEstado`, antes del `.update(...)` masivo (línea ~279), agregar la verificación cuando el destino es `presentada`:

```ts
  if (estado === 'presentada') {
    const { data: filas } = await supabase
      .from('ordenes')
      .select('id, tipo, nro_comprobante, token_osep, fecha_emision, nro_afiliado, nro_documento, obra_social, nombre_practica, honorario_calculado')
      .in('id', ordenIds)
      .eq('medico_id', user.id)
      .eq('estado', 'borrador')
    const incompletas = (filas ?? []).filter((o) => !evaluarCompletitud(o).completa)
    if (incompletas.length > 0) {
      return { error: `${incompletas.length} orden(es) incompletas no se pueden presentar. Completalas primero.` }
    }
  }
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 5: Verificación manual (integración, patrón del proyecto)**

Con el server corriendo (`npm run dev`): crear una orden OS a la que le falte, p. ej., el N° de afiliado; intentar presentarla (individual y en lote) → debe rechazar con el mensaje. Completar el dato → debe presentar.

- [ ] **Step 6: Commit**

```bash
git add src/actions/ordenes.ts
git commit -m "feat(ordenes): bloquear presentar órdenes incompletas (individual y en lote)"
```

---

### Task 6: Form — honorario por sistema + pasar `datos_ocr`

**Files:**
- Modify: `src/features/ordenes/components/NuevaOrdenForm.tsx`

**Interfaces:**
- Consumes: `OCR_ORDEN_PROMPT_VERSION` (Task 1).
- Produces: el form ya no siembra honorario del importe; envía `datos_ocr` en el submit.

- [ ] **Step 1: Import de la versión del prompt**

Agregar a los imports del form:

```ts
import { OCR_ORDEN_PROMPT_VERSION } from '@/lib/ai/ocr-orden'
```

- [ ] **Step 2: Dejar de sembrar honorario desde el importe**

En `handleOcrExtracted`, **eliminar** la línea:

```ts
    setHonorario(data.importe ? String(data.importe) : '')
```

(El honorario queda gobernado por el `useEffect` de arancel y por la práctica del nomenclador. El importe leído sigue yendo a `total_cargo_afiliado`, que ya se autopobla desde `ocr?.total_cargo_afiliado` en su `Campo`.)

- [ ] **Step 3: Enviar `datos_ocr` en el submit**

Dentro de `handleSubmit`, en el objeto `comunes`, agregar tras `imagen_comprobante: imagenPath,`:

```ts
      datos_ocr: ocr ? { version: OCR_ORDEN_PROMPT_VERSION, datos: ocr } : undefined,
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 5: Verificación manual**

`npm run dev` → escanear una orden; el honorario debe venir del arancel/nomenclador (no del importe de la foto). Guardar y confirmar en la DB (`select datos_ocr from ordenes order by created_at desc limit 1;`) que `datos_ocr` quedó con `{ version, datos }`.

- [ ] **Step 6: Commit**

```bash
git add src/features/ordenes/components/NuevaOrdenForm.tsx
git commit -m "feat(ordenes): honorario siempre por sistema + persistir datos_ocr desde el form"
```

---

### Task 7: Form — chips "no encontrado" + banner de faltantes

**Files:**
- Modify: `src/features/ordenes/components/NuevaOrdenForm.tsx`

**Interfaces:**
- Consumes: `estadoCampoOcr` (Task 3), `NUCLEO_LABELS`, `CampoNucleo` (Task 1).

- [ ] **Step 1: Imports**

```ts
import { estadoCampoOcr } from '@/lib/ordenes/estado-campo-ocr'
import { NUCLEO_LABELS, type CampoNucleo } from '@/lib/ai/ocr-orden'
```

- [ ] **Step 2: Helper de estado de campo (reemplaza `isDudoso`)**

Debajo de `isDudoso`, agregar (sin borrar `isDudoso`, que otras secciones OSEP siguen usando):

```ts
  function estadoCampo(campo: string) {
    return estadoCampoOcr(campo, ocr?.no_encontrados ?? [], ocr?.campos_dudosos ?? [])
  }
  /** Estilo de outline según el estado OCR del campo del núcleo. */
  function outlineOcr(campo: string): React.CSSProperties {
    const e = estadoCampo(campo)
    if (e === 'no_encontrado') return { outline: '2px solid var(--color-error)' }
    if (e === 'dudoso') return { outline: '2px solid var(--color-warning)' }
    return {}
  }
```

- [ ] **Step 3: Banner de faltantes del núcleo (arriba del form)**

Debajo del banner verde "Datos extraídos" (después del bloque `{ocr && (...confianza...)}`), agregar:

```tsx
      {ocr && ocr.no_encontrados.length > 0 && (
        <div
          className="mb-6 rounded-lg px-4 py-3 text-sm"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-error)' }}
        >
          <p className="font-medium" style={{ color: 'var(--color-error)' }}>
            ⚠ Faltan {ocr.no_encontrados.length} datos importantes — cargalos a mano
          </p>
          <p className="mt-1" style={{ color: 'var(--color-foreground)' }}>
            {ocr.no_encontrados
              .map((c) => NUCLEO_LABELS[c as CampoNucleo] ?? c)
              .join(', ')}
          </p>
        </div>
      )}
```

- [ ] **Step 4: Aplicar `outlineOcr` a los campos del núcleo**

En los inputs del núcleo, cambiar el `outline` fijo por `outlineOcr(<clave OCR>)`. Claves y ubicaciones:
- `nombre_paciente` (input, ~línea 476): `...(outlineOcr('paciente'))` en lugar del `isDudoso('paciente')` ternario.
- `nro_afiliado` (input, ~545): `...outlineOcr('nro_afiliado')`.
- `nro_documento` (Campo, ~567): pasar `dudoso` sigue igual **o** mejor: agregar prop de estilo — usar el `Campo` con `dudoso={estadoCampo('nro_documento') !== 'ok'}` y además, para distinguir rojo de ámbar, ver Step 5.
- `nro_comprobante` (Campo, ~511): idem `estadoCampo('nro_comprobante')`.
- `fecha_emision` (Campo, ~523), `nombre_practica` (Campo, ~581), `cobertura` (Campo, ~564).

Para los inputs directos (`nombre_paciente`, `nro_afiliado`) reemplazar el objeto de estilo condicional por:

```tsx
              style={{ ...inputStyle, ...outlineOcr('paciente') }}
```
```tsx
                    className={inputBase} style={{ ...inputStyle, ...outlineOcr('nro_afiliado') }} />
```

- [ ] **Step 5: Soportar rojo/ámbar en el componente `Campo`**

Cambiar la firma de `Campo` para aceptar un `estado?: 'ok' | 'dudoso' | 'no_encontrado'` y derivar el outline (manteniendo `dudoso` por compat):

```tsx
function Campo({
  name, label, type = 'text', defaultValue, placeholder, mono, dudoso, estado, colSpan, step, min, onBlur,
}: {
  name: string; label: string; type?: string; defaultValue?: string | number
  placeholder?: string; mono?: boolean; dudoso?: boolean
  estado?: 'ok' | 'dudoso' | 'no_encontrado'
  colSpan?: boolean; step?: string; min?: string
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void
}) {
  const outline =
    estado === 'no_encontrado'
      ? { outline: '2px solid var(--color-error)' }
      : (estado === 'dudoso' || dudoso)
        ? { outline: '2px solid var(--color-warning)' }
        : {}
  return (
    <div className={colSpan ? 'md:col-span-2' : undefined}>
      <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)' }}>
        {label}
        {estado === 'no_encontrado' && (
          <span className="ml-2 text-xs font-normal" style={{ color: 'var(--color-error)' }}>
            · cargar a mano
          </span>
        )}
      </label>
      <input
        name={name} type={type} defaultValue={defaultValue} placeholder={placeholder}
        step={step} min={min} onBlur={onBlur}
        className={`${inputBase}${mono ? ' font-mono' : ''}`}
        style={{ ...inputStyle, ...outline }}
      />
    </div>
  )
}
```

Y en los `Campo` del núcleo, pasar `estado={estadoCampo('<clave>')}` en vez de `dudoso={isDudoso('<clave>')}`:
- `nro_comprobante`: `estado={estadoCampo('nro_comprobante')}`
- `fecha_emision`: `estado={estadoCampo('fecha_emision')}`
- `nro_documento`: `estado={estadoCampo('nro_documento')}`
- `nombre_practica`: `estado={estadoCampo('nombre_practica')}`
- `cobertura`: `estado={estadoCampo('cobertura')}`

(Los `Campo` de secciones OSEP que hoy usan `dudoso={isDudoso(...)}` —grupo_afiliado, token_osep— se dejan como están.)

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 7: Verificación manual**

`npm run dev` → escanear una orden a la que le falte un dato del núcleo (o forzar `no_encontrados` en la respuesta): el banner rojo lista los faltantes, los campos correspondientes muestran outline rojo + "· cargar a mano"; los `campos_dudosos` siguen en ámbar.

- [ ] **Step 8: Commit**

```bash
git add src/features/ordenes/components/NuevaOrdenForm.tsx
git commit -m "feat(ordenes): chips 'cargar a mano' + banner de datos faltantes del núcleo"
```

---

### Task 8: Form — secciones OSEP condicionales (`codigo_os === 327`)

**Files:**
- Modify: `src/features/ordenes/components/NuevaOrdenForm.tsx`

**Objetivo:** que las secciones/campos propios de OSEP solo aparezcan cuando la OS es OSEP; para otras OS el form muestra el núcleo limpio.

- [ ] **Step 1: Definir el flag**

Dentro del componente, cerca del `return`:

```tsx
  const esOsep = codigoOs === 327
```

- [ ] **Step 2: Condicionar las secciones OSEP-específicas**

Envolver con `{esOsep && ( ... )}` las secciones que son propias de OSEP (dejando el núcleo siempre visible). Condicionar:
- Sección **"Comprobante"** completa (Delegación, N° Comprobante, Título de autorización) — `~507-514`.
- En **"Fechas"**: dejar visibles `fecha_emision` (núcleo) y `fecha_solicitud`/`fecha_vencimiento` (útiles a toda OS); condicionar `fecha_prescripcion` y `hora_emision` a `esOsep`.
- En **"Titular y afiliado"**: `grupo_afiliado`, `titular_nombre`, `medico_solicitante` → dentro de `{esOsep && (...)}`. El bloque token ya está condicionado a `codigoOs === 327`.
- **"Beneficiario y documento"**: dejar `nro_documento`, `tipo_documento`, `cobertura` (núcleo/comunes); condicionar `parentesco` y `domicilio` a `esOsep`.
- Sección **"Práctica"**: dejar visible (núcleo); condicionar `cara`/`pieza` (odontología) a `esOsep`.
- Sección **"Origen"** (`~647-650`), y **"Arancel y total"** (arancelista, cajero) → dentro de `{esOsep && (...)}`. Dejar `total_cargo_afiliado` y `horario_realizacion` visibles para toda OS (mover esos dos fuera del bloque si hace falta, a una sección "Total").

Regla general: **núcleo + comunes siempre; jerga OSEP (delegación, arancelista, cajero, token, cara/pieza, parentesco, domicilio, prescripción) solo si `esOsep`.**

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 4: Verificación manual**

`npm run dev`:
- Escanear/seleccionar OSEP (cód 327) → aparecen las secciones OSEP completas (como hoy).
- Elegir otra OS (p. ej. Swiss Medical) → el form muestra solo núcleo + comunes, sin delegación/arancelista/cajero/token/cara-pieza.

- [ ] **Step 5: Commit**

```bash
git add src/features/ordenes/components/NuevaOrdenForm.tsx
git commit -m "feat(ordenes): mostrar campos OSEP solo para OSEP; núcleo genérico para toda OS"
```

---

### Task 9: Badge "Incompleta — faltan N" en detalle y listado

**Files:**
- Modify: `src/app/(main)/ordenes/[id]/page.tsx` (detalle)
- Modify: listado de órdenes (identificar el componente que renderiza cada fila/card en `src/features/ordenes/components/` o `src/app/(main)/ordenes/`)

**Interfaces:**
- Consumes: `evaluarCompletitud`, `CAMPO_FALTANTE_LABELS` (Task 2).

- [ ] **Step 1: Badge en el detalle**

En `src/app/(main)/ordenes/[id]/page.tsx`, tras obtener la `orden`, calcular y renderizar el badge cuando aplique (server component; `evaluarCompletitud` es pura):

```tsx
import { evaluarCompletitud, CAMPO_FALTANTE_LABELS } from '@/lib/ordenes/completitud'
// ...
const { completa, faltantes } = evaluarCompletitud(orden)
```

```tsx
{!completa && (
  <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-warning)' }}>
    <p className="font-medium" style={{ color: 'var(--color-warning)' }}>
      ⚠ Incompleta — faltan {faltantes.length} datos para presentar
    </p>
    <p className="mt-1" style={{ color: 'var(--color-foreground)' }}>
      {faltantes.map((f) => CAMPO_FALTANTE_LABELS[f]).join(', ')}
    </p>
  </div>
)}
```

- [ ] **Step 2: Badge compacto en el listado**

Localizar el render de fila/card del listado (buscar el archivo que mapea `ordenes` y muestra estado). Importar `evaluarCompletitud` y, por fila, mostrar un chip chico cuando `!evaluarCompletitud(orden).completa`:

```tsx
{!evaluarCompletitud(orden).completa && (
  <span className="text-xs px-2 py-0.5 rounded-full"
    style={{ background: 'var(--color-warning-light, rgba(245,158,11,0.15))', color: 'var(--color-warning)' }}>
    Incompleta
  </span>
)}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 4: Verificación manual**

`npm run dev`: una orden con datos faltantes muestra el badge en el listado y el detalle; una completa, no.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(main\)/ordenes/\[id\]/page.tsx
git add -A src/features/ordenes src/app/\(main\)/ordenes
git commit -m "feat(ordenes): badge 'Incompleta — faltan N' en listado y detalle"
```

---

## Cierre

- [ ] **Suite completa + typecheck**

Run: `npm run test` (esperado: suites nuevas verdes, sin regresiones) y `npm run typecheck`.

- [ ] **E2E manual (patrón del proyecto)** — matriz mínima:
  1. Foto OSEP → extrae núcleo + extras OSEP, honorario del sistema, guarda `datos_ocr`.
  2. Foto/carga de otra OS → solo núcleo, sin jerga OSEP; faltantes → chips rojos + banner.
  3. Orden incompleta → no se puede presentar (individual y en lote); al completar, presenta.
  4. Badge "Incompleta" aparece/desaparece en listado y detalle.

## Self-Review (cubierto)

- **Cobertura del spec:** núcleo 12 (Task 1 + completitud Task 2) ✓; no_encontrado vs dudoso (Task 1 schema + Task 3 helper + Task 7 UI) ✓; `datos_ocr` jsonb (Task 4) ✓; completitud derivada (Task 2) ✓; honorario por sistema (Task 6) ✓; gate de presentación (Task 5) ✓; form generalizado (Task 8) ✓; badge (Task 9) ✓; reconciliación con `riesgo-debito`/`campos_dudosos` (nota en Task 2/Task 7) ✓; reproceso futuro habilitado por `datos_ocr` (Task 4, no se construye) ✓.
- **Placeholders:** ninguno — cada paso trae código/comando concreto.
- **Consistencia de tipos:** `CAMPOS_NUCLEO`/`NUCLEO_LABELS`/`OCR_ORDEN_PROMPT_VERSION` (Task 1) usados en Task 6/7; `evaluarCompletitud`/`CAMPO_FALTANTE_LABELS` (Task 2) usados en Task 5/9; `estadoCampoOcr` (Task 3) usado en Task 7; `datos_ocr` (Task 4) usado en Task 6.
- **Nota de cobertura parcial (consciente):** el gate de completitud (Task 2) NO exige diagnóstico/firmas/plan (los cubre `riesgo-debito` o son informativos). Los 12 del núcleo sí se marcan como chips vía `no_encontrados`. Set de gate explícito y tuneable.

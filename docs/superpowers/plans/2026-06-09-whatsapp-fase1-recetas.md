# WhatsApp Fase 1 — Cobro de recetas (MercadoPago) · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El médico reenvía al bot los PDFs de recetas OSEP del día; cuando el paciente escribe y se identifica con nombre+DNI, el bot le manda un link de pago de MercadoPago (a nombre del médico); al confirmarse el pago, el bot entrega el PDF por WhatsApp — todo costo-cero en mensajería (paciente-inicia).

**Architecture:** Se extiende la Fase 0 (ya probada en vivo). El runner gana dos ramas reales: **médico** (recibe `document` → guarda PDF en Storage → OCR con Claude → crea fila `recetas` a precio fijo; comandos de texto `precio`/`recetas`) y **paciente** (al escribir: primero se entregan recetas pagadas sin entregar + reconciliación de pagos contra la API de MP, después el agente con tools `buscar_receta_paciente`/`cobrar_receta`). El webhook de MercadoPago **no confía en el body**: re-consulta el pago a la API de MP con el token del médico y valida referencia+monto+cobrador (`decidirAccionPago`, lógica pura TDD). Tokens MP cifrados con la misma capa AES-256-GCM de la Fase 0.

**Tech Stack:** Next.js 16 route handlers (nodejs) · `ai ^6` `generateObject`/`generateText` + tools Zod · OpenRouter → Claude Haiku 4.5 · Supabase (service-role + Storage bucket `recetas`) · MercadoPago Checkout Pro (preferences + payments API, OAuth) · vitest.

**Spec:** `docs/superpowers/specs/2026-06-09-whatsapp-recetas-turnos-design.md` §6 (todas las subsecciones) y §4 (tablas Fase 1).

---

## Resultado del spike (§6.9 — YA CERRADO, 2026-06-09)

`scripts/spike-ocr-pdf.mjs` contra el PDF real de receta RCD/OSEP:

- ✅ `generateObject` + content-part `{ type:'file', data: Buffer, mediaType:'application/pdf' }` **funciona** a través de `@openrouter/ai-sdk-provider` → Claude Haiku 4.5.
- ✅ Extrajo: nombre exacto, DNI exacto (23309087), medicamento, OS, prescriptor, matrícula, confianza `alta`. ~9.6s, ~$0.003/receta.
- ⚠️ El `nro_receta` (código de barras) salió con un dígito de menos → el prompt de producción pide transcripción **dígito por dígito** (y el nro solo se usa para dedupe, no para plata).
- **No hace falta plan B** (PDF→imagen).

## Prerrequisitos externos (el dueño)

1. **Aplicar la migración** (Task 1) en el SQL Editor de Supabase (proyecto `eylcrxhpccwobipcjzal`) — mismo procedimiento que la Fase 0.
2. **Crear una aplicación en MercadoPago** (mercadopago.com.ar/developers → "Tus integraciones" → Crear aplicación, producto **Checkout Pro**) y pasar el **Access Token de PRUEBA** (`TEST-...`) → se siembra con `scripts/seed-mp-conexion.mjs` (Task 12). El OAuth real es Task 13 (para el médico amigo, diferible).
3. `PUBLIC_BASE_URL` en `.env.local` = URL pública del túnel (para `notification_url` de MP). Cambia si el túnel se reinicia.

## Decisiones de implementación (concretan el spec, anotar si se discute)

- `external_reference` **se deriva** del id (`receta:<uuid>`), no es columna (id ya es UNIQUE).
- Vigencia de la receta: `RECETA_VIGENCIA_DIAS = 30` (lazy al buscar). El link de pago expira a los **7 días** (`expiration_date_to`), pero `cobrar_receta` genera un link fresco cada vez que el paciente lo pide.
- Mensajes del médico **no** se persisten en `wa_mensajes` (la tabla `recetas` es el registro); el enum `origen='medico'` queda disponible para más adelante.
- Si el médico no configuró precio → el bot rechaza el PDF y le pide `precio 5000` (setup una sola vez).
- Confirmación **por receta** (cada PDF llega como un mensaje separado de WhatsApp); el "lote" es la secuencia.
- Reconciliación anti-webhook-perdido: cuando el paciente escribe, además de entregar las `pagada` sin entregar, se re-consulta MP por `external_reference` para las `pendiente_pago` con preferencia creada (es exactamente el "el asistente verifica si pagó y libera el PDF" del flujo del dueño).
- La recomendación de la revisión de Fase 0 ("tests de integración antes de habilitar plata") se cumple con TDD exhaustivo de **toda decisión de dinero como lógica pura**: `decidirAccionPago`, `procesarPagoNotificado` (orquestador con deps inyectadas + fakes), builders de preferencia y matching de identidad.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20260610_recetas_mercadopago.sql` (crear) | Tablas `recetas` + `mp_conexiones` + bucket `recetas` con policies. |
| `src/lib/recetas/normalizar.ts` (+test) | Puro: `normalizarDni`, `normalizarNombre`, `nombresCoinciden`, `parseMontoArs`. |
| `src/lib/whatsapp/client.ts` (modificar) | + `fetchWhatsAppMedia`, `uploadWhatsAppMedia`, `sendWhatsAppDocument`. |
| `src/lib/ai/ocr-receta.ts` (+test) | Schema Zod + prompt + `extraerRecetaDePdf(Buffer)` + `validarIdentidadExtraida` (puro). |
| `src/features/whatsapp/services/storageRecetas.ts` | `subirPdfReceta` / `descargarPdfReceta` (bucket `recetas`). |
| `src/lib/mercadopago/client.ts` (+test) | `buildExternalReference`/`parse`, `buildPreferenciaBody` (puros), `crearPreferencia`, `consultarPago`, `buscarPagoAprobadoPorReferencia`, tipo `PagoMP`. |
| `src/lib/mercadopago/validarPago.ts` (+test) | **Decisión de dinero** pura: `decidirAccionPago`. |
| `src/lib/mercadopago/procesarPago.ts` (+test) | Orquestador del webhook con deps inyectadas: `procesarPagoNotificado`. |
| `src/features/whatsapp/services/mpConexiones.ts` | `getConexionActiva` (descifra, refresh, marca `reconectar`). |
| `src/features/whatsapp/services/recetasService.ts` | CRUD recetas: crear desde OCR, buscar por identidad, marcar pagada/entregada, resumen. |
| `src/features/whatsapp/services/configAgente.ts` | `getPrecioReceta` / `setPrecioReceta`. |
| `src/features/whatsapp/services/entrega.ts` | `entregarReceta` + `entregarPendientes` (incluye reconciliación MP). |
| `src/features/whatsapp/services/canales.ts` (modificar) | + `getCanalByMedicoId`. |
| `src/features/whatsapp/agent/tools.ts` (crear) | `buildPacienteTools` (`buscar_receta_paciente`, `cobrar_receta`). |
| `src/features/whatsapp/agent/runAgentTurn.ts` (modificar) | Acepta `tools` + `stopWhen: stepCountIs(5)`. |
| `src/features/whatsapp/agent/systemPrompt.ts` (modificar) | Instrucciones del flujo de cobro. |
| `src/features/whatsapp/runner.ts` (reescribir) | Ramas médico (PDF/comandos) y paciente (entrega + agente con tools). |
| `src/app/api/mercadopago/webhook/route.ts` (crear) | Webhook MP (thin, delega en `procesarPagoNotificado`). |
| `scripts/seed-mp-conexion.mjs` (crear) | Siembra `mp_conexiones` con el token TEST cifrado. |
| `src/app/api/mercadopago/oauth/route.ts` + `oauth/callback/route.ts` (crear, Task 13) | OAuth "Conectar MercadoPago". |

---

## Task 1: Migración — `recetas`, `mp_conexiones` y bucket `recetas`

**Files:**
- Create: `supabase/migrations/20260610_recetas_mercadopago.sql`

- [ ] **Step 1: Crear la migración**

```sql
-- ============================================================================
-- WhatsApp Fase 1 — cobro de recetas: mp_conexiones, recetas, bucket recetas
-- ============================================================================

-- ── mp_conexiones: OAuth/token de MercadoPago por médico (cifrado) ──────────
CREATE TABLE mp_conexiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  mp_user_id TEXT NOT NULL,
  access_token_cifrado TEXT NOT NULL,
  refresh_token_cifrado TEXT,
  expires_at TIMESTAMPTZ,
  estado TEXT NOT NULL DEFAULT 'conectado' CHECK (estado IN ('conectado', 'reconectar')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mp_conexiones_medico_id ON mp_conexiones(medico_id);
ALTER TABLE mp_conexiones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mp_conexiones_select" ON mp_conexiones FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "mp_conexiones_insert" ON mp_conexiones FOR INSERT WITH CHECK (auth.uid() = medico_id);
CREATE POLICY "mp_conexiones_update" ON mp_conexiones FOR UPDATE USING (auth.uid() = medico_id);
CREATE POLICY "mp_conexiones_delete" ON mp_conexiones FOR DELETE USING (auth.uid() = medico_id);

-- ── recetas: receta + estado de cobro ────────────────────────────────────────
CREATE TABLE recetas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contacto_id UUID REFERENCES wa_contactos(id) ON DELETE SET NULL,
  paciente_nombre TEXT NOT NULL DEFAULT '',
  paciente_dni TEXT NOT NULL DEFAULT '',
  paciente_telefono TEXT,
  pdf_path TEXT NOT NULL,
  nro_receta TEXT,
  monto DECIMAL(12,2),
  estado TEXT NOT NULL DEFAULT 'pendiente_pago'
    CHECK (estado IN ('pendiente_datos', 'pendiente_pago', 'pagada', 'entregada', 'vencida', 'devuelta')),
  mp_preference_id TEXT,
  mp_payment_id TEXT,
  datos_ocr JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_recetas_medico_nro ON recetas(medico_id, nro_receta)
  WHERE nro_receta IS NOT NULL AND nro_receta <> '';
CREATE INDEX idx_recetas_medico_id ON recetas(medico_id);
CREATE INDEX idx_recetas_estado ON recetas(medico_id, estado);
CREATE INDEX idx_recetas_dni ON recetas(medico_id, paciente_dni);
CREATE INDEX idx_recetas_telefono ON recetas(medico_id, paciente_telefono);
ALTER TABLE recetas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recetas_select" ON recetas FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "recetas_insert" ON recetas FOR INSERT WITH CHECK (auth.uid() = medico_id);
CREATE POLICY "recetas_update" ON recetas FOR UPDATE USING (auth.uid() = medico_id);
CREATE POLICY "recetas_delete" ON recetas FOR DELETE USING (auth.uid() = medico_id);

-- ── bucket privado para los PDFs (mismo patrón que 'comprobantes') ──────────
insert into storage.buckets (id, name, public) values ('recetas', 'recetas', false)
on conflict (id) do nothing;

create policy "recetas_storage_select" on storage.objects for select
  using (bucket_id = 'recetas' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "recetas_storage_insert" on storage.objects for insert
  with check (bucket_id = 'recetas' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "recetas_storage_update" on storage.objects for update
  using (bucket_id = 'recetas' and (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 2: Aplicar** — el dueño la pega en el SQL Editor de Supabase (`eylcrxhpccwobipcjzal`) → Run → "Success". (El sistema escribe vía service-role; el RLS protege el acceso con sesión.)

- [ ] **Step 3: Verificar** (cuando esté aplicada):
```sql
select tablename, rowsecurity from pg_tables where tablename in ('recetas','mp_conexiones');
select id, public from storage.buckets where id = 'recetas';
```
Expected: 2 tablas con `rowsecurity=true`; bucket `recetas` con `public=false`.

- [ ] **Step 4: Commit**
```bash
git add supabase/migrations/20260610_recetas_mercadopago.sql
git commit -m "feat(db): tablas recetas + mp_conexiones + bucket recetas (Fase 1)"
```

---

## Task 2: Normalización e identidad (TDD)

**Files:**
- Create: `src/lib/recetas/normalizar.ts`
- Test: `src/lib/recetas/normalizar.test.ts`

- [ ] **Step 1: Test que falla**

```ts
import { describe, it, expect } from 'vitest'
import { normalizarDni, normalizarNombre, nombresCoinciden, parseMontoArs } from './normalizar'

describe('normalizarDni', () => {
  it('deja solo dígitos', () => {
    expect(normalizarDni('23.309.087')).toBe('23309087')
    expect(normalizarDni(' 23309087 ')).toBe('23309087')
    expect(normalizarDni('DNI 23309087')).toBe('23309087')
  })
})

describe('normalizarNombre', () => {
  it('baja a minúsculas, quita acentos y colapsa espacios', () => {
    expect(normalizarNombre('  Héctor   Fernando MARTÍNEZ ')).toBe('hector fernando martinez')
  })
})

describe('nombresCoinciden', () => {
  it('matchea nombre parcial contra completo', () => {
    expect(nombresCoinciden('Héctor Fernando Martinez', 'hector martinez')).toBe(true)
  })
  it('matchea con acentos y mayúsculas distintas', () => {
    expect(nombresCoinciden('HÉCTOR MARTÍNEZ', 'hector martinez')).toBe(true)
  })
  it('no matchea personas distintas', () => {
    expect(nombresCoinciden('Héctor Fernando Martinez', 'Maria Lopez')).toBe(false)
  })
  it('un solo apellido alcanza (el DNI ya matcheó antes)', () => {
    expect(nombresCoinciden('Héctor Fernando Martinez', 'Martinez')).toBe(true)
  })
  it('vacíos no matchean', () => {
    expect(nombresCoinciden('', 'Martinez')).toBe(false)
  })
})

describe('parseMontoArs', () => {
  it('parsea formatos argentinos', () => {
    expect(parseMontoArs('5000')).toBe(5000)
    expect(parseMontoArs('5.000')).toBe(5000)
    expect(parseMontoArs('7.500,50')).toBe(7500.5)
    expect(parseMontoArs('$ 5000')).toBe(5000)
  })
  it('rechaza basura y no-positivos', () => {
    expect(parseMontoArs('abc')).toBeNull()
    expect(parseMontoArs('0')).toBeNull()
    expect(parseMontoArs('')).toBeNull()
  })
})
```

- [ ] **Step 2: Correr y ver fallar** — `npm test -- src/lib/recetas/normalizar.test.ts` → FAIL "Cannot find module".

- [ ] **Step 3: Implementar**

```ts
/** Normalización de identidad y montos para el cobro de recetas. Funciones puras. */

export function normalizarDni(s: string): string {
  return (s ?? '').replace(/\D/g, '')
}

export function normalizarNombre(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Coincidencia de nombre tolerante: tokens (≥3 letras) del nombre dado contra el
 * de la receta. Se usa DESPUÉS de matchear el DNI exacto — el nombre confirma.
 */
export function nombresCoinciden(nombreReceta: string, nombreDado: string): boolean {
  const tokensReceta = new Set(normalizarNombre(nombreReceta).split(' ').filter((t) => t.length >= 3))
  const tokensDados = normalizarNombre(nombreDado).split(' ').filter((t) => t.length >= 3)
  if (!tokensReceta.size || !tokensDados.length) return false
  const comunes = tokensDados.filter((t) => tokensReceta.has(t)).length
  return comunes >= Math.min(2, tokensReceta.size, tokensDados.length)
}

/** '5.000' → 5000 · '7.500,50' → 7500.5 (formato argentino: punto miles, coma decimal). */
export function parseMontoArs(s: string): number | null {
  const limpio = (s ?? '').replace(/[$\s]/g, '')
  if (!limpio) return null
  const n = Number(limpio.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}
```

- [ ] **Step 4: Verde** — `npm test -- src/lib/recetas/normalizar.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git add src/lib/recetas && git commit -m "feat(recetas): normalización de identidad y montos (TDD)"`

---

## Task 3: Cliente Meta — media (descargar/subir/enviar PDF)

**Files:**
- Modify: `src/lib/whatsapp/client.ts` (agregar al final; no tocar lo existente)

- [ ] **Step 1: Agregar las tres funciones**

```ts
/** Descarga un archivo de media de WhatsApp (imagen/PDF) como Buffer. */
export async function fetchWhatsAppMedia(
  mediaId: string,
  accessToken: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const meta = await fetch(`${GRAPH_BASE}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then((r) => r.json())
    if (!meta?.url) return null
    const bin = await fetch(meta.url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!bin.ok) return null
    return {
      buffer: Buffer.from(await bin.arrayBuffer()),
      mimeType: typeof meta.mime_type === 'string' ? meta.mime_type : 'application/octet-stream',
    }
  } catch {
    return null
  }
}

/** Sube un archivo a Meta y devuelve su media_id (para enviarlo como document). */
export async function uploadWhatsAppMedia(params: {
  phoneNumberId: string
  accessToken: string
  buffer: Buffer
  mimeType: string
  filename: string
}): Promise<string | null> {
  const form = new FormData()
  form.append('messaging_product', 'whatsapp')
  form.append('type', params.mimeType)
  form.append('file', new Blob([new Uint8Array(params.buffer)], { type: params.mimeType }), params.filename)
  const res = await fetch(`${GRAPH_BASE}/${params.phoneNumberId}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${params.accessToken}` },
    body: form,
  })
  if (!res.ok) {
    console.error('WhatsApp uploadMedia error:', await res.text())
    return null
  }
  const json = (await res.json()) as { id?: string }
  return json?.id ?? null
}

/** Envía un documento (PDF) por media_id. Meta lo entrega con link autenticado temporal. */
export async function sendWhatsAppDocument(
  params: SendParams & { mediaId: string; filename: string; caption?: string },
): Promise<boolean> {
  const res = await fetch(`${GRAPH_BASE}/${params.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${params.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizeRecipient(params.to),
      type: 'document',
      document: { id: params.mediaId, filename: params.filename, caption: params.caption },
    }),
  })
  if (!res.ok) console.error('WhatsApp sendDocument error:', await res.text())
  return res.ok
}
```

- [ ] **Step 2: Verificar** — `npm run typecheck` → sin errores; `npm test` → los existentes verdes.
- [ ] **Step 3: Commit** — `git add src/lib/whatsapp/client.ts && git commit -m "feat(whatsapp): media de Meta (descargar/subir/enviar PDF como document)"`

---

## Task 4: OCR de receta (schema + prompt + extracción)

**Files:**
- Create: `src/lib/ai/ocr-receta.ts`
- Test: `src/lib/ai/ocr-receta.test.ts`

- [ ] **Step 1: Test que falla (solo la parte pura)**

```ts
import { describe, it, expect } from 'vitest'
import { validarIdentidadExtraida, type RecetaExtraida } from './ocr-receta'

const base: RecetaExtraida = {
  paciente_nombre: 'Héctor Fernando Martinez',
  paciente_dni: '23309087',
  nro_receta: '9600011664690',
  obra_social: 'OSEP Catamarca',
  fecha_creada: '2026-06-08',
  prescriptor_nombre: 'Miguel Alberto Moreno',
  prescriptor_matricula: '1735',
  medicamentos: [{ droga: 'TADALAFILO', presentacion: '5 mg comp.rec.x 30', cantidad: '1' }],
  diagnosticos: [{ texto: 'Disuria', codigo: 'Z76.9' }],
  confianza: 'alta',
}

describe('validarIdentidadExtraida', () => {
  it('acepta identidad completa con confianza alta', () => {
    expect(validarIdentidadExtraida(base)).toBe(true)
  })
  it('acepta confianza media', () => {
    expect(validarIdentidadExtraida({ ...base, confianza: 'media' })).toBe(true)
  })
  it('rechaza confianza baja', () => {
    expect(validarIdentidadExtraida({ ...base, confianza: 'baja' })).toBe(false)
  })
  it('rechaza DNI corto o vacío', () => {
    expect(validarIdentidadExtraida({ ...base, paciente_dni: '123' })).toBe(false)
    expect(validarIdentidadExtraida({ ...base, paciente_dni: '' })).toBe(false)
  })
  it('rechaza nombre vacío o ínfimo', () => {
    expect(validarIdentidadExtraida({ ...base, paciente_nombre: 'X' })).toBe(false)
  })
})
```

- [ ] **Step 2: Correr y ver fallar** — `npm test -- src/lib/ai/ocr-receta.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```ts
import { z } from 'zod'
import { generateObject } from 'ai'
import { openrouter, MODELS } from '@/lib/ai/openrouter'
import { normalizarDni, normalizarNombre } from '@/lib/recetas/normalizar'

// Estilo "anti-Claude" como ocr-orden.ts: campos string requeridos, "" cuando falta
// (evita .nullable()/.optional() que complican el tool-schema de Claude).
export const recetaExtraidaSchema = z.object({
  paciente_nombre: z.string().describe('Nombre completo del paciente tal como figura. "" si no se lee.'),
  paciente_dni: z.string().describe('DNI del paciente, SOLO dígitos sin puntos. "" si no se lee.'),
  nro_receta: z.string().describe('Número del código de barras superior, transcripto DÍGITO POR DÍGITO. "" si no se lee.'),
  obra_social: z.string().describe('Obra social (ej. "OSEP Catamarca"). "" si no figura.'),
  fecha_creada: z.string().describe('Fecha de creación en formato YYYY-MM-DD. "" si no se lee.'),
  prescriptor_nombre: z.string().describe('Nombre del médico prescriptor. "" si no figura.'),
  prescriptor_matricula: z.string().describe('Matrícula del prescriptor (solo el número). "" si no figura.'),
  medicamentos: z.array(
    z.object({
      droga: z.string().describe('Nombre genérico/droga (ej. TADALAFILO)'),
      presentacion: z.string().describe('Presentación (ej. "5 mg comp.rec.x 30")'),
      cantidad: z.string().describe('Cantidad recetada (ej. "1")'),
    }),
  ),
  diagnosticos: z.array(
    z.object({
      texto: z.string(),
      codigo: z.string().describe('Código CIE-10 si figura (ej. "Z76.9"), "" si no'),
    }),
  ),
  confianza: z
    .enum(['alta', 'media', 'baja'])
    .describe('alta = nombre y DNI se leen perfecto; media = dudas menores en otros campos; baja = nombre o DNI ilegibles/dudosos'),
})

export type RecetaExtraida = z.infer<typeof recetaExtraidaSchema>

export const OCR_RECETA_PROMPT = `Sos un extractor de datos de recetas médicas electrónicas argentinas (formato RCD — "Tu Recetario Digital" — usado por OSEP Catamarca).
Extraé EXACTAMENTE lo impreso, sin inventar nada. Si un campo no se lee con claridad, devolvé "".
Reglas:
- paciente_dni: SOLO dígitos, sin puntos ni espacios. NO confundir con el CUIL (el CUIL tiene 11 dígitos; el DNI 7-8).
- nro_receta: transcribí el número que acompaña al código de barras superior DÍGITO POR DÍGITO, verificando uno por uno.
- fecha_creada: convertir a YYYY-MM-DD.
- confianza: 'alta' solo si nombre y DNI del paciente se leen perfecto.`

/** Corre el OCR sobre el PDF de la receta (probado en spike: content-part 'file' + Claude Haiku 4.5). */
export async function extraerRecetaDePdf(pdf: Buffer): Promise<RecetaExtraida> {
  const { object } = await generateObject({
    model: openrouter(MODELS.vision),
    schema: recetaExtraidaSchema,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: OCR_RECETA_PROMPT },
          { type: 'file', data: pdf, mediaType: 'application/pdf' },
        ],
      },
    ],
  })
  return object
}

/** ¿La identidad extraída alcanza para cobrar sin riesgo de entregar a la persona equivocada? */
export function validarIdentidadExtraida(r: RecetaExtraida): boolean {
  if (r.confianza === 'baja') return false
  if (normalizarDni(r.paciente_dni).length < 7) return false
  if (normalizarNombre(r.paciente_nombre).length < 5) return false
  return true
}
```

- [ ] **Step 4: Verde** — `npm test -- src/lib/ai/ocr-receta.test.ts` → PASS; `npm run typecheck` limpio.
- [ ] **Step 5: Commit** — `git add src/lib/ai/ocr-receta.ts src/lib/ai/ocr-receta.test.ts && git commit -m "feat(ocr): schema y extracción de receta OSEP desde PDF (Claude vía OpenRouter)"`

---

## Task 5: Storage de recetas

**Files:**
- Create: `src/features/whatsapp/services/storageRecetas.ts`

- [ ] **Step 1: Implementar**

```ts
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'recetas'

/** Sube el PDF al bucket privado. Path: <medico_id>/<uuid>.pdf (mismo patrón que 'comprobantes'). */
export async function subirPdfReceta(
  db: SupabaseClient,
  medicoId: string,
  buffer: Buffer,
): Promise<string | null> {
  const path = `${medicoId}/${randomUUID()}.pdf`
  const { error } = await db.storage.from(BUCKET).upload(path, buffer, { contentType: 'application/pdf' })
  if (error) {
    console.error('[recetas] storage upload error:', error.message)
    return null
  }
  return path
}

export async function descargarPdfReceta(db: SupabaseClient, path: string): Promise<Buffer | null> {
  const { data, error } = await db.storage.from(BUCKET).download(path)
  if (error || !data) {
    console.error('[recetas] storage download error:', error?.message)
    return null
  }
  return Buffer.from(await data.arrayBuffer())
}
```

- [ ] **Step 2: Verificar** — `npm run typecheck` limpio.
- [ ] **Step 3: Commit** — `git add src/features/whatsapp/services/storageRecetas.ts && git commit -m "feat(recetas): storage de PDFs en bucket privado"`

---

## Task 6: Cliente MercadoPago (TDD en los builders)

**Files:**
- Create: `src/lib/mercadopago/client.ts`
- Test: `src/lib/mercadopago/client.test.ts`

- [ ] **Step 1: Test que falla**

```ts
import { describe, it, expect } from 'vitest'
import { buildExternalReference, parseExternalReference, buildPreferenciaBody } from './client'

const RECETA_ID = '123e4567-e89b-42d3-a456-426614174000'

describe('external_reference', () => {
  it('round-trip', () => {
    const ref = buildExternalReference(RECETA_ID)
    expect(ref).toBe(`receta:${RECETA_ID}`)
    expect(parseExternalReference(ref)).toBe(RECETA_ID)
  })
  it('rechaza referencias ajenas o malformadas', () => {
    expect(parseExternalReference('otra:cosa')).toBeNull()
    expect(parseExternalReference('receta:no-es-uuid')).toBeNull()
    expect(parseExternalReference('')).toBeNull()
  })
})

describe('buildPreferenciaBody', () => {
  it('arma la preferencia con expiración a 7 días, ARS y referencia', () => {
    const ahora = new Date('2026-06-10T12:00:00.000Z')
    const body = buildPreferenciaBody(
      {
        recetaId: RECETA_ID,
        titulo: 'Receta médica',
        monto: 5000,
        notificationUrl: 'https://tunel.example/api/mercadopago/webhook?receta=' + RECETA_ID,
        expiraEnDias: 7,
      },
      ahora,
    )
    expect(body.items[0]).toEqual({ title: 'Receta médica', quantity: 1, unit_price: 5000, currency_id: 'ARS' })
    expect(body.external_reference).toBe(`receta:${RECETA_ID}`)
    expect(body.notification_url).toContain('/api/mercadopago/webhook?receta=')
    expect(body.expires).toBe(true)
    expect(body.expiration_date_to).toBe('2026-06-17T12:00:00.000Z')
  })
})
```

- [ ] **Step 2: Correr y ver fallar** — `npm test -- src/lib/mercadopago/client.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```ts
/** Cliente HTTP de MercadoPago (Checkout Pro). El token SIEMPRE es del médico. */

const MP_BASE = 'https://api.mercadopago.com'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function buildExternalReference(recetaId: string): string {
  return `receta:${recetaId}`
}

export function parseExternalReference(ref: string): string | null {
  if (!ref.startsWith('receta:')) return null
  const id = ref.slice('receta:'.length)
  return UUID_RE.test(id) ? id : null
}

export interface PreferenciaInput {
  recetaId: string
  titulo: string
  monto: number
  notificationUrl: string
  expiraEnDias: number
}

export function buildPreferenciaBody(input: PreferenciaInput, ahora: Date) {
  const expira = new Date(ahora.getTime() + input.expiraEnDias * 24 * 60 * 60 * 1000)
  return {
    items: [{ title: input.titulo, quantity: 1, unit_price: input.monto, currency_id: 'ARS' }],
    external_reference: buildExternalReference(input.recetaId),
    notification_url: input.notificationUrl,
    expires: true,
    expiration_date_to: expira.toISOString(),
  }
}

export async function crearPreferencia(
  accessToken: string,
  body: ReturnType<typeof buildPreferenciaBody>,
): Promise<{ id: string; initPoint: string } | null> {
  const res = await fetch(`${MP_BASE}/checkout/preferences`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    console.error('[mp] crearPreferencia error:', await res.text())
    return null
  }
  const json = (await res.json()) as { id?: string; init_point?: string; sandbox_init_point?: string }
  if (!json?.id || !json?.init_point) return null
  return { id: json.id, initPoint: json.init_point }
}

export interface PagoMP {
  id: string
  status: string
  externalReference: string
  transactionAmount: number
  collectorId: string
}

function mapPago(json: Record<string, unknown>): PagoMP {
  const collector = json.collector as { id?: unknown } | undefined
  return {
    id: String(json.id ?? ''),
    status: String(json.status ?? ''),
    externalReference: String(json.external_reference ?? ''),
    transactionAmount: Number(json.transaction_amount ?? NaN),
    collectorId: String(json.collector_id ?? collector?.id ?? ''),
  }
}

export async function consultarPago(accessToken: string, paymentId: string): Promise<PagoMP | null> {
  const res = await fetch(`${MP_BASE}/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    console.error('[mp] consultarPago error:', res.status, await res.text())
    return null
  }
  return mapPago((await res.json()) as Record<string, unknown>)
}

/** Reconciliación: busca un pago APROBADO por external_reference (por si el webhook se perdió). */
export async function buscarPagoAprobadoPorReferencia(
  accessToken: string,
  externalReference: string,
): Promise<PagoMP | null> {
  const url = `${MP_BASE}/v1/payments/search?sort=date_created&criteria=desc&external_reference=${encodeURIComponent(externalReference)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) return null
  const json = (await res.json()) as { results?: Record<string, unknown>[] }
  const aprobado = (json.results ?? []).map(mapPago).find((p) => p.status === 'approved')
  return aprobado ?? null
}
```

- [ ] **Step 4: Verde** — `npm test -- src/lib/mercadopago/client.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git add src/lib/mercadopago && git commit -m "feat(mp): cliente MercadoPago (preferencias, pagos, búsqueda por referencia)"`

---

## Task 7: Decisión de pago — `decidirAccionPago` (TDD, lógica de plata)

**Files:**
- Create: `src/lib/mercadopago/validarPago.ts`
- Test: `src/lib/mercadopago/validarPago.test.ts`

- [ ] **Step 1: Test que falla (exhaustivo — esto decide si se entrega o no)**

```ts
import { describe, it, expect } from 'vitest'
import { decidirAccionPago } from './validarPago'
import type { PagoMP } from './client'

const RECETA = { id: '123e4567-e89b-42d3-a456-426614174000', monto: 5000, estado: 'pendiente_pago' }
const MP_USER = '111222333'

function pago(over: Partial<PagoMP> = {}): PagoMP {
  return {
    id: '99887766',
    status: 'approved',
    externalReference: `receta:${RECETA.id}`,
    transactionAmount: 5000,
    collectorId: MP_USER,
    ...over,
  }
}

describe('decidirAccionPago', () => {
  it('aprobado + todo coincide + pendiente_pago → entregar', () => {
    expect(decidirAccionPago({ pago: pago(), receta: RECETA, mpUserId: MP_USER }))
      .toEqual({ accion: 'marcar_pagada_y_entregar' })
  })
  it('aprobado + receta ya pagada (entrega pendiente) → reintenta entrega', () => {
    expect(decidirAccionPago({ pago: pago(), receta: { ...RECETA, estado: 'pagada' }, mpUserId: MP_USER }))
      .toEqual({ accion: 'marcar_pagada_y_entregar' })
  })
  it('receta ya entregada → ignorar (idempotencia)', () => {
    const d = decidirAccionPago({ pago: pago(), receta: { ...RECETA, estado: 'entregada' }, mpUserId: MP_USER })
    expect(d.accion).toBe('ignorar')
  })
  it('external_reference ajena → ignorar (cross-tenant)', () => {
    const d = decidirAccionPago({ pago: pago({ externalReference: 'receta:00000000-0000-4000-8000-000000000000' }), receta: RECETA, mpUserId: MP_USER })
    expect(d.accion).toBe('ignorar')
  })
  it('cobrador distinto al médico → ignorar (cross-tenant)', () => {
    const d = decidirAccionPago({ pago: pago({ collectorId: '999' }), receta: RECETA, mpUserId: MP_USER })
    expect(d.accion).toBe('ignorar')
  })
  it('monto no coincide → ignorar', () => {
    const d = decidirAccionPago({ pago: pago({ transactionAmount: 1 }), receta: RECETA, mpUserId: MP_USER })
    expect(d.accion).toBe('ignorar')
  })
  it('monto null en receta → ignorar', () => {
    const d = decidirAccionPago({ pago: pago(), receta: { ...RECETA, monto: null }, mpUserId: MP_USER })
    expect(d.accion).toBe('ignorar')
  })
  it.each(['pending', 'in_process', 'rejected', 'cancelled'])('status %s → ignorar', (status) => {
    const d = decidirAccionPago({ pago: pago({ status }), receta: RECETA, mpUserId: MP_USER })
    expect(d.accion).toBe('ignorar')
  })
  it.each(['refunded', 'charged_back'])('status %s → avisar devolución al médico', (status) => {
    const d = decidirAccionPago({ pago: pago({ status }), receta: { ...RECETA, estado: 'entregada' }, mpUserId: MP_USER })
    expect(d.accion).toBe('avisar_devolucion')
  })
})
```

- [ ] **Step 2: Correr y ver fallar.**

- [ ] **Step 3: Implementar**

```ts
import { buildExternalReference, type PagoMP } from './client'

export type AccionPago =
  | { accion: 'marcar_pagada_y_entregar' }
  | { accion: 'ignorar'; motivo: string }
  | { accion: 'avisar_devolucion'; motivo: string }

export interface RecetaParaValidar {
  id: string
  monto: number | null
  estado: string
}

/**
 * Decide qué hacer con un pago notificado/consultado. NO confía en el body del
 * webhook: el `pago` viene de re-consultar la API de MP con el token del médico.
 * Reglas de oro: referencia exacta, cobrador = médico dueño, monto exacto.
 */
export function decidirAccionPago(args: {
  pago: PagoMP
  receta: RecetaParaValidar
  mpUserId: string
}): AccionPago {
  const { pago, receta, mpUserId } = args

  if (pago.externalReference !== buildExternalReference(receta.id)) {
    return { accion: 'ignorar', motivo: 'external_reference no corresponde a esta receta' }
  }
  if (!mpUserId || pago.collectorId !== mpUserId) {
    return { accion: 'ignorar', motivo: 'el cobrador del pago no es el médico dueño' }
  }
  if (pago.status === 'refunded' || pago.status === 'charged_back') {
    return { accion: 'avisar_devolucion', motivo: `pago ${pago.id} en estado ${pago.status}` }
  }
  if (pago.status !== 'approved') {
    return { accion: 'ignorar', motivo: `status ${pago.status} no aprueba entrega` }
  }
  if (receta.monto == null || pago.transactionAmount !== Number(receta.monto)) {
    return { accion: 'ignorar', motivo: 'el monto pagado no coincide con la receta' }
  }
  if (receta.estado === 'entregada') {
    return { accion: 'ignorar', motivo: 'la receta ya fue entregada' }
  }
  if (receta.estado !== 'pendiente_pago' && receta.estado !== 'pagada') {
    return { accion: 'ignorar', motivo: `estado de receta ${receta.estado} no admite cobro` }
  }
  return { accion: 'marcar_pagada_y_entregar' }
}
```

- [ ] **Step 4: Verde** — `npm test -- src/lib/mercadopago/validarPago.test.ts` → PASS (12 tests).
- [ ] **Step 5: Commit** — `git add src/lib/mercadopago/validarPago.* && git commit -m "feat(mp): decisión de pago pura con validación cross-tenant (TDD)"`

---

## Task 8: Servicios de datos (conexión MP, recetas, precio, canal por médico)

**Files:**
- Create: `src/features/whatsapp/services/mpConexiones.ts`
- Create: `src/features/whatsapp/services/recetasService.ts`
- Create: `src/features/whatsapp/services/configAgente.ts`
- Modify: `src/features/whatsapp/services/canales.ts` (agregar `getCanalByMedicoId`)

> Todos reciben el cliente **service-role** y filtran `medico_id` manualmente (igual que la Fase 0).

- [ ] **Step 1: `mpConexiones.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { cifrar, descifrar } from '@/lib/crypto/encryption'

export interface ConexionMP {
  mpUserId: string
  accessToken: string // ya descifrado
}

interface ConexionRow {
  mp_user_id: string
  access_token_cifrado: string
  refresh_token_cifrado: string | null
  expires_at: string | null
  estado: string
}

/**
 * Devuelve la conexión MP utilizable del médico (token descifrado), refrescándola
 * si está por expirar. Si no se puede usar/refrescar → marca 'reconectar' y null.
 */
export async function getConexionActiva(db: SupabaseClient, medicoId: string): Promise<ConexionMP | null> {
  const { data } = await db
    .from('mp_conexiones')
    .select('mp_user_id, access_token_cifrado, refresh_token_cifrado, expires_at, estado')
    .eq('medico_id', medicoId)
    .maybeSingle()
  let row = data as ConexionRow | null
  if (!row || row.estado !== 'conectado') return null

  const expiraPronto = row.expires_at && new Date(row.expires_at).getTime() - Date.now() < 24 * 60 * 60 * 1000
  if (expiraPronto) {
    const ok = await refrescarToken(db, medicoId, row)
    if (!ok) return null
    const { data: data2 } = await db
      .from('mp_conexiones')
      .select('mp_user_id, access_token_cifrado, refresh_token_cifrado, expires_at, estado')
      .eq('medico_id', medicoId)
      .maybeSingle()
    row = data2 as ConexionRow | null
    if (!row) return null
  }
  return { mpUserId: row.mp_user_id, accessToken: descifrar(row.access_token_cifrado) }
}

/** Refresca el token OAuth. Si falla (o no hay refresh_token/credenciales) → estado 'reconectar'. */
async function refrescarToken(db: SupabaseClient, medicoId: string, row: ConexionRow): Promise<boolean> {
  const clientId = process.env.MP_CLIENT_ID
  const clientSecret = process.env.MP_CLIENT_SECRET
  if (!row.refresh_token_cifrado || !clientId || !clientSecret) {
    await marcarReconectar(db, medicoId)
    return false
  }
  try {
    const res = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: descifrar(row.refresh_token_cifrado),
      }),
    })
    if (!res.ok) throw new Error(`oauth/token ${res.status}`)
    const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number }
    if (!json.access_token) throw new Error('sin access_token')
    await db
      .from('mp_conexiones')
      .update({
        access_token_cifrado: cifrar(json.access_token),
        refresh_token_cifrado: json.refresh_token ? cifrar(json.refresh_token) : row.refresh_token_cifrado,
        expires_at: json.expires_in ? new Date(Date.now() + json.expires_in * 1000).toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('medico_id', medicoId)
    return true
  } catch (e) {
    console.error('[mp] refresh token falló:', e)
    await marcarReconectar(db, medicoId)
    return false
  }
}

/** El cobro de este médico queda pausado hasta que reconecte — nunca falla en silencio. */
export async function marcarReconectar(db: SupabaseClient, medicoId: string): Promise<void> {
  await db
    .from('mp_conexiones')
    .update({ estado: 'reconectar', updated_at: new Date().toISOString() })
    .eq('medico_id', medicoId)
}
```

- [ ] **Step 2: `recetasService.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { RecetaExtraida } from '@/lib/ai/ocr-receta'
import { normalizarDni, nombresCoinciden } from '@/lib/recetas/normalizar'

/** Vigencia de la receta en días: pasado el plazo se marca 'vencida' (lazy, al buscar). */
const RECETA_VIGENCIA_DIAS = 30

export interface RecetaRow {
  id: string
  medico_id: string
  contacto_id: string | null
  paciente_nombre: string
  paciente_dni: string
  paciente_telefono: string | null
  pdf_path: string
  nro_receta: string | null
  monto: number | null
  estado: string
  mp_preference_id: string | null
  mp_payment_id: string | null
  datos_ocr: Record<string, unknown>
  created_at: string
}

const COLS =
  'id, medico_id, contacto_id, paciente_nombre, paciente_dni, paciente_telefono, pdf_path, nro_receta, monto, estado, mp_preference_id, mp_payment_id, datos_ocr, created_at'

export async function crearRecetaDesdeOcr(
  db: SupabaseClient,
  args: { medicoId: string; ocr: RecetaExtraida; pdfPath: string; monto: number; estado: 'pendiente_pago' | 'pendiente_datos' },
): Promise<RecetaRow | 'duplicada' | null> {
  const { data, error } = await db
    .from('recetas')
    .insert({
      medico_id: args.medicoId,
      paciente_nombre: args.ocr.paciente_nombre,
      paciente_dni: normalizarDni(args.ocr.paciente_dni),
      pdf_path: args.pdfPath,
      nro_receta: args.ocr.nro_receta || null,
      monto: args.monto,
      estado: args.estado,
      datos_ocr: args.ocr,
    })
    .select(COLS)
    .single()
  if (error) {
    if (error.code === '23505') return 'duplicada'
    console.error('[recetas] insert error:', error.message)
    return null
  }
  return data as RecetaRow
}

/** Busca recetas cobrables por identidad (DNI exacto + nombre tolerante). Marca vencidas lazy. */
export async function buscarPendientesPorIdentidad(
  db: SupabaseClient,
  medicoId: string,
  nombre: string,
  dni: string,
): Promise<RecetaRow[]> {
  const dniNorm = normalizarDni(dni)
  if (dniNorm.length < 7) return []
  const { data } = await db
    .from('recetas')
    .select(COLS)
    .eq('medico_id', medicoId)
    .eq('estado', 'pendiente_pago')
    .eq('paciente_dni', dniNorm)
    .order('created_at', { ascending: true })
  const rows = (data as RecetaRow[] | null) ?? []

  const limite = Date.now() - RECETA_VIGENCIA_DIAS * 24 * 60 * 60 * 1000
  const vencidas = rows.filter((r) => new Date(r.created_at).getTime() < limite)
  if (vencidas.length) {
    await db
      .from('recetas')
      .update({ estado: 'vencida', updated_at: new Date().toISOString() })
      .eq('medico_id', medicoId)
      .in('id', vencidas.map((r) => r.id))
  }
  return rows
    .filter((r) => new Date(r.created_at).getTime() >= limite)
    .filter((r) => nombresCoinciden(r.paciente_nombre, nombre))
}

export async function listarPagadasSinEntregar(
  db: SupabaseClient,
  medicoId: string,
  telefonoNormalizado: string,
): Promise<RecetaRow[]> {
  const { data } = await db
    .from('recetas')
    .select(COLS)
    .eq('medico_id', medicoId)
    .eq('estado', 'pagada')
    .eq('paciente_telefono', telefonoNormalizado)
  return (data as RecetaRow[] | null) ?? []
}

/** Pendientes de pago que ya tienen link generado para este teléfono (candidatas a reconciliar). */
export async function listarPendientesConPreferencia(
  db: SupabaseClient,
  medicoId: string,
  telefonoNormalizado: string,
): Promise<RecetaRow[]> {
  const { data } = await db
    .from('recetas')
    .select(COLS)
    .eq('medico_id', medicoId)
    .eq('estado', 'pendiente_pago')
    .eq('paciente_telefono', telefonoNormalizado)
    .not('mp_preference_id', 'is', null)
  return (data as RecetaRow[] | null) ?? []
}

export async function getRecetaDelMedico(
  db: SupabaseClient,
  medicoId: string,
  recetaId: string,
): Promise<RecetaRow | null> {
  const { data } = await db.from('recetas').select(COLS).eq('medico_id', medicoId).eq('id', recetaId).maybeSingle()
  return (data as RecetaRow | null) ?? null
}

/** Al generar el link: asocia preferencia + teléfono + contacto del paciente (§6.2: se capturan al escribir). */
export async function vincularPago(
  db: SupabaseClient,
  medicoId: string,
  recetaId: string,
  args: { mpPreferenceId: string; pacienteTelefono: string; contactoId: string | null },
): Promise<void> {
  await db
    .from('recetas')
    .update({
      mp_preference_id: args.mpPreferenceId,
      paciente_telefono: args.pacienteTelefono,
      contacto_id: args.contactoId,
      updated_at: new Date().toISOString(),
    })
    .eq('medico_id', medicoId)
    .eq('id', recetaId)
}

/** Condicional por estado: reduce la ventana de carrera entre webhooks concurrentes. */
export async function marcarPagada(
  db: SupabaseClient,
  medicoId: string,
  recetaId: string,
  paymentId: string,
): Promise<void> {
  await db
    .from('recetas')
    .update({ estado: 'pagada', mp_payment_id: paymentId, updated_at: new Date().toISOString() })
    .eq('medico_id', medicoId)
    .eq('id', recetaId)
    .eq('estado', 'pendiente_pago')
}

export async function marcarEntregada(db: SupabaseClient, medicoId: string, recetaId: string): Promise<void> {
  await db
    .from('recetas')
    .update({ estado: 'entregada', updated_at: new Date().toISOString() })
    .eq('medico_id', medicoId)
    .eq('id', recetaId)
}

/** Resumen para el comando 'recetas' del médico (§6.8 visibilidad mínima). */
export async function resumenRecetas(db: SupabaseClient, medicoId: string): Promise<string> {
  const { data } = await db
    .from('recetas')
    .select('paciente_nombre, estado, monto, created_at')
    .eq('medico_id', medicoId)
    .order('created_at', { ascending: false })
    .limit(50)
  const rows = (data as { paciente_nombre: string; estado: string; monto: number | null; created_at: string }[] | null) ?? []
  if (!rows.length) return 'Todavía no hay recetas cargadas. Reenviame un PDF de receta para empezar.'

  const cuenta: Record<string, number> = {}
  for (const r of rows) cuenta[r.estado] = (cuenta[r.estado] ?? 0) + 1
  const etiqueta: Record<string, string> = {
    pendiente_pago: '⏳ esperando pago',
    pagada: '💰 pagadas (por entregar)',
    entregada: '✅ entregadas',
    pendiente_datos: '⚠️ con datos dudosos',
    vencida: '🗑 vencidas',
  }
  const resumen = Object.entries(cuenta)
    .map(([estado, n]) => `${etiqueta[estado] ?? estado}: ${n}`)
    .join('\n')
  const ultimas = rows
    .slice(0, 5)
    .map((r) => `• ${r.paciente_nombre || '(sin nombre)'} — ${etiqueta[r.estado] ?? r.estado}${r.monto != null ? ` — $${Number(r.monto).toLocaleString('es-AR')}` : ''}`)
    .join('\n')
  return `📋 Tus recetas:\n${resumen}\n\nÚltimas:\n${ultimas}`
}
```

- [ ] **Step 3: `configAgente.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export async function getPrecioReceta(db: SupabaseClient, medicoId: string): Promise<number | null> {
  const { data } = await db
    .from('wa_config_agente')
    .select('precio_receta_default')
    .eq('medico_id', medicoId)
    .maybeSingle()
  const precio = (data as { precio_receta_default: number | null } | null)?.precio_receta_default
  return precio != null ? Number(precio) : null
}

export async function setPrecioReceta(db: SupabaseClient, medicoId: string, monto: number): Promise<void> {
  await db
    .from('wa_config_agente')
    .upsert(
      { medico_id: medicoId, precio_receta_default: monto, updated_at: new Date().toISOString() },
      { onConflict: 'medico_id' },
    )
}
```

- [ ] **Step 4: Agregar a `canales.ts` (debajo de `getCanalByPhoneNumberId`)**

```ts
/** Canal del médico (para enviar mensajes salientes desde el webhook de MP). */
export async function getCanalByMedicoId(db: SupabaseClient, medicoId: string): Promise<CanalResuelto | null> {
  const { data } = await db
    .from('wa_canales')
    .select('medico_id, phone_number_id, access_token_cifrado, numero_personal, estado')
    .eq('medico_id', medicoId)
    .eq('estado', 'conectado')
    .maybeSingle()
  if (!data) return null
  const row = data as {
    medico_id: string
    phone_number_id: string
    access_token_cifrado: string
    numero_personal: string
  }
  return {
    medicoId: row.medico_id,
    phoneNumberId: row.phone_number_id,
    accessToken: descifrar(row.access_token_cifrado),
    numeroPersonal: row.numero_personal,
  }
}
```

- [ ] **Step 5: Verificar** — `npm run typecheck` limpio; `npm test` verdes.
- [ ] **Step 6: Commit** — `git add src/features/whatsapp/services && git commit -m "feat(recetas): servicios de datos Fase 1 (conexión MP, recetas, precio, canal por médico)"`

---

## Task 9: Agente del paciente — tools + runAgentTurn + system prompt

**Files:**
- Create: `src/features/whatsapp/agent/tools.ts`
- Modify: `src/features/whatsapp/agent/runAgentTurn.ts` (reemplazar completo)
- Modify: `src/features/whatsapp/agent/systemPrompt.ts` (reemplazar completo)

- [ ] **Step 1: `tools.ts`**

```ts
import { tool } from 'ai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeRecipient } from '@/lib/whatsapp/client'
import { buildPreferenciaBody, crearPreferencia } from '@/lib/mercadopago/client'
import { getConexionActiva } from '@/features/whatsapp/services/mpConexiones'
import {
  buscarPendientesPorIdentidad,
  getRecetaDelMedico,
  vincularPago,
  type RecetaRow,
} from '@/features/whatsapp/services/recetasService'

export interface PacienteToolsCtx {
  db: SupabaseClient
  medicoId: string
  telefonoPaciente: string
  contactoId: string | null
}

function resumenMedicamento(r: RecetaRow): string {
  const meds = (r.datos_ocr as { medicamentos?: { droga?: string }[] })?.medicamentos
  return meds?.[0]?.droga ?? 'receta médica'
}

/** Tools del agente que atiende pacientes. medico_id INYECTADO (el webhook no tiene sesión). */
export function buildPacienteTools(ctx: PacienteToolsCtx) {
  return {
    buscar_receta_paciente: tool({
      description:
        'Busca recetas pendientes de pago del paciente por su nombre completo y DNI. Usala apenas el paciente dé sus datos.',
      inputSchema: z.object({
        nombre: z.string().describe('Nombre completo que dio el paciente'),
        dni: z.string().describe('DNI que dio el paciente (con o sin puntos)'),
      }),
      execute: async ({ nombre, dni }) => {
        const recetas = await buscarPendientesPorIdentidad(ctx.db, ctx.medicoId, nombre, dni)
        if (!recetas.length) {
          return { encontradas: 0, mensaje: 'No hay recetas pendientes de pago con esos datos. Sugerile verificar con su médico.' }
        }
        return {
          encontradas: recetas.length,
          recetas: recetas.map((r) => ({
            receta_id: r.id,
            medicamento: resumenMedicamento(r),
            monto: Number(r.monto),
          })),
        }
      },
    }),

    cobrar_receta: tool({
      description:
        'Genera el link de pago de MercadoPago para una receta encontrada con buscar_receta_paciente. Devolvé el link al paciente tal cual.',
      inputSchema: z.object({
        receta_id: z.string().describe('El receta_id devuelto por buscar_receta_paciente'),
      }),
      execute: async ({ receta_id }) => {
        const receta = await getRecetaDelMedico(ctx.db, ctx.medicoId, receta_id)
        if (!receta || receta.estado !== 'pendiente_pago' || receta.monto == null) {
          return { error: 'Esa receta no está disponible para cobro.' }
        }
        // Anti-secuestro de entrega (revisión Lote B): el PRIMER teléfono que gestiona
        // la receta queda como destinatario; otro número (aunque sepa nombre+DNI) no
        // puede desviar la entrega — se lo deriva al médico.
        const telefonoNorm = normalizeRecipient(ctx.telefonoPaciente)
        if (receta.paciente_telefono && receta.paciente_telefono !== telefonoNorm) {
          return {
            error:
              'Esa receta ya está siendo gestionada desde otro número de WhatsApp. Si sos el paciente, avisale a tu médico para que lo verifique.',
          }
        }
        const baseUrl = process.env.PUBLIC_BASE_URL
        if (!baseUrl) return { error: 'El sistema de pagos no está configurado todavía (falta PUBLIC_BASE_URL).' }
        const conexion = await getConexionActiva(ctx.db, ctx.medicoId)
        if (!conexion) {
          return { error: 'El médico todavía no tiene MercadoPago conectado. Avisale que debe conectarlo desde MediCuenta.' }
        }
        const body = buildPreferenciaBody(
          {
            recetaId: receta.id,
            titulo: `Receta médica — ${resumenMedicamento(receta)}`,
            monto: Number(receta.monto),
            notificationUrl: `${baseUrl}/api/mercadopago/webhook?receta=${receta.id}`,
            expiraEnDias: 7,
          },
          new Date(),
        )
        const pref = await crearPreferencia(conexion.accessToken, body)
        if (!pref) return { error: 'No pude generar el link de pago. Pedile que intente de nuevo en unos minutos.' }
        await vincularPago(ctx.db, ctx.medicoId, receta.id, {
          mpPreferenceId: pref.id,
          pacienteTelefono: normalizeRecipient(ctx.telefonoPaciente),
          contactoId: ctx.contactoId,
        })
        return { link: pref.initPoint, monto: Number(receta.monto) }
      },
    }),
  }
}
```

- [ ] **Step 2: `runAgentTurn.ts` (reemplazo completo)**

```ts
import { generateText, stepCountIs, type ToolSet } from 'ai'
import { openrouter, getAgentModel } from '@/lib/ai/openrouter'
import type { HistorialMsg } from '@/features/whatsapp/services/conversaciones'

/**
 * Corre un turno del agente del paciente. Las tools llevan el medico_id inyectado
 * (no hay sesión en el webhook). stopWhen limita el loop de tools del SDK.
 */
export async function runAgentTurn(opts: {
  systemPrompt: string
  historial: HistorialMsg[]
  tools?: ToolSet
}): Promise<string> {
  const result = await generateText({
    model: openrouter(getAgentModel()),
    system: opts.systemPrompt,
    messages: opts.historial,
    tools: opts.tools,
    stopWhen: stepCountIs(5),
  })
  return result.text.trim()
}
```

- [ ] **Step 3: `systemPrompt.ts` (reemplazo completo)**

```ts
export interface ConfigAgente {
  saludo?: string | null
  tono?: string | null
  faqs?: { pregunta: string; respuesta: string }[] | null
}

/** System prompt del asistente que atiende a los pacientes por WhatsApp (Fase 1: cobro de recetas). */
export function buildSystemPromptPaciente(opts: { config: ConfigAgente | null; contactName?: string }): string {
  const tono = opts.config?.tono?.trim() || 'cordial, claro y breve'
  const saludo = opts.config?.saludo?.trim() || 'Hola, soy el asistente del consultorio.'
  const faqs = (opts.config?.faqs ?? []).map((f) => `- P: ${f.pregunta}\n  R: ${f.respuesta}`).join('\n')

  return [
    `Sos el asistente virtual de un consultorio médico en Catamarca, Argentina, que atiende a los pacientes por WhatsApp.`,
    `Hablás en español rioplatense, con un tono ${tono}. Sé breve (es WhatsApp).`,
    `Saludo sugerido: "${saludo}".`,
    opts.contactName ? `El paciente se llama ${opts.contactName} (tuteá con respeto).` : '',
    ``,
    `TU FUNCIÓN PRINCIPAL — COBRO Y ENTREGA DE RECETAS:`,
    `- Si el paciente busca su receta (o el médico le dijo que te escriba): pedile su NOMBRE COMPLETO y DNI.`,
    `- Con nombre y DNI llamá a la tool buscar_receta_paciente.`,
    `- Si hay UNA receta: llamá a cobrar_receta y respondé con el monto y el link TAL CUAL te lo devuelve: "Tu receta de <medicamento> cuesta $<monto>. Pagá acá: <link> — apenas se acredite el pago te la mando por acá 📄".`,
    `- Si hay VARIAS: listalas (medicamento y monto) y cobrá la más antigua primero, o la que el paciente elija (una cobrar_receta por vez).`,
    `- Si no aparece ninguna: decile que verifique sus datos o consulte a su médico. NO insistas con datos inventados.`,
    `- Si dice que YA PAGÓ y no recibió el PDF: explicale que la entrega es automática al confirmarse el pago; que espere 1-2 minutos y escriba "ya pagué" de nuevo (el sistema verifica y entrega solo).`,
    `- NUNCA inventes links, montos ni recetas: usá SOLO lo que devuelven las tools. Si una tool devuelve { error }, explicáselo amablemente.`,
    ``,
    `LÍMITES:`,
    `- NO das diagnósticos ni indicaciones médicas. Si preguntan algo clínico, derivá al médico.`,
    `- Los turnos todavía no están disponibles (llegan pronto).`,
    faqs ? `\nPreguntas frecuentes que SÍ podés responder:\n${faqs}` : '',
  ]
    .filter((l) => l !== '')
    .join('\n')
}
```

- [ ] **Step 4: Verificar** — `npm run typecheck` limpio (el runner de Fase 0 sigue compilando: `tools` es opcional y ya no pasa `deps`... **ojo**: el runner actual pasa `deps: { medicoId }` — quitarlo recién en Task 10; para que compile AHORA, `runAgentTurn` ya no acepta `deps`, así que en este paso editá también la línea del runner: cambiar `runAgentTurn({ systemPrompt, historial, deps: { medicoId: canal.medicoId } })` por `runAgentTurn({ systemPrompt, historial })`). `npm test` verdes.
- [ ] **Step 5: Commit** — `git add src/features/whatsapp/agent src/features/whatsapp/runner.ts && git commit -m "feat(agente): tools de cobro de recetas + system prompt Fase 1"`

---

## Task 10: Entrega + Runner Fase 1 completo

**Files:**
- Create: `src/features/whatsapp/services/entrega.ts`
- Rewrite: `src/features/whatsapp/runner.ts` (contenido completo abajo)

- [ ] **Step 1: `entrega.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { uploadWhatsAppMedia, sendWhatsAppDocument } from '@/lib/whatsapp/client'
import { buildExternalReference, buscarPagoAprobadoPorReferencia } from '@/lib/mercadopago/client'
import { decidirAccionPago } from '@/lib/mercadopago/validarPago'
import type { CanalResuelto } from './canales'
import { descargarPdfReceta } from './storageRecetas'
import { getConexionActiva } from './mpConexiones'
import {
  listarPagadasSinEntregar,
  listarPendientesConPreferencia,
  marcarPagada,
  marcarEntregada,
  type RecetaRow,
} from './recetasService'

/** Entrega el PDF de una receta pagada por WhatsApp (document). true si se entregó. */
export async function entregarReceta(db: SupabaseClient, canal: CanalResuelto, receta: RecetaRow): Promise<boolean> {
  if (!receta.paciente_telefono) return false
  const pdf = await descargarPdfReceta(db, receta.pdf_path)
  if (!pdf) return false
  const filename = `receta-${receta.nro_receta || receta.id.slice(0, 8)}.pdf`
  const mediaId = await uploadWhatsAppMedia({
    phoneNumberId: canal.phoneNumberId,
    accessToken: canal.accessToken,
    buffer: pdf,
    mimeType: 'application/pdf',
    filename,
  })
  if (!mediaId) return false
  const ok = await sendWhatsAppDocument({
    phoneNumberId: canal.phoneNumberId,
    accessToken: canal.accessToken,
    to: receta.paciente_telefono,
    mediaId,
    filename,
    caption: '✅ Pago confirmado. Acá está tu receta.',
  })
  if (!ok) return false // p.ej. ventana de 24h cerrada → queda 'pagada', se reintenta al próximo mensaje
  await marcarEntregada(db, receta.medico_id, receta.id)
  return true
}

/**
 * Al escribir el paciente: entrega lo pagado sin entregar Y reconcilia contra MP
 * (por si el webhook se perdió o la ventana estaba cerrada). Devuelve cuántas entregó.
 */
export async function entregarPendientes(
  db: SupabaseClient,
  canal: CanalResuelto,
  medicoId: string,
  telefonoNormalizado: string,
): Promise<number> {
  let entregadas = 0

  for (const receta of await listarPagadasSinEntregar(db, medicoId, telefonoNormalizado)) {
    if (await entregarReceta(db, canal, receta)) entregadas++
  }

  const pendientes = await listarPendientesConPreferencia(db, medicoId, telefonoNormalizado)
  if (pendientes.length) {
    const conexion = await getConexionActiva(db, medicoId)
    if (conexion) {
      for (const receta of pendientes) {
        const pago = await buscarPagoAprobadoPorReferencia(conexion.accessToken, buildExternalReference(receta.id))
        if (!pago) continue
        const d = decidirAccionPago({
          pago,
          receta: { id: receta.id, monto: receta.monto, estado: receta.estado },
          mpUserId: conexion.mpUserId,
        })
        if (d.accion !== 'marcar_pagada_y_entregar') continue
        await marcarPagada(db, medicoId, receta.id, pago.id)
        if (await entregarReceta(db, canal, receta)) entregadas++
      }
    }
  }
  return entregadas
}
```

- [ ] **Step 2: `runner.ts` (REEMPLAZO COMPLETO del archivo)**

```ts
import { createServiceClient } from '@/lib/supabase/server'
import { parseIncomingMessage, type IncomingMessage } from '@/lib/whatsapp/parse'
import { sendWhatsAppText, markAsRead, fetchWhatsAppMedia, normalizeRecipient } from '@/lib/whatsapp/client'
import { esRemitenteMedico } from '@/lib/whatsapp/clasificar'
import { getCanalByPhoneNumberId, type CanalResuelto } from '@/features/whatsapp/services/canales'
import {
  ensureContacto,
  ensureConversacion,
  isBotPausado,
  addMensaje,
  loadHistorial,
} from '@/features/whatsapp/services/conversaciones'
import { getPrecioReceta, setPrecioReceta } from '@/features/whatsapp/services/configAgente'
import { crearRecetaDesdeOcr, resumenRecetas } from '@/features/whatsapp/services/recetasService'
import { entregarPendientes } from '@/features/whatsapp/services/entrega'
import { subirPdfReceta } from '@/features/whatsapp/services/storageRecetas'
import { extraerRecetaDePdf, validarIdentidadExtraida } from '@/lib/ai/ocr-receta'
import { normalizarDni, parseMontoArs } from '@/lib/recetas/normalizar'
import { buildSystemPromptPaciente, type ConfigAgente } from '@/features/whatsapp/agent/systemPrompt'
import { runAgentTurn } from '@/features/whatsapp/agent/runAgentTurn'
import { buildPacienteTools } from '@/features/whatsapp/agent/tools'

type Db = ReturnType<typeof createServiceClient>

const AYUDA_MEDICO = [
  '🩺 Soy su asistente. Comandos:',
  '• Reenvíeme el PDF de una receta para cargarla al cobro',
  "• 'precio 5000' — fija cuánto cobra cada receta",
  "• 'recetas' — estado de sus recetas",
].join('\n')

/**
 * Procesa un webhook entrante de WhatsApp re-keyeado a medico_id.
 * Best-effort: no lanza (el webhook siempre responde 200).
 */
export async function handleIncomingWhatsApp(payload: unknown): Promise<void> {
  const incoming = parseIncomingMessage(payload)
  if (!incoming) return
  if (incoming.type !== 'text' && incoming.type !== 'document') return

  const db = createServiceClient()
  const canal = await getCanalByPhoneNumberId(db, incoming.phoneNumberId)
  if (!canal) {
    console.warn('[wa] sin canal para phone_number_id', incoming.phoneNumberId)
    return
  }

  markAsRead({
    phoneNumberId: canal.phoneNumberId,
    accessToken: canal.accessToken,
    to: incoming.from,
    messageId: incoming.messageId,
  })

  if (esRemitenteMedico(incoming.from, canal.numeroPersonal)) {
    await handleMedico(db, canal, incoming)
    return
  }
  await handlePaciente(db, canal, incoming)
}

async function responder(canal: CanalResuelto, to: string, text: string): Promise<void> {
  await sendWhatsAppText({ phoneNumberId: canal.phoneNumberId, accessToken: canal.accessToken, to, text })
}

// ── Rama MÉDICO: carga de recetas (PDF) + comandos de texto ──────────────────
async function handleMedico(db: Db, canal: CanalResuelto, incoming: IncomingMessage): Promise<void> {
  if (incoming.type === 'document') {
    await cargarRecetaDesdePdf(db, canal, incoming)
    return
  }

  const texto = (incoming.text ?? '').trim()
  const matchPrecio = /^precio\s+\$?\s*([\d.,]+)\s*$/i.exec(texto)
  if (matchPrecio) {
    const monto = parseMontoArs(matchPrecio[1])
    if (!monto) {
      await responder(canal, incoming.from, "No entendí el monto. Probá: precio 5000")
      return
    }
    await setPrecioReceta(db, canal.medicoId, monto)
    await responder(
      canal,
      incoming.from,
      `✅ Listo: cada receta se cobra $${monto.toLocaleString('es-AR')}. Ya puede reenviarme los PDFs.`,
    )
    return
  }
  if (/^(recetas|estado)$/i.test(texto)) {
    await responder(canal, incoming.from, await resumenRecetas(db, canal.medicoId))
    return
  }
  await responder(canal, incoming.from, AYUDA_MEDICO)
}

async function cargarRecetaDesdePdf(db: Db, canal: CanalResuelto, incoming: IncomingMessage): Promise<void> {
  const precio = await getPrecioReceta(db, canal.medicoId)
  if (!precio) {
    await responder(canal, incoming.from, "⚠️ Antes de cargar recetas configurá el precio. Mandá por ejemplo: precio 5000")
    return
  }
  if (!incoming.mediaId) return

  const media = await fetchWhatsAppMedia(incoming.mediaId, canal.accessToken)
  if (!media || !media.mimeType.includes('pdf')) {
    await responder(canal, incoming.from, '⚠️ Solo puedo leer recetas en PDF (el archivo que baja de la app de OSEP).')
    return
  }

  const pdfPath = await subirPdfReceta(db, canal.medicoId, media.buffer)
  if (!pdfPath) {
    await responder(canal, incoming.from, '✖ No pude guardar el PDF. Probá reenviarlo.')
    return
  }

  let ocr
  try {
    ocr = await extraerRecetaDePdf(media.buffer)
  } catch (e) {
    console.error('[wa] OCR receta error:', e)
    await responder(canal, incoming.from, '✖ No pude leer ese PDF. Reenviá el original que baja de la app de OSEP.')
    return
  }

  const identidadOk = validarIdentidadExtraida(ocr)
  const resultado = await crearRecetaDesdeOcr(db, {
    medicoId: canal.medicoId,
    ocr,
    pdfPath,
    monto: precio,
    estado: identidadOk ? 'pendiente_pago' : 'pendiente_datos',
  })

  if (resultado === 'duplicada') {
    await responder(canal, incoming.from, `⚠️ Esa receta ya estaba cargada (N° ${ocr.nro_receta}).`)
    return
  }
  if (!resultado) {
    await responder(canal, incoming.from, '✖ No pude registrar la receta. Probá de nuevo.')
    return
  }

  const droga = ocr.medicamentos[0]?.droga
  if (identidadOk) {
    await responder(
      canal,
      incoming.from,
      `✅ Receta cargada: ${ocr.paciente_nombre} (DNI ${normalizarDni(ocr.paciente_dni)})${droga ? ` — ${droga}` : ''}. La cobro $${precio.toLocaleString('es-AR')} cuando el paciente me escriba.`,
    )
  } else {
    await responder(
      canal,
      incoming.from,
      '⚠️ Guardé el PDF pero no pude leer bien el nombre o el DNI del paciente, así que NO la voy a cobrar. Reenviá el PDF original (no captura de pantalla).',
    )
  }
}

// ── Rama PACIENTE: entrega pendiente + agente con tools de cobro ─────────────
async function handlePaciente(db: Db, canal: CanalResuelto, incoming: IncomingMessage): Promise<void> {
  if (incoming.type === 'document') {
    await responder(canal, incoming.from, 'Las recetas las carga tu médico 😊 Si ya pagaste la tuya, escribime "ya pagué".')
    return
  }

  const contactoId = await ensureContacto(db, canal.medicoId, incoming.from, incoming.contactName)
  const conversacionId = await ensureConversacion(db, canal.medicoId, contactoId)

  await addMensaje(db, {
    medicoId: canal.medicoId,
    conversacionId,
    direccion: 'entrante',
    origen: 'paciente',
    contenido: incoming.text ?? '',
    wamid: incoming.messageId,
  })

  // 1) Entregas pendientes (pagada sin entregar + reconciliación contra MP).
  const entregadas = await entregarPendientes(db, canal, canal.medicoId, normalizeRecipient(incoming.from))
  if (entregadas > 0) {
    const msg = '📄 ¡Listo! Te envié tu receta. ¡Que te mejores! 🙌'
    await responder(canal, incoming.from, msg)
    await addMensaje(db, {
      medicoId: canal.medicoId,
      conversacionId,
      direccion: 'saliente',
      origen: 'ia',
      contenido: `[Receta entregada] ${msg}`,
    })
    return
  }

  // 2) Toma humana.
  if (await isBotPausado(db, canal.medicoId, conversacionId)) return

  // 3) Agente con tools de cobro.
  const { data: cfgRow } = await db
    .from('wa_config_agente')
    .select('saludo, tono, faqs')
    .eq('medico_id', canal.medicoId)
    .maybeSingle()

  const systemPrompt = buildSystemPromptPaciente({
    config: cfgRow as ConfigAgente | null,
    contactName: incoming.contactName,
  })
  const historial = await loadHistorial(db, canal.medicoId, conversacionId, 12)
  const tools = buildPacienteTools({
    db,
    medicoId: canal.medicoId,
    telefonoPaciente: incoming.from,
    contactoId,
  })

  let reply: string
  try {
    reply = await runAgentTurn({ systemPrompt, historial, tools })
  } catch (e) {
    console.error('[wa] agent error:', e)
    return
  }
  if (!reply) return

  await responder(canal, incoming.from, reply)
  await addMensaje(db, {
    medicoId: canal.medicoId,
    conversacionId,
    direccion: 'saliente',
    origen: 'ia',
    contenido: reply,
  })
}
```

- [ ] **Step 3: Verificar** — `npm run typecheck` limpio; `npm test` verdes; `npm run build` OK.
- [ ] **Step 4: Commit** — `git add src/features/whatsapp && git commit -m "feat(whatsapp): runner Fase 1 (carga de recetas del médico + cobro y entrega al paciente)"`

---

## Task 11: Webhook MercadoPago (TDD del orquestador)

**Files:**
- Create: `src/lib/mercadopago/procesarPago.ts`
- Test: `src/lib/mercadopago/procesarPago.test.ts`
- Create: `src/app/api/mercadopago/webhook/route.ts`

- [ ] **Step 1: Test del orquestador que falla (deps inyectadas, fakes)**

```ts
import { describe, it, expect, vi } from 'vitest'
import { procesarPagoNotificado, type ProcesarPagoDeps } from './procesarPago'
import type { PagoMP } from './client'

const RECETA_ID = '123e4567-e89b-42d3-a456-426614174000'
const MEDICO_ID = '924014ac-0000-4000-8000-000000000000'

function pagoAprobado(): PagoMP {
  return {
    id: '555',
    status: 'approved',
    externalReference: `receta:${RECETA_ID}`,
    transactionAmount: 5000,
    currencyId: 'ARS',
    collectorId: '111',
  }
}

function fakes(over: Partial<ProcesarPagoDeps> = {}): ProcesarPagoDeps {
  return {
    getReceta: vi.fn(async () => ({ id: RECETA_ID, medico_id: MEDICO_ID, monto: 5000, estado: 'pendiente_pago' })),
    getConexion: vi.fn(async () => ({ mpUserId: '111', accessToken: 'tok' })),
    consultarPago: vi.fn(async () => pagoAprobado()),
    marcarPagada: vi.fn(async () => {}),
    entregar: vi.fn(async () => true),
    avisarMedico: vi.fn(async () => {}),
    ...over,
  }
}

describe('procesarPagoNotificado', () => {
  it('aprobado → marca pagada y entrega', async () => {
    const deps = fakes()
    const out = await procesarPagoNotificado(deps, { recetaId: RECETA_ID, paymentId: '555' })
    expect(out).toBe('entregada')
    expect(deps.marcarPagada).toHaveBeenCalledWith(MEDICO_ID, RECETA_ID, '555')
    expect(deps.entregar).toHaveBeenCalled()
  })
  it('entrega falla (ventana 24h) → queda pagada sin entregar', async () => {
    const out = await procesarPagoNotificado(fakes({ entregar: vi.fn(async () => false) }), { recetaId: RECETA_ID, paymentId: '555' })
    expect(out).toBe('pagada_sin_entregar')
  })
  it('receta inexistente → corta', async () => {
    const out = await procesarPagoNotificado(fakes({ getReceta: vi.fn(async () => null) }), { recetaId: RECETA_ID, paymentId: '555' })
    expect(out).toBe('receta_inexistente')
  })
  it('receta ya entregada → idempotente, no vuelve a entregar', async () => {
    const deps = fakes({ getReceta: vi.fn(async () => ({ id: RECETA_ID, medico_id: MEDICO_ID, monto: 5000, estado: 'entregada' })) })
    const out = await procesarPagoNotificado(deps, { recetaId: RECETA_ID, paymentId: '555' })
    expect(out).toBe('ya_entregada')
    expect(deps.entregar).not.toHaveBeenCalled()
  })
  it('sin conexión MP → corta', async () => {
    const out = await procesarPagoNotificado(fakes({ getConexion: vi.fn(async () => null) }), { recetaId: RECETA_ID, paymentId: '555' })
    expect(out).toBe('sin_conexion_mp')
  })
  it('pago no encontrado en MP → corta (no confía en el body)', async () => {
    const out = await procesarPagoNotificado(fakes({ consultarPago: vi.fn(async () => null) }), { recetaId: RECETA_ID, paymentId: '555' })
    expect(out).toBe('pago_no_encontrado')
  })
  it('pago de otro cobrador → ignorado, sin marcar ni entregar', async () => {
    const deps = fakes({ getConexion: vi.fn(async () => ({ mpUserId: '999', accessToken: 'tok' })) })
    const out = await procesarPagoNotificado(deps, { recetaId: RECETA_ID, paymentId: '555' })
    expect(out).toContain('ignorado')
    expect(deps.marcarPagada).not.toHaveBeenCalled()
    expect(deps.entregar).not.toHaveBeenCalled()
  })
  it('refunded → avisa al médico', async () => {
    const deps = fakes({ consultarPago: vi.fn(async () => ({ ...pagoAprobado(), status: 'refunded' })) })
    const out = await procesarPagoNotificado(deps, { recetaId: RECETA_ID, paymentId: '555' })
    expect(out).toBe('devolucion')
    expect(deps.avisarMedico).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Correr y ver fallar.**

- [ ] **Step 3: Implementar `procesarPago.ts`**

```ts
import type { PagoMP } from './client'
import { decidirAccionPago } from './validarPago'

export interface RecetaNotificada {
  id: string
  medico_id: string
  monto: number | null
  estado: string
}

export interface ProcesarPagoDeps {
  getReceta(recetaId: string): Promise<RecetaNotificada | null>
  getConexion(medicoId: string): Promise<{ mpUserId: string; accessToken: string } | null>
  consultarPago(accessToken: string, paymentId: string): Promise<PagoMP | null>
  marcarPagada(medicoId: string, recetaId: string, paymentId: string): Promise<void>
  entregar(recetaId: string): Promise<boolean>
  avisarMedico(medicoId: string, texto: string): Promise<void>
}

/**
 * Orquestador del webhook de MP. No confía en el body: re-consulta el pago con el
 * token del médico y delega la decisión en decidirAccionPago (validación cross-tenant).
 */
export async function procesarPagoNotificado(
  deps: ProcesarPagoDeps,
  args: { recetaId: string; paymentId: string },
): Promise<string> {
  const receta = await deps.getReceta(args.recetaId)
  if (!receta) return 'receta_inexistente'
  if (receta.estado === 'entregada') return 'ya_entregada'

  const conexion = await deps.getConexion(receta.medico_id)
  if (!conexion) return 'sin_conexion_mp'

  const pago = await deps.consultarPago(conexion.accessToken, args.paymentId)
  if (!pago) return 'pago_no_encontrado'

  const decision = decidirAccionPago({
    pago,
    receta: { id: receta.id, monto: receta.monto, estado: receta.estado },
    mpUserId: conexion.mpUserId,
  })

  if (decision.accion === 'ignorar') return `ignorado: ${decision.motivo}`
  if (decision.accion === 'avisar_devolucion') {
    await deps.avisarMedico(
      receta.medico_id,
      `⚠️ MercadoPago reportó una devolución/contracargo de un pago de receta (${decision.motivo}). Revisalo en tu cuenta de MP.`,
    )
    return 'devolucion'
  }

  await deps.marcarPagada(receta.medico_id, receta.id, pago.id)
  const entregada = await deps.entregar(receta.id)
  return entregada ? 'entregada' : 'pagada_sin_entregar'
}
```

- [ ] **Step 4: Verde** — `npm test -- src/lib/mercadopago/procesarPago.test.ts` → PASS (8 tests).

- [ ] **Step 5: Route handler `src/app/api/mercadopago/webhook/route.ts`**

```ts
import { createServiceClient } from '@/lib/supabase/server'
import { consultarPago } from '@/lib/mercadopago/client'
import { procesarPagoNotificado, type ProcesarPagoDeps } from '@/lib/mercadopago/procesarPago'
import { getConexionActiva } from '@/features/whatsapp/services/mpConexiones'
import { getCanalByMedicoId } from '@/features/whatsapp/services/canales'
import { getRecetaDelMedico, marcarPagada } from '@/features/whatsapp/services/recetasService'
import { entregarReceta } from '@/features/whatsapp/services/entrega'
import { sendWhatsAppText } from '@/lib/whatsapp/client'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: Request) {
  const url = new URL(req.url)

  let body: { type?: string; topic?: string; data?: { id?: number | string } } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    // MP también notifica con query params (IPN legacy); seguimos con la URL.
  }

  const tipo = String(body.type ?? body.topic ?? url.searchParams.get('type') ?? url.searchParams.get('topic') ?? '')
  const paymentId = String(body.data?.id ?? url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? '')
  const recetaId = url.searchParams.get('receta') ?? ''

  // Solo procesamos notificaciones de pago con una receta nuestra identificable.
  if (tipo !== 'payment' || !paymentId || !UUID_RE.test(recetaId)) {
    return new Response('OK', { status: 200 })
  }

  try {
    const db = createServiceClient()

    // La receta se busca SIN asumir el médico: primero la fila (por id), y todo lo
    // demás se valida contra MP con el token del médico dueño (decidirAccionPago).
    const { data: recetaRow } = await db
      .from('recetas')
      .select('id, medico_id, monto, estado')
      .eq('id', recetaId)
      .maybeSingle()

    const deps: ProcesarPagoDeps = {
      getReceta: async () =>
        (recetaRow as { id: string; medico_id: string; monto: number | null; estado: string } | null) ?? null,
      getConexion: (medicoId) => getConexionActiva(db, medicoId),
      consultarPago: (token, id) => consultarPago(token, id),
      marcarPagada: (medicoId, id, paymentId2) => marcarPagada(db, medicoId, id, paymentId2),
      entregar: async (id) => {
        const medicoId = (recetaRow as { medico_id: string } | null)?.medico_id
        if (!medicoId) return false
        const receta = await getRecetaDelMedico(db, medicoId, id)
        const canal = await getCanalByMedicoId(db, medicoId)
        if (!receta || !canal) return false
        return entregarReceta(db, canal, receta)
      },
      avisarMedico: async (medicoId, texto) => {
        const canal = await getCanalByMedicoId(db, medicoId)
        if (!canal) return
        await sendWhatsAppText({
          phoneNumberId: canal.phoneNumberId,
          accessToken: canal.accessToken,
          to: canal.numeroPersonal,
          text: texto,
        })
      },
    }

    const out = await procesarPagoNotificado(deps, { recetaId, paymentId })
    console.log(`[mp] webhook receta=${recetaId} payment=${paymentId} → ${out}`)
  } catch (e) {
    console.error('[mp] webhook error:', e)
  }
  return new Response('OK', { status: 200 })
}
```

- [ ] **Step 6: Verificar** — `npm run typecheck` + `npm test` + `npm run build` (la ruta `/api/mercadopago/webhook` aparece como ƒ).
- [ ] **Step 7: Commit** — `git add src/lib/mercadopago src/app/api/mercadopago && git commit -m "feat(mp): webhook de pagos con orquestador testeado (TDD) y entrega del PDF"`

---

## Task 12: Seed de conexión MP (sandbox) + E2E en vivo

**Files:**
- Create: `scripts/seed-mp-conexion.mjs`
- Manual: `.env.local` (+`PUBLIC_BASE_URL`), migración aplicada, token TEST del dueño.

- [ ] **Step 1: Crear el seed**

```js
// Siembra/actualiza mp_conexiones con un Access Token de MercadoPago (modo prueba o real).
// Uso: node scripts/seed-mp-conexion.mjs <medico_uuid> <ACCESS_TOKEN>
// Requiere: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ENCRYPTION_KEY.
import { createClient } from '@supabase/supabase-js'
import { randomBytes, createCipheriv } from 'node:crypto'

function cifrar(plaintext) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'base64')
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY debe ser 32 bytes en base64')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.')
}

const [, , medicoId, accessToken] = process.argv
if (!medicoId || !accessToken) {
  console.error('Uso: node scripts/seed-mp-conexion.mjs <medico_uuid> <ACCESS_TOKEN>')
  process.exit(1)
}

// Validar el token y obtener el mp_user_id (collector) — clave para la validación cross-tenant.
const me = await fetch('https://api.mercadopago.com/users/me', {
  headers: { Authorization: `Bearer ${accessToken}` },
}).then((r) => r.json())
if (!me?.id) {
  console.error('El Access Token no es válido para MercadoPago:', me)
  process.exit(1)
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { error } = await db.from('mp_conexiones').upsert(
  {
    medico_id: medicoId,
    mp_user_id: String(me.id),
    access_token_cifrado: cifrar(accessToken),
    refresh_token_cifrado: null,
    expires_at: null, // los tokens de prueba no expiran; OAuth real setea esto
    estado: 'conectado',
  },
  { onConflict: 'medico_id' },
)
if (error) {
  console.error('Error al sembrar mp_conexiones:', error)
  process.exit(1)
}
console.log('✓ mp_conexiones sembrada para médico', medicoId, '| mp_user_id', me.id, '| nickname', me.nickname ?? '')
```

- [ ] **Step 2: Preparación en vivo (con el dueño)**
1. Migración Task 1 aplicada (SQL Editor) y verificada.
2. Access Token de PRUEBA de la app MP del dueño → `node scripts/seed-mp-conexion.mjs 924014ac-fb0a-4d9c-9028-49535e5e2e60 <TOKEN>` (cargando `.env.local` en el entorno).
3. `PUBLIC_BASE_URL=https://<tunel-actual>.trycloudflare.com` en `.env.local` → reiniciar `npm run dev`.

- [ ] **Step 3: E2E checklist (sandbox)**
1. **Médico** (3010): `precio 5000` → "✅ Listo…". Luego reenviar el PDF de receta → "✅ Receta cargada: … (DNI …)".
2. Reenviar el MISMO PDF → "⚠️ ya estaba cargada".
3. `recetas` → resumen con 1 pendiente.
4. **Paciente** (otro número): "Hola, vengo a pagar mi receta" → el bot pide nombre y DNI → darlos → llega el **link de MP** con el monto.
5. Abrir el link y pagar con **tarjeta de prueba** de MP (titular `APRO`, Mastercard `5031 7557 3453 0604`, venc. `11/30`, CVV `123`, DNI `12345678`).
6. El webhook marca `pagada` y **llega el PDF** por WhatsApp como documento.
7. `recetas` (médico) → 1 entregada. En la DB: `recetas.estado='entregada'`, `mp_payment_id` seteado.
8. **Reconciliación:** simular webhook perdido (apagar túnel durante el pago de otra receta) → al escribir el paciente "ya pagué" → el bot reconsulta MP y entrega igual.

- [ ] **Step 4: Commit** — `git add scripts/seed-mp-conexion.mjs && git commit -m "chore(mp): seed de conexión MercadoPago (sandbox) + E2E Fase 1"`

---

## Task 13: OAuth "Conectar MercadoPago" (diferible — para el médico amigo)

**Files:**
- Create: `src/app/api/mercadopago/oauth/route.ts`
- Create: `src/app/api/mercadopago/oauth/callback/route.ts`
- Manual: `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_REDIRECT_URI` en `.env.local`/Vercel; la Redirect URI cargada en la app de MP.

> El flujo de cobro NO depende de esto (el seed de Task 12 cubre las pruebas). Ejecutar cuando un médico real deba conectar su propia cuenta sin compartir tokens.

- [ ] **Step 1: `oauth/route.ts` (inicia el flujo; requiere sesión del médico)**

```ts
import { randomBytes } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('No autenticado', { status: 401 })

  const clientId = process.env.MP_CLIENT_ID
  const redirectUri = process.env.MP_REDIRECT_URI
  if (!clientId || !redirectUri) return new Response('OAuth MP no configurado', { status: 500 })

  const state = randomBytes(16).toString('hex')
  const url = new URL('https://auth.mercadopago.com.ar/authorization')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('platform_id', 'mp')
  url.searchParams.set('state', state)
  url.searchParams.set('redirect_uri', redirectUri)

  return new Response(null, {
    status: 302,
    headers: {
      Location: url.toString(),
      'Set-Cookie': `mp_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  })
}
```

- [ ] **Step 2: `oauth/callback/route.ts` (canjea el code y guarda cifrado)**

```ts
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { cifrar } from '@/lib/crypto/encryption'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('No autenticado', { status: 401 })

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const cookieState = /(?:^|;\s*)mp_oauth_state=([^;]+)/.exec(req.headers.get('cookie') ?? '')?.[1]
  if (!code || !state || !cookieState || state !== cookieState) {
    return new Response('Estado OAuth inválido', { status: 400 })
  }

  const res = await fetch('https://api.mercadopago.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.MP_CLIENT_ID,
      client_secret: process.env.MP_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.MP_REDIRECT_URI,
    }),
  })
  if (!res.ok) {
    console.error('[mp] oauth token error:', await res.text())
    return new Response('No se pudo conectar MercadoPago', { status: 502 })
  }
  const json = (await res.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    user_id?: number | string
  }
  if (!json.access_token || !json.user_id) return new Response('Respuesta OAuth incompleta', { status: 502 })

  const db = createServiceClient()
  const { error } = await db.from('mp_conexiones').upsert(
    {
      medico_id: user.id,
      mp_user_id: String(json.user_id),
      access_token_cifrado: cifrar(json.access_token),
      refresh_token_cifrado: json.refresh_token ? cifrar(json.refresh_token) : null,
      expires_at: json.expires_in ? new Date(Date.now() + json.expires_in * 1000).toISOString() : null,
      estado: 'conectado',
    },
    { onConflict: 'medico_id' },
  )
  if (error) {
    console.error('[mp] guardar conexión error:', error)
    return new Response('No se pudo guardar la conexión', { status: 500 })
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/?mp=conectado',
      'Set-Cookie': 'mp_oauth_state=; Path=/; HttpOnly; Max-Age=0',
    },
  })
}
```

- [ ] **Step 3: Verificar** — typecheck + build; flujo manual con la app MP configurada (Redirect URI = `MP_REDIRECT_URI`).
- [ ] **Step 4: Commit** — `git add src/app/api/mercadopago/oauth && git commit -m "feat(mp): OAuth Conectar MercadoPago por médico (token cifrado + refresh)"`

---

## Variables de entorno nuevas (Fase 1)

| Variable | Para qué | Cuándo |
|---|---|---|
| `PUBLIC_BASE_URL` | URL pública (túnel/prod) para `notification_url` de MP. | Task 12 |
| `MP_CLIENT_ID` / `MP_CLIENT_SECRET` | App de MP (OAuth + refresh). | Task 13 |
| `MP_REDIRECT_URI` | Callback del OAuth. | Task 13 |

## Definition of Done (Fase 1)

- [ ] `npm test` verde (≈40 tests: Fase 0 + normalización, OCR puro, builders MP, decisión de pago, orquestador).
- [ ] `npm run typecheck` y `npm run build` limpios.
- [ ] E2E sandbox completo (Task 12 checklist): cargar receta por PDF → paciente se identifica → paga con tarjeta de prueba → PDF entregado → estados correctos en DB.
- [ ] Dedupe de receta (mismo PDF dos veces) y comando `recetas` funcionando.
- [ ] Reconciliación: pago con webhook perdido se entrega al próximo mensaje del paciente.
- [ ] Ningún token en claro en DB ni en logs.

## Riesgos / notas para el ejecutor

- **Plata = lógica pura testeada.** No mover decisiones de dinero fuera de `decidirAccionPago`/`procesarPagoNotificado`.
- **El webhook MP no verifica firma de origen**: la seguridad real es re-consultar la API de MP con el token del médico + validar referencia/cobrador/monto. No "optimizar" salteándose la re-consulta.
- `PUBLIC_BASE_URL` cambia con cada reinicio del túnel → regenerar y reiniciar dev server antes de probar pagos.
- El número de prueba de Meta solo escribe a destinatarios cargados en su lista (ya están el médico y el paciente de prueba).
- `expiration_date_to` usa el reloj del server; no testear con fechas mockeadas en runtime (solo en builders puros).

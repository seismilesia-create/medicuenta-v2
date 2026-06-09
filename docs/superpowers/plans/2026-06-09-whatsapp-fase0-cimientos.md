# WhatsApp Fase 0 — Cimientos · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un mensaje de WhatsApp entrante llegue a MediCuenta, se resuelva el médico dueño del número, se distinga si el remitente es el médico o un paciente, y el agente IA responda — todo re-keyeado a `medico_id`, con webhook seguro (firma + idempotencia) y tokens cifrados.

**Architecture:** Se copia el *plumbing* de WhatsApp del motor `Agente_Whatsapp` (cliente Meta Cloud API + orquestación del runner) hacia MediCuenta, re-keyeado de `organization_id` → `medico_id` siguiendo el patrón RLS `auth.uid() = medico_id`. El webhook corre con **service-role** (sin sesión) y filtra `medico_id` manualmente, resuelto desde `phone_number_id` vía la tabla nueva `wa_canales`. El agente se **reescribe** sobre el AI SDK v6 (`ai ^6`) que MediCuenta ya usa (no se porta el loop `fetch` del motor). Las funciones puras de seguridad (cifrado AES-256-GCM, verificación de firma HMAC, normalización de teléfono, clasificación de remitente) se desarrollan con TDD (vitest).

**Tech Stack:** Next.js 16 (App Router, route handlers Node runtime) · TypeScript · Supabase (`@supabase/supabase-js` service-role) · `ai ^6` + `@openrouter/ai-sdk-provider` (Claude Haiku 4.5) · Zod · `node:crypto` · vitest (nuevo, para unit tests).

**Spec de referencia:** `docs/superpowers/specs/2026-06-09-whatsapp-recetas-turnos-design.md` (§5 Fase 0, §9 molde de migración, §10 env).

---

## Notas de alcance (qué NO entra en la Fase 0)

- **Nada de cobro/recetas/MercadoPago/OCR** → Fase 1.
- **Nada de turnos/slots** → Fase 2.
- El agente de la Fase 0 **solo charla** (saludo + FAQs). Las *tools* (`buscar_receta_paciente`, `cobrar_receta`, etc.) se agregan en la Fase 1.
- La **rama médico** del runner en Fase 0 solo responde un mensaje fijo de bienvenida (la carga de recetas del médico es Fase 1). La **rama paciente** corre el agente completo.
- **No** se envían documentos/PDF ni plantillas (HSM) ni media → Fase 1+.
- No hace falta dumpear el schema real de MediCuenta para esta fase (todas las tablas son **nuevas** y referencian `auth.users(id)`; no tocamos `perfiles`/`prestaciones`/`ordenes`). El dump queda como prerrequisito de la Fase 1.

## Mapa de archivos (qué crea/toca cada uno)

| Archivo | Responsabilidad |
|---|---|
| `vitest.config.ts` (crear) | Config de vitest (entorno node). |
| `package.json` (modificar) | Scripts `test`, `typecheck`; devDep `vitest`. |
| `src/lib/crypto/encryption.ts` (crear) | `cifrar()/descifrar()` AES-256-GCM con `ENCRYPTION_KEY`. |
| `src/lib/crypto/encryption.test.ts` (crear) | Tests de cifrado (roundtrip, tampering, nonce único). |
| `src/lib/whatsapp/signature.ts` (crear) | `verifyMetaSignature()` HMAC-SHA256 del raw body. |
| `src/lib/whatsapp/signature.test.ts` (crear) | Tests de verificación de firma. |
| `src/lib/whatsapp/client.ts` (crear) | Cliente Meta: `normalizeRecipient`, `sendWhatsAppText`, `markAsRead`. |
| `src/lib/whatsapp/parse.ts` (crear) | `parseIncomingMessage()` + tipo `IncomingMessage` (text/image/document). |
| `src/lib/whatsapp/parse.test.ts` (crear) | Tests del parser. |
| `src/lib/whatsapp/clasificar.ts` (crear) | `esRemitenteMedico(from, numeroPersonal)` (función pura). |
| `src/lib/whatsapp/clasificar.test.ts` (crear) | Tests del clasificador. |
| `supabase/migrations/20260609_whatsapp_fase0.sql` (crear) | 6 tablas `wa_*` + RLS + índices. |
| `src/features/whatsapp/services/canales.ts` (crear) | `getCanalByPhoneNumberId()` (service-role). |
| `src/features/whatsapp/services/conversaciones.ts` (crear) | `ensureContacto/ensureConversacion/addMensaje/loadHistorial` (service-role, tablas `wa_*`). |
| `src/features/whatsapp/agent/systemPrompt.ts` (crear) | `buildSystemPromptPaciente()` (persona del asistente, Fase 0). |
| `src/features/whatsapp/agent/runAgentTurn.ts` (crear) | `runAgentTurn()` sobre `ai ^6` (`generateText`, Haiku 4.5, `medicoId` inyectado). |
| `src/features/whatsapp/runner.ts` (crear) | `handleIncomingWhatsApp()` re-keyeado. |
| `src/app/api/whatsapp/route.ts` (crear) | `GET` verify + `POST` (raw body, firma, dedupe, parse, 200). |
| `scripts/seed-wa-canal.mjs` (crear) | Siembra la fila `wa_canales` del médico de prueba (cifra el token). |

---

## Task 0: Setup — vitest, scripts y variables de entorno

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Manual: `.env.local` (no se commitea)

- [ ] **Step 1: Instalar vitest**

Run:
```bash
cd ~/proyectos/Medicuenta-V2.0 && npm install -D vitest
```
Expected: `vitest` aparece en `devDependencies`.

- [ ] **Step 2: Agregar scripts `test` y `typecheck` a `package.json`**

En `package.json`, dentro de `"scripts"`, dejar:
```json
"scripts": {
  "dev": "next dev --turbopack",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 3: Crear `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Verificar que el runner de tests arranca**

Run: `npm test`
Expected: vitest corre y reporta "No test files found" (todavía no hay tests). Sin errores de config.

- [ ] **Step 5: Cargar variables de entorno en `.env.local`**

Agregar a `~/proyectos/Medicuenta-V2.0/.env.local` (NO se commitea). Generar la clave de cifrado:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
Y dejar en `.env.local`:
```
ENCRYPTION_KEY=<el base64 de 32 bytes generado arriba>
WHATSAPP_TEST_PHONE_NUMBER_ID=<copiar de ~/proyectos/Agente_Whatsapp/.env.local>
WHATSAPP_TEST_ACCESS_TOKEN=<copiar de ~/proyectos/Agente_Whatsapp/.env.local>
WHATSAPP_VERIFY_TOKEN=<copiar de ~/proyectos/Agente_Whatsapp/.env.local>
WHATSAPP_APP_SECRET=<obtener del panel de la App de Meta → Configuración → Básico → Clave secreta>
```
(`SUPABASE_SERVICE_ROLE_KEY` y `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` ya deberían existir; confirmá que están.)

- [ ] **Step 6: Commit**

```bash
git add package.json vitest.config.ts package-lock.json
git commit -m "chore(test): agregar vitest + scripts test/typecheck (cimientos WhatsApp)"
```

---

## Task 1: Capa de cifrado AES-256-GCM (TDD)

**Files:**
- Create: `src/lib/crypto/encryption.ts`
- Test: `src/lib/crypto/encryption.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`src/lib/crypto/encryption.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { cifrar, descifrar } from './encryption'

beforeAll(() => {
  // Clave fija de 32 bytes en base64 para los tests.
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
})

describe('encryption', () => {
  it('cifra y descifra (roundtrip)', () => {
    const secreto = 'EAAG-token-de-meta-123'
    const blob = cifrar(secreto)
    expect(blob).not.toContain(secreto) // no queda en claro
    expect(descifrar(blob)).toBe(secreto)
  })

  it('usa un nonce distinto en cada cifrado', () => {
    expect(cifrar('hola')).not.toBe(cifrar('hola'))
  })

  it('falla si el ciphertext fue manipulado', () => {
    const blob = cifrar('hola')
    const [iv, tag, data] = blob.split('.')
    const manipulado = [iv, tag, Buffer.from('otracosa').toString('base64')].join('.')
    expect(() => descifrar(manipulado)).toThrow()
  })
})
```

- [ ] **Step 2: Correr el test para ver que falla**

Run: `npm test -- src/lib/crypto/encryption.test.ts`
Expected: FAIL — "Cannot find module './encryption'".

- [ ] **Step 3: Implementar el cifrado**

`src/lib/crypto/encryption.ts`:
```ts
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'

const ALGO = 'aes-256-gcm'

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) throw new Error('ENCRYPTION_KEY no está configurada')
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY debe ser 32 bytes en base64')
  return key
}

/** Cifra un texto. Formato del blob: base64(iv).base64(tag).base64(ciphertext) */
export function cifrar(plaintext: string): string {
  const iv = randomBytes(12) // nonce único por operación (nunca reusar con GCM)
  const cipher = createCipheriv(ALGO, getKey(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.')
}

/** Descifra un blob producido por cifrar(). Lanza si fue manipulado. */
export function descifrar(blob: string): string {
  const [ivB64, tagB64, dataB64] = blob.split('.')
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Formato de cifrado inválido')
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}
```

- [ ] **Step 4: Correr el test para ver que pasa**

Run: `npm test -- src/lib/crypto/encryption.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/crypto/encryption.ts src/lib/crypto/encryption.test.ts
git commit -m "feat(crypto): capa de cifrado AES-256-GCM para tokens (Meta/MP)"
```

---

## Task 2: Verificación de firma del webhook de Meta (TDD)

**Files:**
- Create: `src/lib/whatsapp/signature.ts`
- Test: `src/lib/whatsapp/signature.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`src/lib/whatsapp/signature.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyMetaSignature } from './signature'

const APP_SECRET = 'app-secret-de-prueba'
const body = '{"object":"whatsapp_business_account"}'
const firmaValida = 'sha256=' + createHmac('sha256', APP_SECRET).update(body, 'utf8').digest('hex')

describe('verifyMetaSignature', () => {
  it('acepta una firma válida', () => {
    expect(verifyMetaSignature(body, firmaValida, APP_SECRET)).toBe(true)
  })
  it('rechaza una firma inválida', () => {
    expect(verifyMetaSignature(body, 'sha256=deadbeef', APP_SECRET)).toBe(false)
  })
  it('rechaza si falta el header', () => {
    expect(verifyMetaSignature(body, null, APP_SECRET)).toBe(false)
  })
  it('rechaza si el body fue alterado', () => {
    expect(verifyMetaSignature(body + ' ', firmaValida, APP_SECRET)).toBe(false)
  })
})
```

- [ ] **Step 2: Correr el test para ver que falla**

Run: `npm test -- src/lib/whatsapp/signature.test.ts`
Expected: FAIL — "Cannot find module './signature'".

- [ ] **Step 3: Implementar la verificación**

`src/lib/whatsapp/signature.ts`:
```ts
import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Verifica el header `X-Hub-Signature-256` de Meta contra el raw body.
 * El raw body DEBE ser exactamente el recibido (sin re-serializar).
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false
  const esperada = 'sha256=' + createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(signatureHeader)
  const b = Buffer.from(esperada)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
```

- [ ] **Step 4: Correr el test para ver que pasa**

Run: `npm test -- src/lib/whatsapp/signature.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/signature.ts src/lib/whatsapp/signature.test.ts
git commit -m "feat(whatsapp): verificación de firma X-Hub-Signature-256 del webhook"
```

---

## Task 3: Cliente Meta + parser de mensajes entrantes

**Files:**
- Create: `src/lib/whatsapp/client.ts`
- Create: `src/lib/whatsapp/parse.ts`
- Test: `src/lib/whatsapp/parse.test.ts`

- [ ] **Step 1: Crear el cliente Meta (port directo, agnóstico de tenant)**

`src/lib/whatsapp/client.ts`:
```ts
/** Cliente de Meta WhatsApp Cloud API (envío de texto + marcar leído). */
const GRAPH_VERSION = 'v21.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`

/**
 * Normaliza el número destinatario para el envío.
 * Argentina (54): los entrantes llegan como `549XXXXXXXXXX` (con 9), pero la
 * Cloud API exige enviar a `54XXXXXXXXXX` (sin el 9), o Meta rechaza (#131030).
 */
export function normalizeRecipient(to: string): string {
  const digits = to.replace(/\D/g, '')
  if (digits.startsWith('549')) return '54' + digits.slice(3)
  return digits
}

interface SendParams {
  phoneNumberId: string
  accessToken: string
  to: string
}

export async function sendWhatsAppText(params: SendParams & { text: string }): Promise<boolean> {
  const res = await fetch(`${GRAPH_BASE}/${params.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${params.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizeRecipient(params.to),
      type: 'text',
      text: { body: params.text },
    }),
  })
  if (!res.ok) console.error('WhatsApp sendText error:', await res.text())
  return res.ok
}

/** Marca un mensaje entrante como leído (los dos tildes azules). */
export async function markAsRead(params: SendParams & { messageId: string }): Promise<void> {
  await fetch(`${GRAPH_BASE}/${params.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${params.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: params.messageId }),
  }).catch(() => {})
}
```

- [ ] **Step 2: Escribir el test del parser (falla)**

`src/lib/whatsapp/parse.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { parseIncomingMessage } from './parse'

function textPayload(text: string) {
  return {
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: '111' },
      contacts: [{ profile: { name: 'Juan' } }],
      messages: [{ from: '5493834000000', id: 'wamid.ABC', type: 'text', text: { body: text } }],
    } }] }],
  }
}

describe('parseIncomingMessage', () => {
  it('parsea un mensaje de texto', () => {
    const m = parseIncomingMessage(textPayload('hola'))
    expect(m).toEqual({
      phoneNumberId: '111',
      from: '5493834000000',
      messageId: 'wamid.ABC',
      contactName: 'Juan',
      type: 'text',
      text: 'hola',
    })
  })

  it('parsea un documento (PDF) con su mediaId', () => {
    const payload = {
      entry: [{ changes: [{ value: {
        metadata: { phone_number_id: '111' },
        messages: [{ from: '549383', id: 'wamid.DOC', type: 'document',
          document: { id: 'media123', filename: 'receta.pdf', mime_type: 'application/pdf' } }],
      } }] }],
    }
    const m = parseIncomingMessage(payload)
    expect(m?.type).toBe('document')
    expect(m?.mediaId).toBe('media123')
    expect(m?.filename).toBe('receta.pdf')
  })

  it('devuelve null para un status update (sin messages)', () => {
    const payload = { entry: [{ changes: [{ value: { metadata: { phone_number_id: '111' }, statuses: [{}] } }] }] }
    expect(parseIncomingMessage(payload)).toBeNull()
  })
})
```

- [ ] **Step 3: Correr el test para ver que falla**

Run: `npm test -- src/lib/whatsapp/parse.test.ts`
Expected: FAIL — "Cannot find module './parse'".

- [ ] **Step 4: Implementar el parser (port + soporte `document`)**

`src/lib/whatsapp/parse.ts`:
```ts
export interface IncomingMessage {
  phoneNumberId: string // número del negocio que recibió (para enrutar)
  from: string // teléfono del remitente
  messageId: string
  contactName?: string
  type: 'text' | 'image' | 'audio' | 'document' | 'other'
  text?: string
  mediaId?: string // imágenes / audio / documentos (se descargan aparte)
  filename?: string // sólo documentos
}

/**
 * Extrae el mensaje entrante de un payload del webhook de Meta.
 * Devuelve null si el evento no es un mensaje de usuario (ej. status updates).
 */
export function parseIncomingMessage(payload: unknown): IncomingMessage | null {
  try {
    const entry = (payload as { entry?: unknown[] })?.entry?.[0] as
      | { changes?: { value?: Record<string, unknown> }[] }
      | undefined
    const value = entry?.changes?.[0]?.value
    if (!value) return null

    const metadata = value.metadata as { phone_number_id?: string } | undefined
    const messages = value.messages as Record<string, unknown>[] | undefined
    const msg = messages?.[0]
    if (!msg || !metadata?.phone_number_id) return null

    const contacts = value.contacts as { profile?: { name?: string } }[] | undefined
    const rawType = String(msg.type)
    const known = rawType === 'text' || rawType === 'image' || rawType === 'audio' || rawType === 'document'
    const base: IncomingMessage = {
      phoneNumberId: metadata.phone_number_id,
      from: String(msg.from),
      messageId: String(msg.id),
      contactName: contacts?.[0]?.profile?.name,
      type: known ? (rawType as IncomingMessage['type']) : 'other',
    }

    if (rawType === 'text') base.text = (msg.text as { body?: string })?.body
    else if (rawType === 'image') {
      base.mediaId = (msg.image as { id?: string })?.id
      base.text = (msg.image as { caption?: string })?.caption
    } else if (rawType === 'audio') {
      base.mediaId = (msg.audio as { id?: string })?.id
    } else if (rawType === 'document') {
      base.mediaId = (msg.document as { id?: string })?.id
      base.filename = (msg.document as { filename?: string })?.filename
      base.text = (msg.document as { caption?: string })?.caption
    }

    return base
  } catch {
    return null
  }
}
```

- [ ] **Step 5: Correr el test para ver que pasa**

Run: `npm test -- src/lib/whatsapp/parse.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/whatsapp/client.ts src/lib/whatsapp/parse.ts src/lib/whatsapp/parse.test.ts
git commit -m "feat(whatsapp): cliente Meta (texto) + parser de entrantes (text/image/document)"
```

---

## Task 4: Clasificador de remitente médico vs paciente (TDD)

**Files:**
- Create: `src/lib/whatsapp/clasificar.ts`
- Test: `src/lib/whatsapp/clasificar.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`src/lib/whatsapp/clasificar.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { esRemitenteMedico } from './clasificar'

describe('esRemitenteMedico', () => {
  it('reconoce al médico aunque difiera el "9" argentino', () => {
    // entrante con 9, número personal cargado sin 9
    expect(esRemitenteMedico('5493834111222', '543834111222')).toBe(true)
  })
  it('reconoce al médico con formato idéntico', () => {
    expect(esRemitenteMedico('5493834111222', '5493834111222')).toBe(true)
  })
  it('un paciente NO es el médico', () => {
    expect(esRemitenteMedico('5493834999888', '543834111222')).toBe(false)
  })
})
```

- [ ] **Step 2: Correr el test para ver que falla**

Run: `npm test -- src/lib/whatsapp/clasificar.test.ts`
Expected: FAIL — "Cannot find module './clasificar'".

- [ ] **Step 3: Implementar el clasificador**

`src/lib/whatsapp/clasificar.ts`:
```ts
import { normalizeRecipient } from './client'

/**
 * True si el remitente entrante es el médico dueño del canal.
 * Compara normalizando el "9" argentino para evitar el desencuentro 549.. vs 54..
 */
export function esRemitenteMedico(from: string, numeroPersonal: string): boolean {
  return normalizeRecipient(from) === normalizeRecipient(numeroPersonal)
}
```

- [ ] **Step 4: Correr el test para ver que pasa**

Run: `npm test -- src/lib/whatsapp/clasificar.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/clasificar.ts src/lib/whatsapp/clasificar.test.ts
git commit -m "feat(whatsapp): clasificador de remitente médico vs paciente"
```

---

## Task 5: Migración de las tablas `wa_*`

**Files:**
- Create: `supabase/migrations/20260609_whatsapp_fase0.sql`

- [ ] **Step 1: Escribir la migración (sigue el molde de `cirugias`)**

`supabase/migrations/20260609_whatsapp_fase0.sql`:
```sql
-- ============================================================================
-- WhatsApp Fase 0 — tablas base, re-keyeadas a medico_id (RLS auth.uid()=medico_id)
-- ============================================================================

-- ── wa_canales: conexión del número de WhatsApp de cada médico ──────────────
CREATE TABLE wa_canales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number_id TEXT NOT NULL UNIQUE,
  display_phone_number TEXT,
  access_token_cifrado TEXT NOT NULL,
  numero_personal TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'conectado' CHECK (estado IN ('conectado', 'pendiente')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_canales_medico_id ON wa_canales(medico_id);
ALTER TABLE wa_canales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_canales_select" ON wa_canales FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "wa_canales_insert" ON wa_canales FOR INSERT WITH CHECK (auth.uid() = medico_id);
CREATE POLICY "wa_canales_update" ON wa_canales FOR UPDATE USING (auth.uid() = medico_id);
CREATE POLICY "wa_canales_delete" ON wa_canales FOR DELETE USING (auth.uid() = medico_id);

-- ── wa_contactos: pacientes que escriben al bot ─────────────────────────────
CREATE TABLE wa_contactos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  telefono TEXT NOT NULL,
  nombre TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (medico_id, telefono)
);
CREATE INDEX idx_wa_contactos_medico_id ON wa_contactos(medico_id);
ALTER TABLE wa_contactos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_contactos_select" ON wa_contactos FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "wa_contactos_insert" ON wa_contactos FOR INSERT WITH CHECK (auth.uid() = medico_id);
CREATE POLICY "wa_contactos_update" ON wa_contactos FOR UPDATE USING (auth.uid() = medico_id);
CREATE POLICY "wa_contactos_delete" ON wa_contactos FOR DELETE USING (auth.uid() = medico_id);

-- ── wa_conversaciones: hilo de WhatsApp por paciente ────────────────────────
CREATE TABLE wa_conversaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contacto_id UUID NOT NULL REFERENCES wa_contactos(id) ON DELETE CASCADE,
  estado TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
  bot_pausado BOOLEAN NOT NULL DEFAULT false,
  necesita_humano BOOLEAN NOT NULL DEFAULT false,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_conversaciones_medico_id ON wa_conversaciones(medico_id);
CREATE INDEX idx_wa_conversaciones_contacto_id ON wa_conversaciones(contacto_id);
ALTER TABLE wa_conversaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_conversaciones_select" ON wa_conversaciones FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "wa_conversaciones_insert" ON wa_conversaciones FOR INSERT WITH CHECK (auth.uid() = medico_id);
CREATE POLICY "wa_conversaciones_update" ON wa_conversaciones FOR UPDATE USING (auth.uid() = medico_id);
CREATE POLICY "wa_conversaciones_delete" ON wa_conversaciones FOR DELETE USING (auth.uid() = medico_id);

-- ── wa_mensajes: mensajes del hilo ──────────────────────────────────────────
CREATE TABLE wa_mensajes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversacion_id UUID NOT NULL REFERENCES wa_conversaciones(id) ON DELETE CASCADE,
  direccion TEXT NOT NULL CHECK (direccion IN ('entrante', 'saliente')),
  origen TEXT NOT NULL CHECK (origen IN ('ia', 'humano', 'paciente', 'medico')),
  contenido TEXT NOT NULL,
  wamid TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_mensajes_medico_id ON wa_mensajes(medico_id);
CREATE INDEX idx_wa_mensajes_conversacion_id ON wa_mensajes(conversacion_id);
ALTER TABLE wa_mensajes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_mensajes_select" ON wa_mensajes FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "wa_mensajes_insert" ON wa_mensajes FOR INSERT WITH CHECK (auth.uid() = medico_id);
CREATE POLICY "wa_mensajes_update" ON wa_mensajes FOR UPDATE USING (auth.uid() = medico_id);
CREATE POLICY "wa_mensajes_delete" ON wa_mensajes FOR DELETE USING (auth.uid() = medico_id);

-- ── wa_config_agente: configuración del agente por médico ───────────────────
CREATE TABLE wa_config_agente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  system_prompt TEXT,
  tono TEXT,
  saludo TEXT,
  faqs JSONB NOT NULL DEFAULT '[]'::jsonb,
  precio_receta_default DECIMAL(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_config_agente_medico_id ON wa_config_agente(medico_id);
ALTER TABLE wa_config_agente ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_config_agente_select" ON wa_config_agente FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "wa_config_agente_insert" ON wa_config_agente FOR INSERT WITH CHECK (auth.uid() = medico_id);
CREATE POLICY "wa_config_agente_update" ON wa_config_agente FOR UPDATE USING (auth.uid() = medico_id);
CREATE POLICY "wa_config_agente_delete" ON wa_config_agente FOR DELETE USING (auth.uid() = medico_id);

-- ── wa_eventos_webhook: dedupe/idempotencia (escribe el sistema, service-role) ─
CREATE TABLE wa_eventos_webhook (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wamid TEXT NOT NULL UNIQUE,
  medico_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  procesado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE wa_eventos_webhook ENABLE ROW LEVEL SECURITY;
-- Sólo lectura para el médico dueño; las inserciones van por service-role (bypass RLS).
CREATE POLICY "wa_eventos_webhook_select" ON wa_eventos_webhook FOR SELECT USING (auth.uid() = medico_id);
```

- [ ] **Step 2: Aplicar la migración**

Aplicar contra el proyecto Supabase de MediCuenta (project ref `eylcrxhpccwobipcjzal`) por una de estas vías:
- **Supabase MCP** (preferido, como el resto del proyecto): `apply_migration` con el nombre `whatsapp_fase0` y el SQL de arriba.
- **o** Dashboard → SQL Editor → pegar y ejecutar.

- [ ] **Step 3: Verificar que las tablas existen con RLS**

Vía Supabase MCP `list_tables` (o SQL Editor):
```sql
select tablename, rowsecurity from pg_tables where tablename like 'wa_%';
```
Expected: 6 filas (`wa_canales`, `wa_contactos`, `wa_conversaciones`, `wa_mensajes`, `wa_config_agente`, `wa_eventos_webhook`), todas con `rowsecurity = true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260609_whatsapp_fase0.sql
git commit -m "feat(db): tablas wa_* Fase 0 (canales, contactos, conversaciones, mensajes, config, eventos)"
```

---

## Task 6: Servicios de datos (service-role)

**Files:**
- Create: `src/features/whatsapp/services/canales.ts`
- Create: `src/features/whatsapp/services/conversaciones.ts`

> Estos servicios reciben un cliente **service-role** (sin sesión) y filtran `medico_id` manualmente. No usan `requireMedicoId()` (no hay `auth.uid()` en el webhook).

- [ ] **Step 1: Crear el servicio de canales**

`src/features/whatsapp/services/canales.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { descifrar } from '@/lib/crypto/encryption'

export interface CanalResuelto {
  medicoId: string
  phoneNumberId: string
  accessToken: string // ya descifrado
  numeroPersonal: string
}

/** Resuelve el canal (médico + token) a partir del phone_number_id que recibió el webhook. */
export async function getCanalByPhoneNumberId(
  db: SupabaseClient,
  phoneNumberId: string,
): Promise<CanalResuelto | null> {
  const { data } = await db
    .from('wa_canales')
    .select('medico_id, phone_number_id, access_token_cifrado, numero_personal, estado')
    .eq('phone_number_id', phoneNumberId)
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

- [ ] **Step 2: Crear el servicio de conversaciones/contactos/mensajes**

`src/features/whatsapp/services/conversaciones.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export interface HistorialMsg {
  role: 'user' | 'assistant'
  content: string
}

export async function ensureContacto(
  db: SupabaseClient,
  medicoId: string,
  telefono: string,
  nombre?: string,
): Promise<string> {
  const { data: existing } = await db
    .from('wa_contactos')
    .select('id')
    .eq('medico_id', medicoId)
    .eq('telefono', telefono)
    .maybeSingle()
  if (existing) return (existing as { id: string }).id
  const { data, error } = await db
    .from('wa_contactos')
    .insert({ medico_id: medicoId, telefono, nombre: nombre ?? null })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function ensureConversacion(
  db: SupabaseClient,
  medicoId: string,
  contactoId: string,
): Promise<string> {
  const { data: abierta } = await db
    .from('wa_conversaciones')
    .select('id')
    .eq('medico_id', medicoId)
    .eq('contacto_id', contactoId)
    .eq('estado', 'abierta')
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (abierta) return (abierta as { id: string }).id
  const { data, error } = await db
    .from('wa_conversaciones')
    .insert({ medico_id: medicoId, contacto_id: contactoId, estado: 'abierta' })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function isBotPausado(db: SupabaseClient, conversacionId: string): Promise<boolean> {
  const { data } = await db
    .from('wa_conversaciones')
    .select('bot_pausado')
    .eq('id', conversacionId)
    .single()
  return (data as { bot_pausado: boolean } | null)?.bot_pausado ?? false
}

export async function addMensaje(
  db: SupabaseClient,
  args: {
    medicoId: string
    conversacionId: string
    direccion: 'entrante' | 'saliente'
    origen: 'ia' | 'humano' | 'paciente' | 'medico'
    contenido: string
    wamid?: string
  },
): Promise<void> {
  await db.from('wa_mensajes').insert({
    medico_id: args.medicoId,
    conversacion_id: args.conversacionId,
    direccion: args.direccion,
    origen: args.origen,
    contenido: args.contenido,
    wamid: args.wamid ?? null,
  })
  await db
    .from('wa_conversaciones')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', args.conversacionId)
}

export async function loadHistorial(
  db: SupabaseClient,
  conversacionId: string,
  limite = 12,
): Promise<HistorialMsg[]> {
  const { data } = await db
    .from('wa_mensajes')
    .select('origen, contenido')
    .eq('conversacion_id', conversacionId)
    .order('created_at', { ascending: false })
    .limit(limite)
  const rows = ((data as { origen: string; contenido: string }[]) ?? []).reverse()
  return rows.map((m) => ({
    role: m.origen === 'paciente' ? 'user' : 'assistant',
    content: m.contenido,
  }))
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: sin errores en `src/features/whatsapp/services/*`.

- [ ] **Step 4: Commit**

```bash
git add src/features/whatsapp/services/canales.ts src/features/whatsapp/services/conversaciones.ts
git commit -m "feat(whatsapp): servicios de canales y conversaciones (service-role, medico_id manual)"
```

---

## Task 7: Agente Fase 0 (ai ^6, solo charla)

**Files:**
- Create: `src/features/whatsapp/agent/systemPrompt.ts`
- Create: `src/features/whatsapp/agent/runAgentTurn.ts`

- [ ] **Step 1: Crear el system prompt del paciente (Fase 0)**

`src/features/whatsapp/agent/systemPrompt.ts`:
```ts
export interface ConfigAgente {
  saludo?: string | null
  tono?: string | null
  faqs?: { pregunta: string; respuesta: string }[] | null
}

/** Arma el system prompt del asistente que atiende a los pacientes por WhatsApp (Fase 0: solo charla). */
export function buildSystemPromptPaciente(opts: {
  config: ConfigAgente | null
  contactName?: string
}): string {
  const tono = opts.config?.tono?.trim() || 'cordial, claro y breve'
  const saludo = opts.config?.saludo?.trim() || 'Hola, soy el asistente del consultorio.'
  const faqs = (opts.config?.faqs ?? [])
    .map((f) => `- P: ${f.pregunta}\n  R: ${f.respuesta}`)
    .join('\n')

  return [
    `Sos el asistente virtual de un consultorio médico en Catamarca, Argentina, que atiende a los pacientes por WhatsApp.`,
    `Hablás en español rioplatense, con un tono ${tono}. Sé breve (WhatsApp).`,
    `Saludo sugerido: "${saludo}".`,
    opts.contactName ? `El paciente se llama ${opts.contactName} (si corresponde, tuteá con respeto).` : '',
    `NO das diagnósticos ni indicaciones médicas. Si te preguntan algo clínico, derivá al médico.`,
    `Todavía NO podés cobrar recetas ni dar turnos (esas funciones llegan pronto). Si te las piden, avisá que estarán disponibles en breve.`,
    faqs ? `\nPreguntas frecuentes que SÍ podés responder:\n${faqs}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}
```

- [ ] **Step 2: Crear `runAgentTurn` sobre ai ^6**

`src/features/whatsapp/agent/runAgentTurn.ts`:
```ts
import { generateText } from 'ai'
import { openrouter, getAgentModel } from '@/lib/ai/openrouter'
import type { HistorialMsg } from '@/features/whatsapp/services/conversaciones'

export interface AgentDeps {
  medicoId: string // inyectado (no hay sesión en el webhook). Las tools de Fase 1 lo usarán.
}

/**
 * Corre un turno del agente y devuelve el texto de respuesta.
 * Fase 0: sin tools (solo conversación). En Fase 1 se agregan tools de cobro.
 */
export async function runAgentTurn(opts: {
  systemPrompt: string
  historial: HistorialMsg[]
  // deps queda reservado para Fase 1 (tools que reciben medicoId).
  deps?: AgentDeps
}): Promise<string> {
  const result = await generateText({
    model: openrouter(getAgentModel()),
    system: opts.systemPrompt,
    messages: opts.historial,
  })
  return result.text.trim()
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: sin errores. (`generateText`, `openrouter`, `getAgentModel`, `HistorialMsg` resuelven.)

- [ ] **Step 4: Commit**

```bash
git add src/features/whatsapp/agent/systemPrompt.ts src/features/whatsapp/agent/runAgentTurn.ts
git commit -m "feat(whatsapp): agente Fase 0 sobre ai ^6 (Claude Haiku 4.5, solo charla)"
```

---

## Task 8: Runner re-keyeado

**Files:**
- Create: `src/features/whatsapp/runner.ts`

- [ ] **Step 1: Implementar `handleIncomingWhatsApp`**

`src/features/whatsapp/runner.ts`:
```ts
import { createServiceClient } from '@/lib/supabase/server'
import { parseIncomingMessage } from '@/lib/whatsapp/parse'
import { sendWhatsAppText, markAsRead } from '@/lib/whatsapp/client'
import { esRemitenteMedico } from '@/lib/whatsapp/clasificar'
import { getCanalByPhoneNumberId } from '@/features/whatsapp/services/canales'
import {
  ensureContacto,
  ensureConversacion,
  isBotPausado,
  addMensaje,
  loadHistorial,
} from '@/features/whatsapp/services/conversaciones'
import { buildSystemPromptPaciente, type ConfigAgente } from '@/features/whatsapp/agent/systemPrompt'
import { runAgentTurn } from '@/features/whatsapp/agent/runAgentTurn'

const MSG_MEDICO_FASE0 =
  'Hola Doctor 👋 Soy su asistente de WhatsApp. La carga de recetas para cobro estará disponible muy pronto. Por ahora ya estoy conectado y atendiendo a los pacientes.'

/**
 * Procesa un webhook entrante de WhatsApp re-keyeado a medico_id.
 * Best-effort: no lanza (el webhook siempre responde 200).
 */
export async function handleIncomingWhatsApp(payload: unknown): Promise<void> {
  const incoming = parseIncomingMessage(payload)
  if (!incoming) return
  // Fase 0: solo texto (image/document/audio se ignoran; llegan en Fase 1+).
  if (incoming.type !== 'text') return

  const db = createServiceClient()

  // Resolver el médico dueño del número que recibió el mensaje.
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

  // ── Bifurcación médico vs paciente ──
  if (esRemitenteMedico(incoming.from, canal.numeroPersonal)) {
    // Fase 0: el intake del médico (cargar recetas) llega en Fase 1.
    await sendWhatsAppText({
      phoneNumberId: canal.phoneNumberId,
      accessToken: canal.accessToken,
      to: incoming.from,
      text: MSG_MEDICO_FASE0,
    })
    return
  }

  // ── Rama paciente ──
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

  // Si un humano tomó el control, la IA no responde.
  if (await isBotPausado(db, conversacionId)) return

  // Config del agente del médico (puede no existir aún → defaults).
  const { data: cfgRow } = await db
    .from('wa_config_agente')
    .select('saludo, tono, faqs')
    .eq('medico_id', canal.medicoId)
    .maybeSingle()

  const systemPrompt = buildSystemPromptPaciente({
    config: cfgRow as ConfigAgente | null,
    contactName: incoming.contactName,
  })
  const historial = await loadHistorial(db, conversacionId, 12)

  let reply: string
  try {
    reply = await runAgentTurn({ systemPrompt, historial, deps: { medicoId: canal.medicoId } })
  } catch (e) {
    console.error('[wa] agent error:', e)
    return
  }
  if (!reply) return

  await sendWhatsAppText({
    phoneNumberId: canal.phoneNumberId,
    accessToken: canal.accessToken,
    to: incoming.from,
    text: reply,
  })
  await addMensaje(db, {
    medicoId: canal.medicoId,
    conversacionId,
    direccion: 'saliente',
    origen: 'ia',
    contenido: reply,
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: sin errores en `src/features/whatsapp/runner.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/features/whatsapp/runner.ts
git commit -m "feat(whatsapp): runner re-keyeado a medico_id (lookup por número + bifurcación médico/paciente)"
```

---

## Task 9: Webhook seguro `/api/whatsapp`

**Files:**
- Create: `src/app/api/whatsapp/route.ts`

- [ ] **Step 1: Implementar el route handler (GET verify + POST seguro)**

`src/app/api/whatsapp/route.ts`:
```ts
import { createServiceClient } from '@/lib/supabase/server'
import { verifyMetaSignature } from '@/lib/whatsapp/signature'
import { parseIncomingMessage } from '@/lib/whatsapp/parse'
import { handleIncomingWhatsApp } from '@/features/whatsapp/runner'

export const runtime = 'nodejs' // necesitamos node:crypto + Buffer

// ── GET: verificación del webhook (handshake de Meta) ──
export async function GET(req: Request) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')
  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? '', { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

// ── POST: mensajes entrantes ──
export async function POST(req: Request) {
  // 1) Leer el RAW body ANTES de parsear (necesario para verificar la firma).
  const rawBody = await req.text()

  // 2) Verificar la firma de Meta (X-Hub-Signature-256).
  const appSecret = process.env.WHATSAPP_APP_SECRET
  const signature = req.headers.get('x-hub-signature-256')
  if (!appSecret || !verifyMetaSignature(rawBody, signature, appSecret)) {
    return new Response('Invalid signature', { status: 401 })
  }

  // 3) Parsear el payload.
  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  // 4) Idempotencia: dedupe por wamid (Meta reintenta).
  const incoming = parseIncomingMessage(payload)
  if (incoming) {
    const db = createServiceClient()
    const { error } = await db
      .from('wa_eventos_webhook')
      .insert({ wamid: incoming.messageId })
    // Violación de UNIQUE → ya lo procesamos → devolvemos 200 sin re-procesar.
    if (error) {
      if (error.code === '23505') return new Response('OK', { status: 200 })
      console.error('[wa] dedupe insert error:', error)
    }
  }

  // 5) Procesar (best-effort) y SIEMPRE responder 200 (o Meta reintenta).
  try {
    await handleIncomingWhatsApp(payload)
  } catch (e) {
    console.error('[wa] handler error:', e)
  }
  return new Response('OK', { status: 200 })
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: sin errores.

- [ ] **Step 3: Build (asegura que el route handler compila en Next 16)**

Run: `npm run build`
Expected: build OK; la ruta `/api/whatsapp` aparece como Route (ƒ / dynamic).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/whatsapp/route.ts
git commit -m "feat(whatsapp): webhook seguro /api/whatsapp (verify + firma + dedupe wamid)"
```

---

## Task 10: Seed del canal de prueba + verificación de extremo a extremo

**Files:**
- Create: `scripts/seed-wa-canal.mjs`

> **Prerrequisito:** el médico de prueba debe existir en Supabase Auth (signup en MediCuenta). Necesitás su `auth.users.id` (UUID) y su número personal de WhatsApp (el que va a usar como "dueño").

- [ ] **Step 1: Crear el script de seed**

`scripts/seed-wa-canal.mjs`:
```js
// Siembra/actualiza la fila wa_canales del médico de prueba.
// Uso: node scripts/seed-wa-canal.mjs <medico_uuid> <numero_personal>
// Requiere en el entorno: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   ENCRYPTION_KEY, WHATSAPP_TEST_PHONE_NUMBER_ID, WHATSAPP_TEST_ACCESS_TOKEN.
import { createClient } from '@supabase/supabase-js'
import { randomBytes, createCipheriv } from 'node:crypto'

// Mismo formato que src/lib/crypto/encryption.ts: base64(iv).base64(tag).base64(ct)
function cifrar(plaintext) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'base64')
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY debe ser 32 bytes en base64')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.')
}

const [, , medicoId, numeroPersonal] = process.argv
if (!medicoId || !numeroPersonal) {
  console.error('Uso: node scripts/seed-wa-canal.mjs <medico_uuid> <numero_personal>')
  process.exit(1)
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const row = {
  medico_id: medicoId,
  phone_number_id: process.env.WHATSAPP_TEST_PHONE_NUMBER_ID,
  access_token_cifrado: cifrar(process.env.WHATSAPP_TEST_ACCESS_TOKEN),
  numero_personal: numeroPersonal,
  estado: 'conectado',
}

const { error } = await db.from('wa_canales').upsert(row, { onConflict: 'phone_number_id' })
if (error) {
  console.error('Error al sembrar wa_canales:', error)
  process.exit(1)
}
console.log('✓ wa_canales sembrado para médico', medicoId)
```

- [ ] **Step 2: Ejecutar el seed**

Run (cargando `.env.local` en el entorno):
```bash
cd ~/proyectos/Medicuenta-V2.0 && set -a && . ./.env.local && set +a && node scripts/seed-wa-canal.mjs <MEDICO_UUID> <NUMERO_PERSONAL>
```
Expected: `✓ wa_canales sembrado para médico ...`

- [ ] **Step 3: Verificar la fila**

Vía Supabase MCP / SQL Editor:
```sql
select medico_id, phone_number_id, numero_personal, estado,
       length(access_token_cifrado) as token_len
from wa_canales;
```
Expected: 1 fila, `estado='conectado'`, `token_len` > 0, `access_token_cifrado` NO es el token en claro (tiene formato `xxx.yyy.zzz`).

- [ ] **Step 4: Desplegar y conectar el webhook en Meta**

1. Deploy a Vercel (preview): `git push` de la rama → preview URL, o `vercel deploy`. Confirmá que las env vars (`ENCRYPTION_KEY`, `WHATSAPP_*`, `SUPABASE_SERVICE_ROLE_KEY`) estén cargadas en el proyecto de Vercel.
2. En el panel de Meta (WhatsApp → Configuration → Webhook): Callback URL = `https://<deploy>/api/whatsapp`, Verify token = `WHATSAPP_VERIFY_TOKEN`. Suscribir el campo `messages`.
3. Meta hace un `GET` de verificación → debe responder 200 con el challenge.

- [ ] **Step 5: Smoke test de extremo a extremo (verificación de comportamiento real)**

1. **Rama paciente:** desde un WhatsApp que NO sea el número personal del médico (y que esté en la lista de destinatarios de prueba de Meta), enviar "Hola" al número de prueba.
   - Expected: el bot responde un saludo del asistente. En la DB: `select * from wa_contactos`, `wa_conversaciones`, `wa_mensajes` muestran el contacto, el hilo y 2 mensajes (entrante `origen='paciente'`, saliente `origen='ia'`).
2. **Rama médico:** desde el número personal del médico (el `numero_personal` sembrado), enviar "Hola".
   - Expected: responde el mensaje fijo de bienvenida al médico (`MSG_MEDICO_FASE0`); NO crea contacto/paciente.
3. **Idempotencia:** reenviar exactamente el mismo evento (o esperar un reintento de Meta) no genera respuesta ni filas duplicadas (`wa_eventos_webhook` tiene el `wamid`).

- [ ] **Step 6: Commit**

```bash
git add scripts/seed-wa-canal.mjs
git commit -m "chore(whatsapp): script de seed del canal de prueba + verificación E2E Fase 0"
```

---

## Definition of Done (Fase 0)

- [ ] `npm test` verde (cifrado, firma, parser, clasificador).
- [ ] `npm run typecheck`, `npm run lint` y `npm run build` sin errores.
- [ ] Las 6 tablas `wa_*` existen con RLS habilitado.
- [ ] El webhook verifica firma, deduplica por `wamid` y responde 200.
- [ ] Un paciente que escribe al número de prueba recibe respuesta del agente y queda persistido (`wa_contactos`/`wa_conversaciones`/`wa_mensajes`).
- [ ] El médico (su `numero_personal`) recibe el mensaje de bienvenida y NO se registra como paciente.
- [ ] Los tokens en `wa_canales` están cifrados (nunca en claro).

## Riesgos / notas para el ejecutor

- **Lista de destinatarios de Meta (modo prueba):** el número de prueba solo puede escribirle a hasta 5 destinatarios cargados a mano en el panel de Meta. Cargá ahí el número del paciente de prueba y el `numero_personal` del médico.
- **Env en Vercel:** el webhook corre en Vercel; sin `ENCRYPTION_KEY`/`WHATSAPP_APP_SECRET`/`SUPABASE_SERVICE_ROLE_KEY` cargadas en el proyecto de Vercel, fallará en runtime (no solo en local).
- **`req.text()` una sola vez:** el body se lee una vez para la firma y se `JSON.parse`-ea de ese string; no volver a leer `req.json()`.
- **Rama `feat/whatsapp-recetas-turnos`:** todo es aditivo. Rebasar sobre `dev/gaby` antes de empezar si Gaby avanzó.
```

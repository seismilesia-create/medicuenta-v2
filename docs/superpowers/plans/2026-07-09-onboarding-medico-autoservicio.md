# Onboarding de médicos por autoservicio — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Héctor genere un enlace único desde `/admin/medicos`, se lo mande al médico por el canal que sea, y el médico complete sus datos + email + contraseña y quede operativo y logueado, sin depender de ningún email frágil.

**Architecture:** Token propio en una tabla `invitaciones_medico` (no el token de Supabase). Página pública `/alta/[token]` valida el token server-side y muestra un formulario. Al enviarlo, una server action crea la cuenta con `admin.createUser` (contraseña ya puesta, `email_confirm: true`), reutiliza la RPC existente `onboard_medico_cablear` para el nodo/slug/servicio, setea el arancel básico por defecto, marca la invitación como completada e inicia sesión automáticamente.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (service-role + SSR), Zod 4, Vitest 4 (node env), `qrcode`, `crypto` de Node.

## Global Constraints

- **NUNCA usar `any`** (usar `unknown`). Copiado de CLAUDE.md.
- **SIEMPRE validar entradas de usuario con Zod.**
- **RLS activada** en toda tabla nueva.
- Naming: variables/funciones `camelCase`, componentes `PascalCase`, archivos `kebab-case`.
- El identificador de login es **el email** (no username).
- El médico entra con `categoria_arancel = 'medica'` y `atiende_interior = false`; Héctor lo promueve después desde `/admin/medicos/[id]/editar`.
- Valores válidos de `categoria_arancel`: `'medica' | 'especialista' | 'oftalmologica' | 'oftalmologica_recertificado'`.
- URL pública server-side: `siteUrl()` de `@/lib/site-url` (lee `PUBLIC_BASE_URL`).
- Service-role client: `createServiceClient()` de `@/lib/supabase/server` (bypassea RLS, exento del trigger `proteger_columnas_admin_perfil`).
- SSR cookie client (para login/sesión): `createClient()` de `@/lib/supabase/server`.
- Migraciones = espejo versionado de prod; se aplican vía Supabase MCP. **Aplicar la migración a prod requiere OK explícito de Héctor** (es additiva y segura, pero se pide igual).
- Tests: los módulos de lógica pura llevan test Vitest (TDD). Las server actions que tocan la DB NO se unit-testean en este repo (patrón existente); se validan con `npm run typecheck` + E2E manual.

---

### Task 1: Migración — tabla `invitaciones_medico`

**Files:**
- Create: `supabase/migrations/20260709_invitaciones_medico.sql`

**Interfaces:**
- Produces: tabla `public.invitaciones_medico` con columnas `id, token, estado, nombre_referencia, email, expira_en, creada_por, medico_id, completada_en, created_at`.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/20260709_invitaciones_medico.sql
-- Onboarding de médicos por autoservicio: invitación con token propio.
-- Héctor (superadmin) genera un token → se lo pasa al médico por WhatsApp/email →
-- el médico abre /alta/<token>, carga sus datos + contraseña y queda operativo.
-- Acceso SOLO por service_role (RLS activada sin policy para anon/authenticated).

create table if not exists public.invitaciones_medico (
  id                uuid primary key default gen_random_uuid(),
  token             text not null unique,
  estado            text not null default 'pendiente'
                      check (estado in ('pendiente','completada','expirada','revocada')),
  nombre_referencia text,
  email             text,
  expira_en         timestamptz not null default (now() + interval '72 hours'),
  creada_por        uuid not null references auth.users(id) on delete cascade,
  medico_id         uuid references auth.users(id) on delete set null,
  completada_en     timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists idx_invitaciones_medico_estado on public.invitaciones_medico (estado);

alter table public.invitaciones_medico enable row level security;
-- Sin policies: solo service_role (que bypassea RLS) puede leer/escribir.
```

- [ ] **Step 2: Aplicar la migración a Supabase**

Pedir OK a Héctor y aplicar vía Supabase MCP (`apply_migration`, name `invitaciones_medico`), o `execute_sql` con el mismo contenido.

- [ ] **Step 3: Verificar que la tabla existe y RLS está activa**

Run (Supabase MCP `execute_sql`):
```sql
select relrowsecurity from pg_class where relname = 'invitaciones_medico';
```
Expected: `relrowsecurity = true` y sin errores al describir la tabla.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260709_invitaciones_medico.sql
git commit -m "feat(onboarding): tabla invitaciones_medico (token propio + RLS service-role)"
```

---

### Task 2: Módulo de token y vigencia (lógica pura, TDD)

**Files:**
- Create: `src/features/onboarding/token.ts`
- Test: `src/features/onboarding/token.test.ts`

**Interfaces:**
- Produces:
  - `generarTokenInvitacion(): string` — 32 bytes aleatorios en base64url (43 chars, url-safe).
  - `invitacionVigente(estado: string, expiraEn: string, ahora: Date): boolean` — `true` solo si `estado === 'pendiente'` y `ahora < expiraEn`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/features/onboarding/token.test.ts
import { describe, it, expect } from 'vitest'
import { generarTokenInvitacion, invitacionVigente } from './token'

describe('generarTokenInvitacion', () => {
  it('genera un token url-safe de al menos 43 chars', () => {
    const t = generarTokenInvitacion()
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(t.length).toBeGreaterThanOrEqual(43)
  })

  it('genera tokens distintos en llamadas sucesivas', () => {
    const a = generarTokenInvitacion()
    const b = generarTokenInvitacion()
    expect(a).not.toBe(b)
  })
})

describe('invitacionVigente', () => {
  const ahora = new Date('2026-07-09T12:00:00.000Z')

  it('vigente si está pendiente y no venció', () => {
    expect(invitacionVigente('pendiente', '2026-07-09T13:00:00.000Z', ahora)).toBe(true)
  })

  it('no vigente si venció', () => {
    expect(invitacionVigente('pendiente', '2026-07-09T11:59:59.000Z', ahora)).toBe(false)
  })

  it('no vigente si el estado no es pendiente', () => {
    expect(invitacionVigente('completada', '2026-07-09T13:00:00.000Z', ahora)).toBe(false)
    expect(invitacionVigente('revocada', '2026-07-09T13:00:00.000Z', ahora)).toBe(false)
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- src/features/onboarding/token.test.ts`
Expected: FAIL con "Cannot find module './token'".

- [ ] **Step 3: Implementar el módulo**

```ts
// src/features/onboarding/token.ts
import { randomBytes } from 'crypto'

/** Token de invitación: 32 bytes aleatorios en base64url (url-safe, un solo uso). */
export function generarTokenInvitacion(): string {
  return randomBytes(32).toString('base64url')
}

/** ¿La invitación sigue usable? Solo si está pendiente y no venció. */
export function invitacionVigente(estado: string, expiraEn: string, ahora: Date): boolean {
  return estado === 'pendiente' && ahora.getTime() < new Date(expiraEn).getTime()
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- src/features/onboarding/token.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/onboarding/token.ts src/features/onboarding/token.test.ts
git commit -m "feat(onboarding): generación de token + chequeo de vigencia (puro, testeado)"
```

---

### Task 3: Schema Zod del formulario de alta (lógica pura, TDD)

**Files:**
- Create: `src/features/onboarding/types.ts`
- Test: `src/features/onboarding/types.test.ts`

**Interfaces:**
- Produces:
  - `altaMedicoSchema` — Zod object.
  - `type AltaMedicoInput = z.infer<typeof altaMedicoSchema>` con: `nombre, apellido, especialidad, matricula, cuit, telefono, email, numeroWhatsapp, password, passwordConfirm`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/features/onboarding/types.test.ts
import { describe, it, expect } from 'vitest'
import { altaMedicoSchema } from './types'

const base = {
  nombre: 'Juan', apellido: 'Moreno', especialidad: 'Cardiología',
  matricula: '1234', cuit: '20-12345678-9', telefono: '3834000000',
  email: 'Juan.Moreno@Mail.com', numeroWhatsapp: '+54 9 383 400 0000',
  password: 'medico2026', passwordConfirm: 'medico2026',
}

describe('altaMedicoSchema', () => {
  it('acepta un alta válida y normaliza el email a minúsculas', () => {
    const r = altaMedicoSchema.safeParse(base)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.email).toBe('juan.moreno@mail.com')
  })

  it('rechaza contraseña débil (menos de 8 o sin número)', () => {
    expect(altaMedicoSchema.safeParse({ ...base, password: 'corta1', passwordConfirm: 'corta1' }).success).toBe(false)
    expect(altaMedicoSchema.safeParse({ ...base, password: 'solotexto', passwordConfirm: 'solotexto' }).success).toBe(false)
  })

  it('rechaza si password y passwordConfirm no coinciden', () => {
    expect(altaMedicoSchema.safeParse({ ...base, passwordConfirm: 'otra12345' }).success).toBe(false)
  })

  it('rechaza email inválido', () => {
    expect(altaMedicoSchema.safeParse({ ...base, email: 'no-es-email' }).success).toBe(false)
  })

  it('rechaza número de WhatsApp con menos de 10 dígitos', () => {
    expect(altaMedicoSchema.safeParse({ ...base, numeroWhatsapp: '12345' }).success).toBe(false)
  })

  it('rechaza nombre o apellido vacío', () => {
    expect(altaMedicoSchema.safeParse({ ...base, nombre: '' }).success).toBe(false)
    expect(altaMedicoSchema.safeParse({ ...base, apellido: '  ' }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- src/features/onboarding/types.test.ts`
Expected: FAIL con "Cannot find module './types'".

- [ ] **Step 3: Implementar el schema**

```ts
// src/features/onboarding/types.ts
import { z } from 'zod'

// Contraseña: mínimo 8, con al menos una letra y un número (baseline usable para médicos).
const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'La contraseña debe incluir letras y números')

export const altaMedicoSchema = z
  .object({
    nombre: z.string().trim().min(1, 'Nombre requerido'),
    apellido: z.string().trim().min(1, 'Apellido requerido'),
    especialidad: z.string().trim().optional().default(''),
    matricula: z.string().trim().optional().default(''),
    cuit: z.string().trim().optional().default(''),
    telefono: z.string().trim().optional().default(''),
    email: z.string().trim().toLowerCase().pipe(z.string().email('Email inválido')),
    numeroWhatsapp: z
      .string()
      .trim()
      .min(8, 'Número de WhatsApp inválido')
      .refine((v) => v.replace(/\D/g, '').length >= 10, 'Número de WhatsApp inválido'),
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .refine((d) => d.password === d.passwordConfirm, {
    message: 'Las contraseñas no coinciden',
    path: ['passwordConfirm'],
  })

export type AltaMedicoInput = z.infer<typeof altaMedicoSchema>
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- src/features/onboarding/types.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/onboarding/types.ts src/features/onboarding/types.test.ts
git commit -m "feat(onboarding): schema Zod del alta de médico (password fuerte + confirm)"
```

---

### Task 4: Server actions de admin — generar / listar / revocar invitación

**Files:**
- Modify: `src/actions/admin-medicos.ts` (agregar 3 funciones al final, reutilizando `requireSuperadmin`, `createServiceClient`, `siteUrl`)
- Create: `src/features/onboarding/invitaciones-types.ts` (tipos compartidos con la UI)

**Interfaces:**
- Consumes: `requireSuperadmin()`, `createServiceClient()`, `siteUrl()`, `generarTokenInvitacion()` (Task 2).
- Produces:
  - `generarInvitacionMedico(nombreReferencia?: string): Promise<{ token: string; url: string } | { error: string }>`
  - `listarInvitaciones(): Promise<{ data: InvitacionFila[] } | { error: string }>`
  - `revocarInvitacion(id: string): Promise<{ ok: true } | { error: string }>`
  - `type InvitacionFila = { id: string; nombreReferencia: string | null; estado: string; vigente: boolean; url: string; creadaEn: string; medicoId: string | null }`

- [ ] **Step 1: Crear el tipo compartido**

```ts
// src/features/onboarding/invitaciones-types.ts
export interface InvitacionFila {
  id: string
  nombreReferencia: string | null
  estado: string
  vigente: boolean
  url: string
  creadaEn: string
  medicoId: string | null
}
```

- [ ] **Step 2: Agregar las 3 server actions en `admin-medicos.ts`**

Agregar los imports al tope del archivo (junto a los existentes):
```ts
import { generarTokenInvitacion, invitacionVigente } from '@/features/onboarding/token'
import type { InvitacionFila } from '@/features/onboarding/invitaciones-types'
```

Agregar al final del archivo:
```ts
/** Genera una invitación de alta para un médico. Devuelve el enlace copiable. */
export async function generarInvitacionMedico(
  nombreReferencia?: string
): Promise<{ token: string; url: string } | { error: string }> {
  const guard = await requireSuperadmin()
  if ('error' in guard) return guard

  const service = createServiceClient()
  const token = generarTokenInvitacion()
  const { error } = await service.from('invitaciones_medico').insert({
    token,
    estado: 'pendiente',
    nombre_referencia: nombreReferencia?.trim() || null,
    creada_por: guard.userId,
  })
  if (error) return { error: error.message }

  return { token, url: `${siteUrl()}/alta/${token}` }
}

/** Lista de invitaciones (para el panel admin). */
export async function listarInvitaciones(): Promise<{ data: InvitacionFila[] } | { error: string }> {
  const guard = await requireSuperadmin()
  if ('error' in guard) return guard

  const service = createServiceClient()
  const { data, error } = await service
    .from('invitaciones_medico')
    .select('id, token, estado, nombre_referencia, expira_en, created_at, medico_id')
    .order('created_at', { ascending: false })
  if (error) return { error: error.message }

  const ahora = new Date()
  const filas: InvitacionFila[] = (data ?? []).map((r) => ({
    id: r.id as string,
    nombreReferencia: (r.nombre_referencia as string | null) ?? null,
    estado: r.estado as string,
    vigente: invitacionVigente(r.estado as string, r.expira_en as string, ahora),
    url: `${siteUrl()}/alta/${r.token as string}`,
    creadaEn: r.created_at as string,
    medicoId: (r.medico_id as string | null) ?? null,
  }))
  return { data: filas }
}

/** Revoca una invitación pendiente. */
export async function revocarInvitacion(id: string): Promise<{ ok: true } | { error: string }> {
  const guard = await requireSuperadmin()
  if ('error' in guard) return guard

  const service = createServiceClient()
  const { error } = await service
    .from('invitaciones_medico')
    .update({ estado: 'revocada' })
    .eq('id', id)
    .eq('estado', 'pendiente')
  if (error) return { error: error.message }
  return { ok: true }
}
```

- [ ] **Step 3: Verificar tipos**

Run: `npm run typecheck`
Expected: sin errores nuevos en `admin-medicos.ts` ni `invitaciones-types.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/actions/admin-medicos.ts src/features/onboarding/invitaciones-types.ts
git commit -m "feat(onboarding): server actions admin generar/listar/revocar invitación"
```

---

### Task 5: Server action `completarInvitacionMedico` (el núcleo)

**Files:**
- Create: `src/actions/onboarding-medico.ts`

**Interfaces:**
- Consumes: `createServiceClient()`, `createClient()`, `siteUrl()`, `normalizeRecipient` (`@/lib/whatsapp/client`), `generarSlugBase`, `siguienteSlugLibre` (`@/features/admin/medicos/slug`), `invitacionVigente` (Task 2), `altaMedicoSchema`, `AltaMedicoInput` (Task 3). RPC `onboard_medico_cablear` y `uid_por_email` (existentes).
- Produces: `completarInvitacionMedico(token: string, input: AltaMedicoInput): Promise<{ error: string } | never>` — en éxito hace `redirect('/dashboard')` (no retorna); en error devuelve `{ error }`.

- [ ] **Step 1: Implementar la server action**

```ts
// src/actions/onboarding-medico.ts
'use server'

import { redirect } from 'next/navigation'
import { createServiceClient, createClient } from '@/lib/supabase/server'
import { normalizeRecipient } from '@/lib/whatsapp/client'
import { generarSlugBase, siguienteSlugLibre } from '@/features/admin/medicos/slug'
import { invitacionVigente } from '@/features/onboarding/token'
import { altaMedicoSchema, type AltaMedicoInput } from '@/features/onboarding/types'

/** Deriva un slug libre a partir de nombre/apellido, evitando colisiones. */
async function slugLibrePara(
  service: ReturnType<typeof createServiceClient>,
  nombre: string,
  apellido: string
): Promise<string> {
  const base = generarSlugBase(nombre, apellido)
  const { data } = await service
    .from('wa_asignaciones')
    .select('slug_publico')
    .ilike('slug_publico', `${base}%`)
  const tomados = (data ?? []).map((r) => r.slug_publico as string)
  return siguienteSlugLibre(base, tomados)
}

/**
 * El médico completa su invitación: valida el token, crea la cuenta con la
 * contraseña ya puesta (email_confirm=true, sin email frágil), cablea nodo/slug/
 * servicio, deja el arancel básico, marca la invitación completada e inicia sesión.
 */
export async function completarInvitacionMedico(
  token: string,
  input: AltaMedicoInput
): Promise<{ error: string } | never> {
  const service = createServiceClient()

  // 1) Token válido y vigente (autoridad = servidor).
  const { data: inv } = await service
    .from('invitaciones_medico')
    .select('id, estado, expira_en, email')
    .eq('token', token)
    .maybeSingle()
  if (!inv) return { error: 'Este enlace no es válido. Pedile uno nuevo a tu administrador.' }
  if (!invitacionVigente(inv.estado as string, inv.expira_en as string, new Date())) {
    return { error: 'Este enlace ya no es válido o expiró. Pedile uno nuevo a tu administrador.' }
  }

  // 2) Datos válidos.
  const parsed = altaMedicoSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data
  const numeroPersonal = normalizeRecipient(d.numeroWhatsapp)

  // 3) Crear la cuenta (o retomar un intento previo con el mismo email).
  const metadata = {
    nombre: d.nombre, apellido: d.apellido, rol: 'medico',
    especialidad: d.especialidad, matricula: d.matricula, cuit: d.cuit, telefono: d.telefono,
    numero_personal: numeroPersonal,
  }
  let medicoId: string
  const created = await service.auth.admin.createUser({
    email: d.email,
    password: d.password,
    email_confirm: true,
    user_metadata: metadata,
  })

  if (created.error) {
    const msg = created.error.message.toLowerCase()
    const emailDuplicado = msg.includes('already') || msg.includes('registered') || msg.includes('exists')
    if (!emailDuplicado) return { error: `No se pudo crear la cuenta: ${created.error.message}` }

    // Reintento idempotente: solo si ESTA invitación ya había reclamado este email
    // y la cuenta todavía no está cableada. Si no, es un email ajeno → rechazar.
    if ((inv.email as string | null) !== d.email) {
      return { error: 'Ese email ya tiene una cuenta. Iniciá sesión o recuperá tu contraseña.' }
    }
    const { data: uid } = await service.rpc('uid_por_email', { p_email: d.email })
    if (!uid) return { error: 'Ese email ya tiene una cuenta. Iniciá sesión o recuperá tu contraseña.' }
    const yaCableado = await service.from('wa_asignaciones').select('id').eq('medico_id', uid as string).maybeSingle()
    if (yaCableado.data) {
      return { error: 'Ese email ya tiene una cuenta activa. Iniciá sesión o recuperá tu contraseña.' }
    }
    medicoId = uid as string
  } else {
    medicoId = created.data.user.id
    // Reclamar el email en la invitación (guard del reintento idempotente).
    await service.from('invitaciones_medico').update({ email: d.email }).eq('id', inv.id as string)
  }

  // 4) Cablear nodo/slug/servicio (reutiliza la RPC existente).
  const slug = await slugLibrePara(service, d.nombre, d.apellido)
  const rpc = await service.rpc('onboard_medico_cablear', {
    p_medico_id: medicoId,
    p_nombre: d.nombre, p_apellido: d.apellido, p_especialidad: d.especialidad,
    p_matricula: d.matricula, p_cuit: d.cuit, p_telefono: d.telefono,
    p_slug: slug, p_numero_personal: numeroPersonal,
  })
  if (rpc.error) {
    // La invitación queda 'pendiente' → el médico puede reintentar el mismo enlace.
    if (rpc.error.message.includes('sin_cupo_nodos')) {
      return { error: 'No hay cupo disponible en este momento. Avisá a tu administrador.' }
    }
    return { error: `No se pudo completar el alta: ${rpc.error.message}` }
  }

  // 5) Arancel básico por defecto (service-role está exento del trigger de protección).
  await service.from('perfiles')
    .update({ categoria_arancel: 'medica', atiende_interior: false })
    .eq('id', medicoId)

  // 6) Marcar la invitación como completada.
  await service.from('invitaciones_medico')
    .update({ estado: 'completada', completada_en: new Date().toISOString(), medico_id: medicoId })
    .eq('id', inv.id as string)

  // 7) Iniciar sesión automáticamente (setea cookies vía SSR client) y al dashboard.
  const supabase = await createClient()
  const { error: eLogin } = await supabase.auth.signInWithPassword({ email: d.email, password: d.password })
  if (eLogin) redirect('/login?ok=cuenta_creada')
  redirect('/dashboard')
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npm run typecheck`
Expected: sin errores en `onboarding-medico.ts`.

- [ ] **Step 3: Verificar build (la server action y sus imports compilan bajo Next)**

Run: `npm run build`
Expected: build OK (o al menos sin errores en los módulos nuevos).

- [ ] **Step 4: Commit**

```bash
git add src/actions/onboarding-medico.ts
git commit -m "feat(onboarding): completarInvitacionMedico (createUser + cablear + auto-login idempotente)"
```

---

### Task 6: Página pública `/alta/[token]` + formulario

**Files:**
- Create: `src/app/alta/[token]/page.tsx` (server component)
- Create: `src/features/onboarding/components/FormAltaMedico.tsx` (client component)

**Interfaces:**
- Consumes: `createServiceClient()`, `invitacionVigente` (Task 2), `completarInvitacionMedico` (Task 5), `altaMedicoSchema` (Task 3).

- [ ] **Step 1: Página server que valida el token**

```tsx
// src/app/alta/[token]/page.tsx
import { createServiceClient } from '@/lib/supabase/server'
import { invitacionVigente } from '@/features/onboarding/token'
import { FormAltaMedico } from '@/features/onboarding/components/FormAltaMedico'

export const metadata = { title: 'Alta de médico | MediCuenta' }

function LinkInvalido() {
  return (
    <div className="mx-auto max-w-md p-8 text-center space-y-3">
      <h1 className="text-lg font-semibold">Enlace no válido</h1>
      <p className="text-sm text-muted-foreground">
        Este enlace ya no sirve o expiró. Pedile un enlace nuevo a tu administrador.
      </p>
    </div>
  )
}

export default async function AltaMedicoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const service = createServiceClient()
  const { data: inv } = await service
    .from('invitaciones_medico')
    .select('estado, expira_en')
    .eq('token', token)
    .maybeSingle()

  if (!inv || !invitacionVigente(inv.estado as string, inv.expira_en as string, new Date())) {
    return <LinkInvalido />
  }

  return (
    <div className="mx-auto max-w-md p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Creá tu cuenta de MediCuenta</h1>
        <p className="text-sm text-muted-foreground">Completá tus datos y definí tu contraseña.</p>
      </div>
      <FormAltaMedico token={token} />
    </div>
  )
}
```

- [ ] **Step 2: Formulario client**

```tsx
// src/features/onboarding/components/FormAltaMedico.tsx
'use client'

import { useState } from 'react'
import { altaMedicoSchema } from '@/features/onboarding/types'
import { completarInvitacionMedico } from '@/actions/onboarding-medico'

export function FormAltaMedico({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const input = 'w-full rounded-xl border border-border px-3 py-2'

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = new FormData(e.currentTarget)
    const raw = {
      nombre: String(form.get('nombre') ?? ''),
      apellido: String(form.get('apellido') ?? ''),
      especialidad: String(form.get('especialidad') ?? ''),
      matricula: String(form.get('matricula') ?? ''),
      cuit: String(form.get('cuit') ?? ''),
      telefono: String(form.get('telefono') ?? ''),
      email: String(form.get('email') ?? ''),
      numeroWhatsapp: String(form.get('numeroWhatsapp') ?? ''),
      password: String(form.get('password') ?? ''),
      passwordConfirm: String(form.get('passwordConfirm') ?? ''),
    }
    // Validación en cliente para feedback inmediato; la autoridad es el servidor.
    const parsed = altaMedicoSchema.safeParse(raw)
    if (!parsed.success) { setError(parsed.error.issues[0].message); return }

    setLoading(true)
    const r = await completarInvitacionMedico(token, parsed.data)
    // Si hay éxito, la action hace redirect y no retorna. Solo llegamos acá con error.
    setLoading(false)
    if (r && 'error' in r) setError(r.error)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <input name="nombre" required placeholder="Nombre" className={input} />
        <input name="apellido" required placeholder="Apellido" className={input} />
      </div>
      <input name="especialidad" placeholder="Especialidad" className={input} />
      <div className="grid grid-cols-2 gap-3">
        <input name="matricula" placeholder="Matrícula" className={input} />
        <input name="cuit" placeholder="CUIT" className={input} />
      </div>
      <input name="telefono" placeholder="Teléfono" className={input} />
      <input name="numeroWhatsapp" required placeholder="Número de WhatsApp (ej: +54 9 383 …)" className={input} />
      <input name="email" type="email" required placeholder="Email" className={input} />
      <input name="password" type="password" required placeholder="Contraseña (mín. 8, con letras y números)" className={input} />
      <input name="passwordConfirm" type="password" required placeholder="Repetí la contraseña" className={input} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button type="submit" disabled={loading} className="rounded-xl bg-primary text-primary-foreground px-4 py-2 disabled:opacity-50">
        {loading ? 'Creando tu cuenta…' : 'Crear mi cuenta'}
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Verificar que `/alta/[token]` está fuera de rutas protegidas**

Leer `src/lib/supabase/proxy.ts`. Confirmar que `/alta` NO está en la lista de paths protegidos (líneas ~39). Si el middleware la bloqueara, agregar `/alta` a las rutas públicas. `/c/[slug]` ya es público, mismo tratamiento.
Expected: `/alta/...` accesible sin sesión.

- [ ] **Step 4: Verificar tipos + build**

Run: `npm run typecheck && npm run build`
Expected: sin errores en los archivos nuevos.

- [ ] **Step 5: Commit**

```bash
git add src/app/alta/ src/features/onboarding/components/FormAltaMedico.tsx
git commit -m "feat(onboarding): página pública /alta/[token] + formulario de alta"
```

---

### Task 7: Panel de invitaciones en `/admin/medicos`

**Files:**
- Create: `src/features/admin/medicos/components/PanelInvitaciones.tsx` (client)
- Modify: `src/app/admin/medicos/page.tsx` (montar el panel + pasar invitaciones iniciales)

**Interfaces:**
- Consumes: `generarInvitacionMedico`, `listarInvitaciones`, `revocarInvitacion` (Task 4), `InvitacionFila` (Task 4), `QRCode` (`qrcode`).

- [ ] **Step 1: Componente del panel (generar + QR + lista + revocar)**

```tsx
// src/features/admin/medicos/components/PanelInvitaciones.tsx
'use client'

import { useState } from 'react'
import QRCode from 'qrcode'
import { generarInvitacionMedico, listarInvitaciones, revocarInvitacion } from '@/actions/admin-medicos'
import type { InvitacionFila } from '@/features/onboarding/invitaciones-types'

export function PanelInvitaciones({ inicial }: { inicial: InvitacionFila[] }) {
  const [filas, setFilas] = useState<InvitacionFila[]>(inicial)
  const [nombre, setNombre] = useState('')
  const [nuevaUrl, setNuevaUrl] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function refrescar() {
    const r = await listarInvitaciones()
    if ('data' in r) setFilas(r.data)
  }

  async function generar() {
    setError(null); setLoading(true)
    const r = await generarInvitacionMedico(nombre)
    setLoading(false)
    if ('error' in r) { setError(r.error); return }
    setNuevaUrl(r.url)
    setQr(await QRCode.toDataURL(r.url))
    setNombre('')
    await refrescar()
  }

  async function revocar(id: string) {
    await revocarInvitacion(id)
    await refrescar()
  }

  const input = 'rounded-xl border border-border px-3 py-2 text-sm'
  return (
    <div className="space-y-4 rounded-xl border border-border p-4">
      <h2 className="font-medium">Invitar médico por enlace</h2>
      <div className="flex flex-wrap gap-2">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Referencia (ej: Dr. Moreno)" className={input} />
        <button onClick={generar} disabled={loading} className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50">
          {loading ? 'Generando…' : 'Generar enlace'}
        </button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {nuevaUrl && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className="text-sm break-all"><a href={nuevaUrl} className="text-primary underline">{nuevaUrl}</a></p>
          <button onClick={() => navigator.clipboard.writeText(nuevaUrl)} className="rounded-lg border border-border px-3 py-1 text-sm">Copiar enlace</button>
          {qr && <img src={qr} alt="QR del enlace" className="w-40 h-40" />}
          <p className="text-xs text-muted-foreground">Mandale este enlace al médico por WhatsApp. Vence en 72 hs.</p>
        </div>
      )}

      {filas.length > 0 && (
        <ul className="divide-y divide-border text-sm">
          {filas.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 py-2">
              <span>
                {f.nombreReferencia || '(sin referencia)'} · <span className="text-muted-foreground">{f.estado}{f.estado === 'pendiente' && !f.vigente ? ' (vencida)' : ''}</span>
              </span>
              <span className="flex gap-2">
                {f.estado === 'pendiente' && f.vigente && (
                  <>
                    <button onClick={() => navigator.clipboard.writeText(f.url)} className="rounded-lg border border-border px-2 py-1 text-xs">Copiar</button>
                    <button onClick={() => revocar(f.id)} className="rounded-lg border border-border px-2 py-1 text-xs text-destructive">Revocar</button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Montar el panel en la página de médicos**

```tsx
// src/app/admin/medicos/page.tsx
import Link from 'next/link'
import { listarMedicos, listarInvitaciones } from '@/actions/admin-medicos'
import { ListaMedicos } from '@/features/admin/medicos/components/ListaMedicos'
import { PanelInvitaciones } from '@/features/admin/medicos/components/PanelInvitaciones'

export const metadata = { title: 'Médicos | MediCuenta' }

export default async function AdminMedicosPage() {
  const [resMed, resInv] = await Promise.all([listarMedicos(), listarInvitaciones()])
  const medicos = 'data' in resMed ? resMed.data : []
  const error = 'error' in resMed ? resMed.error : null
  const invitaciones = 'data' in resInv ? resInv.data : []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Médicos</h1>
        <Link href="/admin/medicos/nuevo" className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium">
          ＋ Nuevo médico (manual)
        </Link>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <PanelInvitaciones inicial={invitaciones} />
      <ListaMedicos medicos={medicos} />
    </div>
  )
}
```

- [ ] **Step 3: Verificar tipos + build**

Run: `npm run typecheck && npm run build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/features/admin/medicos/components/PanelInvitaciones.tsx src/app/admin/medicos/page.tsx
git commit -m "feat(onboarding): panel de invitaciones en /admin/medicos (generar + QR + revocar)"
```

---

### Task 8: Robustez del reset de contraseña + SMTP de Resend (verificación)

**Files:**
- Read-only / config: `src/actions/auth.ts`, plantillas de Auth en Supabase, `src/app/activar/page.tsx`.

**Interfaces:** ninguna nueva; es verificación + fix si hace falta.

- [ ] **Step 1: Verificar que el SMTP de Resend está conectado en Supabase Auth**

Preguntar a Héctor o revisar el panel de Supabase (Auth → SMTP Settings). Confirmar host `smtp.resend.com`, sender `noreply@seismilesia.com`. Si NO está, conectarlo (es lo que evita que los emails de recovery se cuelguen por rate-limit del SMTP default).
Expected: SMTP custom activo.

- [ ] **Step 2: Verificar que la plantilla de recovery apunta a `/activar` (POST, anti-prefetch)**

Revisar en Supabase Auth → Email Templates → "Reset Password" que el link use el patrón POST hacia `/activar` (igual que el invite), no un GET directo. `resetPassword` en `src/actions/auth.ts:59` ya manda `redirectTo` a `/api/auth/callback?next=/update-password`; confirmar que `/api/auth/callback` y `/activar` manejan el `token_hash` sin quemarse con el prefetch.
Expected: el flujo de recovery usa el mismo camino blindado que el invite.

- [ ] **Step 3: Probar el reset de contraseña de punta a punta**

Con una cuenta de prueba: pedir reset desde `/forgot-password` → confirmar que llega el email por Resend → abrir el link → cambiar la contraseña → loguear con la nueva.
Expected: sin "enlace expirado" por prefetch; cambio exitoso.

- [ ] **Step 4: Documentar el resultado**

Si hubo algún ajuste de config/plantilla, anotarlo en la memoria del proyecto (archivo de emails/Resend). Si estaba todo OK, dejar constancia de que se verificó el 2026-07-09.

---

### Task 9: E2E manual del alta + gate final

**Files:** ninguno (verificación).

- [ ] **Step 1: Correr toda la suite de tests**

Run: `npm test`
Expected: PASS (incluye los nuevos `token.test.ts` y `types.test.ts`).

- [ ] **Step 2: Typecheck + build limpios**

Run: `npm run typecheck && npm run build`
Expected: sin errores.

- [ ] **Step 3: E2E manual del camino feliz**

1. Como superadmin, entrar a `/admin/medicos` → generar invitación "Dr. Prueba" → copiar el enlace.
2. En una sesión nueva (o incógnito, sin login), abrir `/alta/<token>`.
3. Completar datos + WhatsApp + email + contraseña → enviar.
4. Verificar que queda logueado y cae en `/dashboard`.
5. Volver como superadmin a `/admin/medicos`: el médico aparece en la lista, con nodo/slug asignados, y la invitación figura `completada`.
6. En `/admin/medicos/[id]/editar`, confirmar que `categoria_arancel = medica` y promoverlo al tier "full" que corresponda.

- [ ] **Step 4: E2E de los caminos de error**

1. Reusar un enlace ya `completada` → debe mostrar "Enlace no válido".
2. Revocar una invitación pendiente y abrir su enlace → "Enlace no válido".
3. Intentar el alta con un email que ya existe como médico → mensaje claro "ese email ya tiene cuenta".

- [ ] **Step 5: Actualizar memoria del proyecto**

Anotar en `.claude/memory` (o el memory-manager del proyecto) que el onboarding por autoservicio (invitación) quedó implementado, con el plan de fase futura (enlace abierto + cola de aprobación + trial 14 días).

---

## Self-Review (cobertura del spec)

- §3 Fases → Task 1 modela `estado` extensible (a futuro `en_revision`). ✅
- §4 Principio (desacoplar entrega/verificación) → Task 5: `admin.createUser` + `email_confirm:true`, sin email en el alta. ✅
- §5.1 Tabla → Task 1. ✅
- §5.2 Generar invitación + QR → Tasks 4 y 7. ✅
- §5.3 Página pública + estados inválidos → Task 6. ✅
- §5.4 Completar (createUser, cablear, arancel básico, marcar, auto-login) → Task 5. ✅
- §5.5 Reset robusto + SMTP → Task 8. ✅
- §6 Seguridad (token 256-bit, estado server-side, password fuerte, no toca arancel/es_superadmin) → Tasks 2, 3, 5. ✅
- §7 Errores + idempotencia → Task 5 (reintento por email reclamado) + Task 9 (E2E error). ✅
- §8 Testing → Tasks 2, 3 (unit) + Task 9 (E2E). ✅
- §10 Archivos → cubiertos por Tasks 1–8. ✅

**Nota de alcance:** la cola de aprobación + trial de 14 días (fase futura) NO están en este plan, por diseño.

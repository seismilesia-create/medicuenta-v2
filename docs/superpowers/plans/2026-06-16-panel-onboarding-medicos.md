# Panel de onboarding de médicos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un panel admin (solo `es_superadmin`) que onboardee un médico de punta a punta — cuenta + identidad + servicio "Consulta" + cableado WhatsApp (nodo/slug/número) — desde un formulario y un botón, eliminando el SQL/scripts manuales.

**Architecture:** UI bajo `/admin/medicos` (gateada por el layout admin existente). Una server action `onboardMedico` orquesta: valida (Zod) → verifica superadmin → invita la cuenta (`inviteUserByEmail`) → llama una **RPC Postgres transaccional** (`onboard_medico_cablear`) que hace las escrituras de datos atómicas (perfil + servicio + asignación + recompute del nodo). El reintento idempotente lee la "memoria del intento" desde `raw_user_meta_data`. La invitación aterriza en un callback nuevo que hace el code-exchange y reusa la página `/update-password` existente.

**Tech Stack:** Next.js 16 App Router (server actions + route handlers), TypeScript, Supabase (Auth admin API + Postgres RPC + RLS), Zod, Vitest (solo helpers puros), `qrcode`.

**Spec de referencia:** `docs/superpowers/specs/2026-06-16-panel-onboarding-medicos-design.md`

---

## Prerequisito operativo (Resend SMTP en Supabase Auth — hacer ANTES del E2E de Task 8)

**Estado actual:** el proyecto YA usa Resend para el digest del dueño (`src/lib/email/resend.ts`, vía `RESEND_API_KEY` + API REST, remitente sandbox `onboarding@resend.dev`). Eso es envío directo de la app, **NO** el SMTP de Auth.

**Lo que falta:** apuntar el SMTP de **Supabase Auth** a Resend, para que los emails de *invitación/recovery* salgan por ahí (el default de Supabase está capado a **2 correos/hora**). Config de dashboard (no código):
- Supabase → Project Settings → Authentication → SMTP Settings → Enable custom SMTP:
  - **Host:** `smtp.resend.com` · **Port:** `465` · **User:** `resend` · **Password:** `<RESEND_API_KEY>` (la misma que ya usa la app)
  - **Sender email:** `onboarding@resend.dev` (sandbox) o `noreply@<dominio-verificado>` · **Sender name:** `MediCuenta`
- **Límite del sandbox:** sin dominio verificado, Resend solo entrega al email de la cuenta del dueño → alcanza para el E2E (Task 8, invitándote a vos mismo). Para invitar médicos reales a sus casillas → verificar un dominio en Resend y setear el sender. Sin esto, Tasks 1–7 igual se desarrollan y testean.

## Decisiones de diseño (refinan el spec con lo hallado en el código real)

1. **Atomicidad vía RPC, no en TS.** Las 4 escrituras (perfil, servicio, asignación, `medicos_activos`) van en una función Postgres `SECURITY DEFINER` con `SELECT … FOR UPDATE` para elegir nodo sin carrera. El spec §6.3 ponía "elegir nodo" en el orquestador TS; lo movemos a la RPC por race-safety. Los `UNIQUE` de la DB son la red final (spec §8).
2. **`medicos_activos` se recomputa por `count(*)`** (no incremento) → evita drift (spec §11 dejaba elegir).
3. **`numero_personal` se guarda normalizado con `normalizeRecipient`** (reuso, no helper nuevo). La clasificación `esRemitenteMedico` ya normaliza ambos lados, así que es robusta (verificado en `src/lib/whatsapp/clasificar.ts`).
4. **El invite pasa `data: { nombre, apellido, rol, …resto }`.** El trigger `handle_new_user()` lee `nombre`/`apellido`/`rol` (no `full_name`). El resto de la identidad queda en `raw_user_meta_data` como **memoria del intento** → `reintentarCableado` la relee sin re-tipear.
5. **Callback de auth nuevo** (`/api/auth/callback`) que hace `exchangeCodeForSession` y redirige a `/update-password` (que ya existe y reusa su form). El repo no tenía callback handler.
6. **TDD solo en funciones puras** (patrón del repo). `onboardMedico`/RPC se validan con `execute_sql` directo + E2E manual.
7. **URL base = `PUBLIC_BASE_URL`** (no `NEXT_PUBLIC_SITE_URL`, que no está seteada en este proyecto). El link `/c/<slug>` y el `redirectTo` se arman **server-side**; el cliente recibe el link ya armado (no usa env vars de URL).

## File Structure

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `src/features/admin/medicos/types.ts` | Zod schema `onboardMedicoSchema` + tipos `OnboardMedicoInput`, `MedicoFila` | Crear |
| `src/features/admin/medicos/slug.ts` | `generarSlugBase`, `siguienteSlugLibre` (puros) | Crear |
| `src/features/admin/medicos/slug.test.ts` | Tests de los helpers de slug | Crear |
| `supabase/migrations/20260616_onboard_medico.sql` | RPC `onboard_medico_cablear` + `superadmin_listar_medicos` | Crear |
| `src/actions/admin-medicos.ts` | `onboardMedico`, `reintentarCableado`, `listarMedicos`, `chequearSlugDisponible` | Crear |
| `src/app/api/auth/callback/route.ts` | Code-exchange de invitación/recovery | Crear |
| `src/app/admin/medicos/page.tsx` | Lista de médicos (server component) | Crear |
| `src/features/admin/medicos/components/ListaMedicos.tsx` | Tabla + copiar link + QR + reintentar (client) | Crear |
| `src/app/admin/medicos/nuevo/page.tsx` | Shell server del formulario | Crear |
| `src/features/admin/medicos/components/FormNuevoMedico.tsx` | Form + check slug en vivo + resultado link/QR (client) | Crear |
| `src/app/admin/page.tsx` | Agregar link "Médicos" al panel | Modificar |

---

## Task 1: Tipos y validación (Zod)

**Files:**
- Create: `src/features/admin/medicos/types.ts`

- [ ] **Step 1: Escribir el schema y los tipos**

```typescript
// src/features/admin/medicos/types.ts
import { z } from 'zod'

// El slug público: minúsculas, números y guiones (formato /c/<slug>).
const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const onboardMedicoSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.string().email('Email inválido')),
  nombre: z.string().trim().min(1, 'Nombre requerido'),
  apellido: z.string().trim().min(1, 'Apellido requerido'),
  especialidad: z.string().trim().optional().default(''),
  matricula: z.string().trim().optional().default(''),
  cuit: z.string().trim().optional().default(''),
  telefono: z.string().trim().optional().default(''),
  // Número de WhatsApp del médico, dígitos (puede venir con +, espacios o guiones).
  numeroWhatsapp: z
    .string()
    .trim()
    .min(8, 'Número de WhatsApp inválido')
    .refine((v) => v.replace(/\D/g, '').length >= 10, 'Número de WhatsApp inválido'),
  slug: z.string().trim().regex(slugRegex, 'Slug inválido (solo minúsculas, números y guiones)'),
})

export type OnboardMedicoInput = z.infer<typeof onboardMedicoSchema>

export interface MedicoFila {
  id: string
  nombre: string | null
  apellido: string | null
  especialidad: string | null
  email: string | null
  slug: string | null
  link: string | null
  cableadoActivo: boolean
}

export interface OnboardMedicoResult {
  slug: string
  link: string
  medicoId: string
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npm run typecheck`
Expected: PASS (sin errores en `src/features/admin/medicos/types.ts`).

- [ ] **Step 3: Commit**

```bash
git add src/features/admin/medicos/types.ts
git commit -m "feat(onboarding): schema Zod y tipos del panel de médicos"
```

---

## Task 2: Helpers de slug (TDD puro)

**Files:**
- Create: `src/features/admin/medicos/slug.ts`
- Test: `src/features/admin/medicos/slug.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// src/features/admin/medicos/slug.test.ts
import { describe, it, expect } from 'vitest'
import { generarSlugBase, siguienteSlugLibre } from './slug'

describe('generarSlugBase', () => {
  it('usa el apellido, en minúsculas y sin acentos', () => {
    expect(generarSlugBase('Juan', 'Martínez')).toBe('dr-martinez')
  })
  it('colapsa espacios y caracteres no alfanuméricos en guiones', () => {
    expect(generarSlugBase('Ana', 'Di Lorenzo')).toBe('dr-di-lorenzo')
  })
  it('cae al nombre si no hay apellido', () => {
    expect(generarSlugBase('House', '')).toBe('dr-house')
  })
})

describe('siguienteSlugLibre', () => {
  it('devuelve la base si está libre', () => {
    expect(siguienteSlugLibre('dr-martinez', [])).toBe('dr-martinez')
  })
  it('agrega sufijo numérico si está tomada', () => {
    expect(siguienteSlugLibre('dr-martinez', ['dr-martinez'])).toBe('dr-martinez-2')
  })
  it('salta sufijos tomados', () => {
    expect(siguienteSlugLibre('dr-martinez', ['dr-martinez', 'dr-martinez-2'])).toBe('dr-martinez-3')
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/features/admin/medicos/slug.test.ts`
Expected: FAIL con "Failed to resolve import './slug'" o "generarSlugBase is not a function".

- [ ] **Step 3: Implementar los helpers**

```typescript
// src/features/admin/medicos/slug.ts

/** Normaliza un texto a un fragmento de slug: sin acentos, minúsculas, guiones. */
function aFragmento(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Slug base a partir del nombre. Prefiere apellido; cae al nombre si no hay. */
export function generarSlugBase(nombre: string, apellido: string): string {
  const ape = aFragmento(apellido)
  if (ape) return `dr-${ape}`
  return `dr-${aFragmento(nombre)}`
}

/** Primer slug libre: la base si no está tomada, si no base-2, base-3, … */
export function siguienteSlugLibre(base: string, tomados: string[]): string {
  const set = new Set(tomados)
  if (!set.has(base)) return base
  let i = 2
  while (set.has(`${base}-${i}`)) i++
  return `${base}-${i}`
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run src/features/admin/medicos/slug.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/medicos/slug.ts src/features/admin/medicos/slug.test.ts
git commit -m "feat(onboarding): helpers de slug con tests"
```

---

## Task 3: RPC de cableado atómico (migración SQL)

**Files:**
- Create: `supabase/migrations/20260616_onboard_medico.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/20260616_onboard_medico.sql
-- Panel de onboarding de médicos: cableado atómico + listado para el panel admin.

-- 1) Cableado transaccional e idempotente. Lo llama la server action onboardMedico
--    (service-role) DESPUÉS de crear la cuenta con inviteUserByEmail.
--    Hace: identidad del perfil + servicio "Consulta" + asignación de nodo/slug/número
--    + recompute de medicos_activos. Re-ejecutable (reintentarCableado) sin duplicar.
create or replace function public.onboard_medico_cablear(
  p_medico_id      uuid,
  p_nombre         text,
  p_apellido       text,
  p_especialidad   text,
  p_matricula      text,
  p_cuit           text,
  p_telefono       text,
  p_slug           text,
  p_numero_personal text,
  p_servicio_nombre text default 'Consulta',
  p_duracion_min    int  default 30
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nodo_id uuid;
  v_numero_nodo text;
begin
  -- Identidad (idempotente). El perfil ya lo creó el trigger handle_new_user.
  update perfiles set
    nombre       = p_nombre,
    apellido     = p_apellido,
    especialidad = nullif(p_especialidad, ''),
    matricula    = nullif(p_matricula, ''),
    cuit         = nullif(p_cuit, ''),
    telefono     = nullif(p_telefono, ''),
    rol          = 'medico'
  where id = p_medico_id;

  if not found then
    raise exception 'perfil_inexistente' using errcode = 'P0002';
  end if;

  -- Servicio "Consulta" (idempotente por UNIQUE(medico_id, nombre)).
  insert into wa_servicios (medico_id, nombre, duracion_min, activo)
  values (p_medico_id, p_servicio_nombre, p_duracion_min, true)
  on conflict (medico_id, nombre) do update set activo = true;

  -- Asignación: si el médico ya tiene una (UNIQUE medico_id), reusamos su nodo.
  select nodo_id into v_nodo_id from wa_asignaciones where medico_id = p_medico_id;

  if v_nodo_id is null then
    -- Elegir nodo activo con cupo, con lock para evitar carrera entre onboardings.
    select id into v_nodo_id
    from wa_nodos
    where estado = 'activo' and medicos_activos < capacidad_max
    order by medicos_activos asc, created_at asc
    limit 1
    for update;

    if v_nodo_id is null then
      raise exception 'sin_cupo_nodos' using errcode = 'P0001';
    end if;

    insert into wa_asignaciones (medico_id, nodo_id, slug_publico, numero_personal, activo)
    values (p_medico_id, v_nodo_id, p_slug, p_numero_personal, true);
  end if;

  -- Recompute de medicos_activos (evita drift).
  update wa_nodos n set medicos_activos = (
    select count(*) from wa_asignaciones a where a.nodo_id = n.id and a.activo
  ) where n.id = v_nodo_id;

  select numero_whatsapp into v_numero_nodo from wa_nodos where id = v_nodo_id;

  return jsonb_build_object('nodo_id', v_nodo_id, 'slug', p_slug, 'numero_nodo', v_numero_nodo);
end;
$$;

-- 2) Listado para el panel (perfil + estado de cableado). SECURITY DEFINER porque
--    cruza perfiles ⨝ auth.users ⨝ wa_asignaciones; la autorización (es_superadmin)
--    la hace la server action ANTES de llamarla (mismo patrón que superadmin_metricas_medicos).
create or replace function public.superadmin_listar_medicos()
returns table (
  id uuid,
  nombre text,
  apellido text,
  especialidad text,
  email text,
  slug_publico text,
  cableado_activo boolean
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.nombre,
    p.apellido,
    p.especialidad,
    u.email::text,
    a.slug_publico,
    coalesce(a.activo, false) as cableado_activo
  from perfiles p
  join auth.users u on u.id = p.id
  left join wa_asignaciones a on a.medico_id = p.id and a.activo
  where p.rol = 'medico'
  order by p.apellido nulls last, p.nombre nulls last;
$$;
```

- [ ] **Step 2: Aplicar la migración**

Usar el MCP de Supabase: `apply_migration` con `name: "onboard_medico"` y el SQL de arriba.
Expected: aplicada sin error.

- [ ] **Step 3: Verificar las funciones con SQL directo**

Usar el MCP `execute_sql`:
```sql
select proname from pg_proc
where proname in ('onboard_medico_cablear', 'superadmin_listar_medicos');
```
Expected: 2 filas. Y `select * from superadmin_listar_medicos();` devuelve filas (hoy probablemente 0 médicos `rol='medico'`, pero NO error).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260616_onboard_medico.sql
git commit -m "feat(onboarding): RPC de cableado atómico + listado de médicos"
```

---

## Task 4: Server actions

**Files:**
- Create: `src/actions/admin-medicos.ts`

- [ ] **Step 1: Escribir las actions**

```typescript
// src/actions/admin-medicos.ts
'use server'

import { resolverSuperadmin } from '@/features/admin/access/superadmin'
import { createServiceClient } from '@/lib/supabase/server'
import { normalizeRecipient } from '@/lib/whatsapp/client'
import { onboardMedicoSchema, type OnboardMedicoInput, type MedicoFila, type OnboardMedicoResult } from '@/features/admin/medicos/types'

function siteUrl(): string {
  // El proyecto usa PUBLIC_BASE_URL (no NEXT_PUBLIC_SITE_URL) para la URL pública server-side.
  return process.env.PUBLIC_BASE_URL || 'http://localhost:3000'
}

/** Verifica superadmin y devuelve null+error si no lo es. */
async function requireSuperadmin(): Promise<{ userId: string } | { error: string }> {
  const sa = await resolverSuperadmin()
  if (!sa) return { error: 'No autorizado' }
  return { userId: sa.userId }
}

/** Lista de médicos con su estado de cableado (para /admin/medicos). */
export async function listarMedicos(): Promise<{ data: MedicoFila[] } | { error: string }> {
  const guard = await requireSuperadmin()
  if ('error' in guard) return guard

  const service = createServiceClient()
  const { data, error } = await service.rpc('superadmin_listar_medicos')
  if (error) return { error: error.message }

  const filas: MedicoFila[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    nombre: (r.nombre as string | null) ?? null,
    apellido: (r.apellido as string | null) ?? null,
    especialidad: (r.especialidad as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    slug: (r.slug_publico as string | null) ?? null,
    link: r.slug_publico ? `${siteUrl()}/c/${r.slug_publico as string}` : null,
    cableadoActivo: (r.cableado_activo as boolean | null) ?? false,
  }))
  return { data: filas }
}

/** ¿El slug está libre? (para el check en vivo del formulario) */
export async function chequearSlugDisponible(slug: string): Promise<{ disponible: boolean } | { error: string }> {
  const guard = await requireSuperadmin()
  if ('error' in guard) return guard

  const service = createServiceClient()
  const { data, error } = await service
    .from('wa_asignaciones')
    .select('id', { head: true, count: 'exact' })
    .eq('slug_publico', slug)
  if (error) return { error: error.message }
  return { disponible: ((data as unknown as { length?: number })?.length ?? 0) === 0 }
}

/** Traduce los errores de la RPC a mensajes para el admin. */
function traducirErrorCableado(message: string): string {
  if (message.includes('sin_cupo_nodos')) return 'No hay nodos con cupo. Hay que registrar un nodo nuevo.'
  if (message.includes('23505') || message.toLowerCase().includes('duplicate')) return 'Ese slug se usó recién, probá otro.'
  if (message.includes('perfil_inexistente')) return 'La cuenta se creó pero el perfil no está listo todavía. Reintentá el cableado.'
  return message
}

/** Onboarding completo: cuenta + identidad + servicio + cableado WhatsApp. */
export async function onboardMedico(input: OnboardMedicoInput): Promise<OnboardMedicoResult | { error: string }> {
  const guard = await requireSuperadmin()
  if ('error' in guard) return guard

  const parsed = onboardMedicoSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data

  const service = createServiceClient()

  // Pre-check de slug (UX; la autoridad es el UNIQUE de la DB).
  const yaUsado = await service.from('wa_asignaciones').select('id').eq('slug_publico', d.slug).maybeSingle()
  if (yaUsado.data) return { error: 'Ese slug ya está en uso, elegí otro.' }

  const numeroPersonal = normalizeRecipient(d.numeroWhatsapp)

  // Crear la cuenta + invitar. Pasamos TODA la identidad en data: el trigger lee
  // nombre/apellido/rol; el resto queda como "memoria del intento" para reintentar.
  const redirectTo = `${siteUrl()}/api/auth/callback?next=/update-password`
  const invited = await service.auth.admin.inviteUserByEmail(d.email, {
    data: {
      nombre: d.nombre,
      apellido: d.apellido,
      rol: 'medico',
      especialidad: d.especialidad,
      matricula: d.matricula,
      cuit: d.cuit,
      telefono: d.telefono,
      numero_personal: numeroPersonal,
      slug: d.slug,
    },
    redirectTo,
  })
  if (invited.error) return { error: `No se pudo invitar: ${invited.error.message}` }
  const medicoId = invited.data.user.id

  // Cableado atómico.
  const rpc = await service.rpc('onboard_medico_cablear', {
    p_medico_id: medicoId,
    p_nombre: d.nombre,
    p_apellido: d.apellido,
    p_especialidad: d.especialidad,
    p_matricula: d.matricula,
    p_cuit: d.cuit,
    p_telefono: d.telefono,
    p_slug: d.slug,
    p_numero_personal: numeroPersonal,
  })
  if (rpc.error) return { error: traducirErrorCableado(rpc.error.message) }

  return { slug: d.slug, link: `${siteUrl()}/c/${d.slug}`, medicoId }
}

/** Reintento idempotente del cableado: relee la "memoria del intento" de raw_user_meta_data. */
export async function reintentarCableado(medicoId: string): Promise<OnboardMedicoResult | { error: string }> {
  const guard = await requireSuperadmin()
  if ('error' in guard) return guard

  const service = createServiceClient()
  const u = await service.auth.admin.getUserById(medicoId)
  if (u.error || !u.data.user) return { error: 'No se encontró la cuenta del médico.' }

  const m = (u.data.user.user_metadata ?? {}) as Record<string, string>
  if (!m.slug || !m.numero_personal) return { error: 'Faltan datos del intento original; cargá el médico de nuevo.' }

  const rpc = await service.rpc('onboard_medico_cablear', {
    p_medico_id: medicoId,
    p_nombre: m.nombre ?? '',
    p_apellido: m.apellido ?? '',
    p_especialidad: m.especialidad ?? '',
    p_matricula: m.matricula ?? '',
    p_cuit: m.cuit ?? '',
    p_telefono: m.telefono ?? '',
    p_slug: m.slug,
    p_numero_personal: m.numero_personal,
  })
  if (rpc.error) return { error: traducirErrorCableado(rpc.error.message) }

  return { slug: m.slug, link: `${siteUrl()}/c/${m.slug}`, medicoId }
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npm run typecheck`
Expected: PASS.

> Nota: `chequearSlugDisponible` usa `head: true, count: 'exact'` — si el tipo del retorno de Supabase no encaja con `.length`, ajustá a leer `count`. Verificalo en el typecheck y, si hace falta, cambiá la última línea por `return { disponible: (count ?? 0) === 0 }` desestructurando `{ count }` del resultado.

- [ ] **Step 3: Commit**

```bash
git add src/actions/admin-medicos.ts
git commit -m "feat(onboarding): server actions onboardMedico/reintentar/listar/chequearSlug"
```

---

## Task 5: Callback de invitación (code-exchange)

**Files:**
- Create: `src/app/api/auth/callback/route.ts`

- [ ] **Step 1: Escribir el route handler**

```typescript
// src/app/api/auth/callback/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Aterrizaje de los links de Supabase (invitación de médico, recovery de contraseña).
// Intercambia el ?code= por sesión (deja la cookie) y redirige a ?next (default /update-password).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/update-password'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Sin code o exchange fallido → a login con flag de error.
  return NextResponse.redirect(`${origin}/login?error=enlace_invalido`)
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Verificar que la ruta responde (redirige sin code)**

Run (con `npm run dev` corriendo): `curl -i "http://localhost:3000/api/auth/callback"`
Expected: `HTTP/1.1 307` (o 302) con `location: /login?error=enlace_invalido`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/auth/callback/route.ts
git commit -m "feat(onboarding): callback de auth para invitacion/recovery"
```

---

## Task 6: UI — Lista de médicos

**Files:**
- Create: `src/app/admin/medicos/page.tsx`
- Create: `src/features/admin/medicos/components/ListaMedicos.tsx`

- [ ] **Step 1: Escribir la page (server component)**

```tsx
// src/app/admin/medicos/page.tsx
import Link from 'next/link'
import { listarMedicos } from '@/actions/admin-medicos'
import { ListaMedicos } from '@/features/admin/medicos/components/ListaMedicos'

export const metadata = { title: 'Médicos | MediCuenta' }

export default async function AdminMedicosPage() {
  const res = await listarMedicos()
  const medicos = 'data' in res ? res.data : []
  const error = 'error' in res ? res.error : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Médicos</h1>
        <Link href="/admin/medicos/nuevo" className="rounded-xl bg-primary text-white px-4 py-2 text-sm font-medium">
          ＋ Nuevo médico
        </Link>
      </div>
      {error && <p className="text-sm text-error-700">{error}</p>}
      <ListaMedicos medicos={medicos} />
    </div>
  )
}
```

- [ ] **Step 2: Escribir el componente cliente (tabla + acciones)**

```tsx
// src/features/admin/medicos/components/ListaMedicos.tsx
'use client'

import { useState } from 'react'
import { reintentarCableado } from '@/actions/admin-medicos'
import type { MedicoFila } from '@/features/admin/medicos/types'

export function ListaMedicos({ medicos }: { medicos: MedicoFila[] }) {
  const [msg, setMsg] = useState<string | null>(null)

  if (medicos.length === 0) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">Todavía no hay médicos. Cargá el primero con “Nuevo médico”.</p>
  }

  async function onReintentar(id: string) {
    setMsg(null)
    const r = await reintentarCableado(id)
    setMsg('error' in r ? r.error : 'Cableado completado. Recargá la lista.')
  }

  return (
    <div className="space-y-3">
      {msg && <p className="text-sm">{msg}</p>}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="text-left text-[var(--color-muted-foreground)]">
            <tr>
              <th className="p-3">Médico</th>
              <th className="p-3">Email</th>
              <th className="p-3">Link</th>
              <th className="p-3">Estado</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {medicos.map((m) => {
              const nombre = [m.nombre, m.apellido].filter(Boolean).join(' ') || '(sin nombre)'
              const link = m.link
              return (
                <tr key={m.id} className="border-t border-border">
                  <td className="p-3">
                    <div className="font-medium">{nombre}</div>
                    {m.especialidad && <div className="text-xs text-[var(--color-muted-foreground)]">{m.especialidad}</div>}
                  </td>
                  <td className="p-3">{m.email}</td>
                  <td className="p-3">
                    {link ? (
                      <button onClick={() => { navigator.clipboard.writeText(link); setMsg('Link copiado.') }} className="text-primary underline">
                        Copiar
                      </button>
                    ) : '—'}
                  </td>
                  <td className="p-3">{m.cableadoActivo ? '✅ Cableado' : '⏳ Pendiente'}</td>
                  <td className="p-3 text-right">
                    {!m.cableadoActivo && (
                      <button onClick={() => onReintentar(m.id)} className="rounded-lg border border-border px-3 py-1">
                        Reintentar
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/medicos/page.tsx src/features/admin/medicos/components/ListaMedicos.tsx
git commit -m "feat(onboarding): lista de medicos en /admin/medicos"
```

---

## Task 7: UI — Formulario "Nuevo médico"

**Files:**
- Create: `src/app/admin/medicos/nuevo/page.tsx`
- Create: `src/features/admin/medicos/components/FormNuevoMedico.tsx`
- Modify: `package.json` (dependencia `qrcode`)

- [ ] **Step 1: Instalar `qrcode` (para el QR del link)**

Run: `npm install qrcode && npm install -D @types/qrcode`
Expected: instala sin error.

- [ ] **Step 2: Escribir la page shell (server)**

```tsx
// src/app/admin/medicos/nuevo/page.tsx
import { FormNuevoMedico } from '@/features/admin/medicos/components/FormNuevoMedico'

export const metadata = { title: 'Nuevo médico | MediCuenta' }

export default function NuevoMedicoPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Nuevo médico</h1>
      <FormNuevoMedico />
    </div>
  )
}
```

- [ ] **Step 3: Escribir el formulario (client)**

```tsx
// src/features/admin/medicos/components/FormNuevoMedico.tsx
'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { onboardMedico, chequearSlugDisponible } from '@/actions/admin-medicos'
import { generarSlugBase } from '@/features/admin/medicos/slug'
import type { OnboardMedicoResult } from '@/features/admin/medicos/types'

export function FormNuevoMedico() {
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTocado, setSlugTocado] = useState(false)
  const [slugLibre, setSlugLibre] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [ok, setOk] = useState<OnboardMedicoResult | null>(null)
  const [qr, setQr] = useState<string | null>(null)

  // Autocompletar el slug desde nombre/apellido mientras no lo editen a mano.
  useEffect(() => {
    if (!slugTocado) setSlug(generarSlugBase(nombre, apellido))
  }, [nombre, apellido, slugTocado])

  // Check de disponibilidad en vivo (debounce simple).
  useEffect(() => {
    if (!slug) { setSlugLibre(null); return }
    const t = setTimeout(async () => {
      const r = await chequearSlugDisponible(slug)
      setSlugLibre('disponible' in r ? r.disponible : null)
    }, 400)
    return () => clearTimeout(t)
  }, [slug])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null); setLoading(true)
    const form = new FormData(e.currentTarget)
    const r = await onboardMedico({
      email: String(form.get('email') ?? ''),
      nombre, apellido,
      especialidad: String(form.get('especialidad') ?? ''),
      matricula: String(form.get('matricula') ?? ''),
      cuit: String(form.get('cuit') ?? ''),
      telefono: String(form.get('telefono') ?? ''),
      numeroWhatsapp: String(form.get('numeroWhatsapp') ?? ''),
      slug,
    })
    setLoading(false)
    if ('error' in r) { setError(r.error); return }
    setOk(r)
    setQr(await QRCode.toDataURL(r.link))
  }

  if (ok) {
    return (
      <div className="space-y-4 rounded-xl border border-border p-6">
        <p className="font-medium">✅ Médico creado e invitado por email.</p>
        <p className="text-sm">Link público: <a href={ok.link} className="text-primary underline">{ok.link}</a></p>
        <button onClick={() => navigator.clipboard.writeText(ok.link)} className="rounded-lg border border-border px-3 py-1 text-sm">Copiar link</button>
        {qr && <img src={qr} alt="QR del link" className="w-40 h-40" />}
        <div><a href="/admin/medicos" className="text-primary underline text-sm">← Volver a la lista</a></div>
      </div>
    )
  }

  // Campos de texto reutilizando inputs estándar del repo (placeholder mínimo, el ejecutor
  // puede envolver con <Input> de @/shared/components/ui/input como en PerfilForm).
  const input = 'w-full rounded-xl border border-border px-3 py-2'
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input name="email" type="email" required placeholder="Email del médico" className={input} />
      <div className="grid grid-cols-2 gap-3">
        <input required placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className={input} />
        <input required placeholder="Apellido" value={apellido} onChange={(e) => setApellido(e.target.value)} className={input} />
      </div>
      <input name="especialidad" placeholder="Especialidad" className={input} />
      <div className="grid grid-cols-2 gap-3">
        <input name="matricula" placeholder="Matrícula" className={input} />
        <input name="cuit" placeholder="CUIT" className={input} />
      </div>
      <input name="telefono" placeholder="Teléfono" className={input} />
      <input name="numeroWhatsapp" required placeholder="Número de WhatsApp (ej: +54 9 383 …)" className={input} />
      <div>
        <input
          required value={slug}
          onChange={(e) => { setSlugTocado(true); setSlug(e.target.value) }}
          placeholder="slug-publico" className={input}
        />
        <p className="text-xs mt-1">
          Link: /c/{slug || '…'} {slugLibre === true && '· ✓ disponible'} {slugLibre === false && '· ✗ en uso'}
        </p>
      </div>
      {error && <p className="text-sm text-error-700">{error}</p>}
      <button type="submit" disabled={loading || slugLibre === false} className="rounded-xl bg-primary text-white px-4 py-2 disabled:opacity-50">
        {loading ? 'Creando…' : 'Crear médico'}
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Verificar que compila**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/medicos/nuevo/page.tsx src/features/admin/medicos/components/FormNuevoMedico.tsx package.json package-lock.json
git commit -m "feat(onboarding): formulario nuevo medico con slug en vivo + QR"
```

---

## Task 8: Acceso desde el panel + E2E manual

**Files:**
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Agregar el link "Médicos" al panel del dueño**

Leer `src/app/admin/page.tsx` y agregar (dentro del contenido principal) una tarjeta/enlace:

```tsx
import Link from 'next/link'
// … dentro del JSX del panel:
<Link href="/admin/medicos" className="block rounded-xl border border-border p-4 hover:bg-muted">
  <div className="font-medium">Médicos</div>
  <div className="text-sm text-[var(--color-muted-foreground)]">Onboardear y ver el estado de cableado</div>
</Link>
```

- [ ] **Step 2: Verificar que compila y buildea**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3: E2E manual (requiere el prerequisito de SMTP/Resend)**

Checklist (spec §10 / §12):
1. Login como `admin@medicuenta.com` → `/admin/medicos/nuevo`.
2. Completar el form con un email de prueba real (tuyo) → "Crear médico".
3. Verificar resultado: aparece link `/c/<slug>` + QR.
4. Verificar en DB (MCP `execute_sql`):
   ```sql
   select p.rol, s.nombre, a.slug_publico, a.numero_personal
   from perfiles p
   left join wa_servicios s on s.medico_id = p.id
   left join wa_asignaciones a on a.medico_id = p.id
   where p.id = (select id from auth.users where email = '<email-de-prueba>');
   ```
   Expected: `rol=medico`, servicio `Consulta`, `slug_publico` y `numero_personal` cargados.
5. Llega el email de invitación → click → aterriza en `/update-password` (vía `/api/auth/callback`) → setear contraseña → entra a la app.
6. `curl -i https://<base>/c/<slug>` → **302** (el bot del médico nuevo está vivo).
7. Probar fallo parcial: dejar el nodo sin cupo (`update wa_nodos set medicos_activos = capacidad_max`), crear otro médico → debe quedar **⏳ pendiente**; revertir el cupo y "Reintentar" → pasa a ✅ sin duplicar cuenta ni servicio.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat(onboarding): acceso a Medicos desde el panel del dueno"
```

---

## Self-Review (cobertura del spec)

- **§2 Objetivo** (un form + un botón) → Tasks 4, 7. ✓
- **§4 Arquitectura** (`/admin/medicos`, `/admin/medicos/nuevo`, `onboardMedico`, `reintentarCableado`, helpers) → Tasks 4, 6, 7. ✓ (`elegirNodoConCupo` vive en la RPC, no en TS — decisión §1).
- **§5 Componentes** (lista con estado/copiar/QR/reintentar; form con slug autocompletado + check) → Tasks 6, 7. ✓
- **§6 Flujo onboardMedico** (superadmin → Zod → pre-check slug+nodo → invite → escrituras en transacción → link+QR) → Tasks 3, 4. ✓ (nodo se elige dentro de la transacción).
- **§7 Modelo de datos** (auth.users, perfiles, wa_servicios, wa_asignaciones, wa_nodos) → Task 3. ✓
- **§8 Errores** (no atómico Auth/datos; fallo parcial → pendiente + reintento idempotente; colisión slug 23505; nodo sin cupo) → Tasks 3, 4. ✓
- **§9 Seguridad** (`es_superadmin` en cada action; service-role server-only; Zod) → Task 4. ✓
- **§10 Testing** (unit slug; integración onboard happy + fallo parcial; E2E manual) → Tasks 2, 8. Parcial: la integración de `onboardMedico` se hace con SQL directo + E2E (Task 8), no con mocks, por el patrón del repo (sin infra de mocks de Supabase). Documentado en decisión §6.
- **§11 Riesgos** (SMTP → prerequisito; página de invite → Task 5; medicos_activos → recompute, decisión §2) → cubiertos.
- **§12 Criterios de aceptación** 1–5 → Task 8 checklist. ✓

**Gap consciente:** la normalización del número (spec lista `normalizarNumeroWhatsApp` como helper) se resuelve reusando `normalizeRecipient` (decisión §3) — no se crea helper nuevo ni test propio, porque ya tiene cobertura en `clasificar.test.ts`.

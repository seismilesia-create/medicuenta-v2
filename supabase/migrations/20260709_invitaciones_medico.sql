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

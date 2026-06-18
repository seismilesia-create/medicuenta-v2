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

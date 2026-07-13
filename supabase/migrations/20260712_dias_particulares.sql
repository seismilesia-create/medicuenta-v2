-- supabase/migrations/20260712_dias_particulares.sql
-- Días en que el médico atiende TODO particular (recurrente por día de semana o fecha puntual).
-- Ortogonal a wa_excepciones (disponibilidad): acá el día está abierto, solo cambia el cobro.
-- RLS espeja wa_horarios: médico CRUD; secretaria SELECT delegado (necesita verlo en la agenda).
create table if not exists public.wa_dias_particulares (
  id          uuid primary key default gen_random_uuid(),
  medico_id   uuid not null references auth.users(id) on delete cascade,
  tipo        text not null check (tipo in ('semanal','fecha')),
  dia_semana  smallint check (dia_semana between 0 and 6),  -- 0=domingo..6=sábado; null salvo tipo='semanal'
  fecha       date,                                          -- null salvo tipo='fecha'
  created_at  timestamptz not null default now(),
  check ((tipo='semanal' and dia_semana is not null and fecha is null)
      or (tipo='fecha'   and fecha is not null and dia_semana is null))
);
create index if not exists idx_wa_dias_particulares_medico on public.wa_dias_particulares(medico_id);
-- No duplicar el mismo día de semana / la misma fecha por médico:
create unique index if not exists idx_wa_dias_particulares_semanal
  on public.wa_dias_particulares(medico_id, dia_semana) where tipo='semanal';
create unique index if not exists idx_wa_dias_particulares_fecha
  on public.wa_dias_particulares(medico_id, fecha) where tipo='fecha';

alter table public.wa_dias_particulares enable row level security;
-- Escritura médico-only:
create policy "wa_dias_particulares_insert" on public.wa_dias_particulares
  for insert with check (auth.uid() = medico_id);
create policy "wa_dias_particulares_update" on public.wa_dias_particulares
  for update using (auth.uid() = medico_id) with check (auth.uid() = medico_id);
create policy "wa_dias_particulares_delete" on public.wa_dias_particulares
  for delete using (auth.uid() = medico_id);
-- Lectura delegada (médico + su secretaria activa), para la agenda:
create policy "wa_dias_particulares_select" on public.wa_dias_particulares
  for select using (public.puede_acceder_consultorio(medico_id));

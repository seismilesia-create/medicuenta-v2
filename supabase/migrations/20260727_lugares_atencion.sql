-- Lugares físicos donde atiende el médico (Sanatorio Pasteur, consultorio privado, etc.).
--
-- V1: días por lugar, SIN franjas horarias propias. El horario sigue viviendo en wa_horarios
-- (que ya es por weekday), así que lugar-por-día + horario-por-día se combinan solos: el bot
-- dice "Lun, Mié y Vie de 09:00 a 13:00 en Sanatorio Pasteur". Si mañana hace falta franja por
-- lugar (dos lugares el mismo día, mañana y tarde), se agregan columnas o una tabla hija: es
-- aditivo y no migra datos.
--
-- RLS espeja wa_dias_particulares: el médico hace CRUD sobre lo suyo y la secretaria vinculada
-- SELECT (puede_acceder_consultorio). La escritura de la secretaria va por server actions con
-- service-role tras ctxOperativo, igual que el resto de la config operativa.
create table if not exists public.wa_lugares_atencion (
  id          uuid primary key default gen_random_uuid(),
  medico_id   uuid not null references auth.users(id) on delete cascade,
  nombre      text not null check (length(btrim(nombre)) > 0),   -- "Sanatorio Pasteur"
  direccion   text,                                              -- "República 764" (opcional)
  consultorio text,                                              -- "54" (texto libre)
  piso        text,                                              -- "1er piso" (texto libre)
  dias        smallint[] not null default '{}',                  -- 0=domingo .. 6=sábado
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (dias <@ array[0,1,2,3,4,5,6]::smallint[])
);

create index if not exists idx_wa_lugares_atencion_medico on public.wa_lugares_atencion(medico_id);

alter table public.wa_lugares_atencion enable row level security;

create policy "wa_lugares_atencion_insert" on public.wa_lugares_atencion
  for insert with check (auth.uid() = medico_id);
create policy "wa_lugares_atencion_update" on public.wa_lugares_atencion
  for update using (auth.uid() = medico_id) with check (auth.uid() = medico_id);
create policy "wa_lugares_atencion_delete" on public.wa_lugares_atencion
  for delete using (auth.uid() = medico_id);
create policy "wa_lugares_atencion_select" on public.wa_lugares_atencion
  for select using (public.puede_acceder_consultorio(medico_id));

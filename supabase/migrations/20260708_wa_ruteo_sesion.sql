-- Ruteo por sesión: estado + última actividad + candidatos ofrecidos.
-- Aditivo. medico_id pasa a nullable (una sesión en 'esperando_nombre' no tiene
-- médico aún). Sobre datos existentes: las filas actuales quedan estado='activa'
-- con last_activity_at=now() (default), consistente.
alter table public.wa_ruteo_conversacion
  add column if not exists estado text not null default 'activa'
    check (estado in ('activa','esperando_confirmacion','esperando_nombre','esperando_seleccion')),
  add column if not exists last_activity_at timestamptz not null default now(),
  add column if not exists candidatos jsonb;

alter table public.wa_ruteo_conversacion alter column medico_id drop not null;

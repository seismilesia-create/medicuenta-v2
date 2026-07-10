-- supabase/migrations/20260710_equipo_token.sql
-- Token para el alta de secretaria por enlace (espeja invitaciones_medico).
-- Acceso público al token vía service-role (bypassa RLS), como el médico.
alter table public.equipo_consultorio add column if not exists token text;
create unique index if not exists idx_equipo_token on public.equipo_consultorio (token) where token is not null;

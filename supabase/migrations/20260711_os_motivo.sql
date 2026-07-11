-- supabase/migrations/20260711_os_motivo.sql
-- Dos listas de excepción de OS: 'suspendida' (por el Círculo, temporal) y
-- 'no_atiende' (el médico no la toma, permanente). Ambas → el bot ofrece particular.
-- Ortogonal a la columna `fuente` ('manual'|'circulo' = origen del dato).
alter table public.wa_os_suspendidas
  add column if not exists motivo text not null default 'suspendida'
  check (motivo in ('suspendida','no_atiende'));

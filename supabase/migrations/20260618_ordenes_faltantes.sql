-- supabase/migrations/20260618_ordenes_faltantes.sql
-- Pre-check anti-débito (item 2 backlog contador): firma/sello del médico + constancia.

alter table public.ordenes
  add column if not exists firma_sello_medico boolean not null default false,
  add column if not exists faltantes_confirmados_at timestamptz;

comment on column public.ordenes.firma_sello_medico is 'Firma Y sello del médico presentes en la orden. Detectado por OCR, corregible por el médico.';
comment on column public.ordenes.faltantes_confirmados_at is 'Constancia: cuándo el médico confirmó haber resuelto los faltantes (Resolver faltantes).';

-- supabase/migrations/20260619_ordenes_codigo_os.sql
-- Catálogo de OS en órdenes (item 4): clave de negocio estable + backfill suave.

alter table public.ordenes add column if not exists codigo_os integer;
comment on column public.ordenes.codigo_os is 'Código de OS del catálogo aranceles_os (clave de negocio estable; no FK, aranceles_os es time-varying). Null = OS fuera de catálogo o histórico sin match.';
create index if not exists idx_ordenes_codigo_os on public.ordenes(codigo_os);

-- Backfill suave: matchear obra_social (texto) contra el nombre canónico de aranceles_os,
-- normalizando acentos/mayúsculas y los separadores no alfanuméricos (O.S.E.P. ~ OSEP).
update public.ordenes o
set codigo_os = a.codigo_os
from (
  select distinct on (norm) codigo_os, norm from (
    select codigo_os,
           regexp_replace(lower(translate(nombre_os,'ÁÉÍÓÚÜÑáéíóúüñ','aeiouunaeiouun')), '[^a-z0-9]', '', 'g') as norm
    from public.aranceles_os
  ) s order by norm, codigo_os
) a
where o.codigo_os is null
  and coalesce(o.obra_social,'') <> ''
  and regexp_replace(lower(translate(coalesce(o.obra_social,''),'ÁÉÍÓÚÜÑáéíóúüñ','aeiouunaeiouun')), '[^a-z0-9]', '', 'g') = a.norm;

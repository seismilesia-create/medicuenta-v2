-- Blindaje N1 (auditoría 2026-07-02): la planilla se agrupa por codigo_os, no por
-- el texto libre de la OS. Antes "OSEP" y "O.S.E.P." generaban dos presentaciones
-- para la misma obra social y mes. Guardamos el codigo_os en la presentación para
-- que quede la identidad canónica (y sirva a reportes/reconciliación).
-- Tabla vacía al momento del cambio → columna nullable sin backfill.
alter table public.presentaciones
  add column if not exists codigo_os int;

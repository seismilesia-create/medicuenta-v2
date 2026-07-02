-- Blindaje (auditoría 2026-07-02): los débitos no guardaban a qué OS pertenecían,
-- así que en Reportes el filtro por obra social no los alcanzaba (el neto restaba
-- débitos de TODAS las OS al filtrar una). Agregamos OS al débito (opcional: los
-- débitos viejos quedan sin OS y solo aparecen en la vista "todas").
alter table public.debitos
  add column if not exists codigo_os int,
  add column if not exists obra_social text;

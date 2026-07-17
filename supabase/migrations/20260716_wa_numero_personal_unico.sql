-- supabase/migrations/20260716_wa_numero_personal_unico.sql
-- Unicidad del numero_personal dentro de un nodo.
--
-- Por qué: getMedicoIdPorNumeroEnNodo recorre las asignaciones activas del nodo y devuelve
-- el PRIMER medico_id cuyo numero_personal matchea (nodos.ts). Si dos médicos del mismo nodo
-- comparten número, el ganador depende del orden que devuelva Postgres → ruteo no determinístico
-- e indiagnosticable. Hasta ahora era improbable (solo el admin cargaba el número); con la
-- edición self-service del médico pasa a ser alcanzable, así que lo volvemos un error explícito
-- al guardar en vez de un bug de ruteo.
--
-- Alcance: por nodo, no global. Dos médicos de nodos distintos con el mismo número no rompen
-- nada (el lookup filtra por nodo_id primero). Parcial en `activo` para no bloquear por
-- asignaciones dadas de baja.
create unique index if not exists idx_wa_asignaciones_numero_por_nodo
  on public.wa_asignaciones(nodo_id, numero_personal) where activo;

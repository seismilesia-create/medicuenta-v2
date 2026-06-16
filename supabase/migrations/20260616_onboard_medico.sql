-- supabase/migrations/20260616_onboard_medico.sql
-- Panel de onboarding de médicos: cableado atómico + listado para el panel admin.

-- 1) Cableado transaccional e idempotente. Lo llama la server action onboardMedico
--    (service-role) DESPUÉS de crear la cuenta con inviteUserByEmail.
--    Hace: identidad del perfil + servicio "Consulta" + asignación de nodo/slug/número
--    + recompute de medicos_activos. Re-ejecutable (reintentarCableado) sin duplicar.
create or replace function public.onboard_medico_cablear(
  p_medico_id      uuid,
  p_nombre         text,
  p_apellido       text,
  p_especialidad   text,
  p_matricula      text,
  p_cuit           text,
  p_telefono       text,
  p_slug           text,
  p_numero_personal text,
  p_servicio_nombre text default 'Consulta',
  p_duracion_min    int  default 30
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nodo_id uuid;
  v_numero_nodo text;
begin
  -- Identidad (idempotente). El perfil ya lo creó el trigger handle_new_user.
  update perfiles set
    nombre       = p_nombre,
    apellido     = p_apellido,
    especialidad = nullif(p_especialidad, ''),
    matricula    = nullif(p_matricula, ''),
    cuit         = nullif(p_cuit, ''),
    telefono     = nullif(p_telefono, ''),
    rol          = 'medico'
  where id = p_medico_id;

  if not found then
    raise exception 'perfil_inexistente' using errcode = 'P0002';
  end if;

  -- Servicio "Consulta" (idempotente por UNIQUE(medico_id, nombre)).
  insert into wa_servicios (medico_id, nombre, duracion_min, activo)
  values (p_medico_id, p_servicio_nombre, p_duracion_min, true)
  on conflict (medico_id, nombre) do update set activo = true;

  -- Asignación: si el médico ya tiene una (UNIQUE medico_id), reusamos su nodo.
  select nodo_id into v_nodo_id from wa_asignaciones where medico_id = p_medico_id;

  if v_nodo_id is null then
    -- Elegir nodo activo con cupo, con lock para evitar carrera entre onboardings.
    select id into v_nodo_id
    from wa_nodos
    where estado = 'activo' and medicos_activos < capacidad_max
    order by medicos_activos asc, created_at asc
    limit 1
    for update;

    if v_nodo_id is null then
      raise exception 'sin_cupo_nodos' using errcode = 'P0001';
    end if;

    insert into wa_asignaciones (medico_id, nodo_id, slug_publico, numero_personal, activo)
    values (p_medico_id, v_nodo_id, p_slug, p_numero_personal, true);
  end if;

  -- Recompute de medicos_activos (evita drift).
  update wa_nodos n set medicos_activos = (
    select count(*) from wa_asignaciones a where a.nodo_id = n.id and a.activo
  ) where n.id = v_nodo_id;

  select numero_whatsapp into v_numero_nodo from wa_nodos where id = v_nodo_id;

  return jsonb_build_object('nodo_id', v_nodo_id, 'slug', p_slug, 'numero_nodo', v_numero_nodo);
end;
$$;

-- 2) Listado para el panel (perfil + estado de cableado). SECURITY DEFINER porque
--    cruza perfiles ⨝ auth.users ⨝ wa_asignaciones; la autorización (es_superadmin)
--    la hace la server action ANTES de llamarla (mismo patrón que superadmin_metricas_medicos).
create or replace function public.superadmin_listar_medicos()
returns table (
  id uuid,
  nombre text,
  apellido text,
  especialidad text,
  email text,
  slug_publico text,
  cableado_activo boolean
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.nombre,
    p.apellido,
    p.especialidad,
    u.email::text,
    a.slug_publico,
    coalesce(a.activo, false) as cableado_activo
  from perfiles p
  join auth.users u on u.id = p.id
  left join wa_asignaciones a on a.medico_id = p.id and a.activo
  where p.rol = 'medico'
  order by p.apellido nulls last, p.nombre nulls last;
$$;

-- Seguridad: estas funciones SECURITY DEFINER son server-only (las llama la server action
-- con service-role tras verificar es_superadmin). Cerramos EXECUTE a anon/authenticated para
-- que NO sean invocables con la anon key desde el cliente (mismo patrón que
-- superadmin_metricas_medicos / uid_por_email).
revoke execute on function public.onboard_medico_cablear(uuid, text, text, text, text, text, text, text, text, text, int) from public, anon, authenticated;
revoke execute on function public.superadmin_listar_medicos() from public, anon, authenticated;
grant execute on function public.onboard_medico_cablear(uuid, text, text, text, text, text, text, text, text, text, int) to service_role;
grant execute on function public.superadmin_listar_medicos() to service_role;

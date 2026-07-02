-- Fix de seguridad (auditoría 2026-07-02): escalada a superadmin.
--
-- Problema: el rol `authenticated` tiene UPDATE a nivel TABLA sobre `perfiles`
-- y la RLS de UPDATE es `auth.uid() = id` sin restricción de columna. Un médico
-- logueado podía hacer `PATCH /rest/v1/perfiles {es_superadmin:true}` sobre su
-- propia fila y entrar al panel /admin (que opera con service_role sobre todos
-- los médicos). Un REVOKE a nivel columna NO alcanza porque el grant de tabla lo pisa.
--
-- Fix: trigger BEFORE INSERT/UPDATE que rechaza cambios a columnas administrativas
-- cuando el rol que ejecuta es `authenticated` o `anon`. `service_role` (panel admin),
-- `postgres` y superusuarios (migraciones) quedan exentos.
--
-- IMPORTANTE: la función es SECURITY INVOKER (default) a propósito, para que
-- `current_user` refleje el rol real que ejecuta la sentencia. Con SECURITY DEFINER
-- `current_user` sería el owner y el guard nunca bloquearía.

create or replace function public.proteger_columnas_admin_perfil()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- service_role / postgres / superusuarios: sin restricción.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.es_superadmin  is distinct from old.es_superadmin
       or new.rol               is distinct from old.rol
       or new.categoria_arancel is distinct from old.categoria_arancel
       or new.atiende_interior  is distinct from old.atiende_interior then
      raise exception 'No autorizado a modificar columnas administrativas del perfil'
        using errcode = '42501';
    end if;
  elsif tg_op = 'INSERT' then
    -- un usuario no puede auto-crearse un perfil con privilegios elevados.
    if coalesce(new.es_superadmin, false) is true
       or coalesce(new.rol, 'medico') <> 'medico' then
      raise exception 'No autorizado a crear un perfil con privilegios administrativos'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists proteger_columnas_admin_perfil on public.perfiles;

create trigger proteger_columnas_admin_perfil
  before insert or update on public.perfiles
  for each row
  execute function public.proteger_columnas_admin_perfil();

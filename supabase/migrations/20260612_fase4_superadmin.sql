-- ============================================================================
-- Fase 4 (F4.1) — Superadmin del dueño (spec dashboard §4/§5)
-- El dueño (Héctor) ve a TODOS los médicos (cross-tenant). La app es por-médico
-- (RLS auth.uid()=medico_id); el superadmin NO rompe esa RLS: lee por service-role
-- a través de una función SECURITY DEFINER cerrada a service_role (patrón 3B).
--
-- `es_superadmin` es un flag ortogonal al rol (medico/secretaria): no toca el
-- CHECK del rol ni el resolver del consultorio.
-- ============================================================================

ALTER TABLE perfiles
  ADD COLUMN IF NOT EXISTS es_superadmin BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN perfiles.es_superadmin IS
  'true = dueño de la plataforma (Héctor). Da acceso a /admin. Ortogonal al rol.';

-- Métricas por médico para el panel del dueño (§5.1). Una sola llamada trae la
-- lista de médicos + sus números + el costo (tokens 30d, mensajes pagos 30d) +
-- salud (errores 7d) + actividad (turnos). SECURITY DEFINER para leer auth.users
-- y saltar la RLS por-médico; cerrada a service_role (no la llama nadie logueado).
CREATE OR REPLACE FUNCTION superadmin_metricas_medicos()
RETURNS TABLE (
  medico_id uuid,
  nombre text,
  apellido text,
  email text,
  alta timestamptz,
  numero text,
  canal_estado text,
  tokens_30d bigint,
  mensajes_pagos_30d bigint,
  mensajes_salientes_30d bigint,
  errores_7d bigint,
  turnos_total bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.nombre,
    p.apellido,
    u.email::text,
    u.created_at,
    c.display_phone_number,
    c.estado,
    COALESCE((SELECT SUM(x.total_tokens) FROM uso_ia x
              WHERE x.medico_id = p.id AND x.created_at >= now() - interval '30 days'), 0)::bigint,
    COALESCE((SELECT COUNT(*) FROM wa_mensajes m
              WHERE m.medico_id = p.id AND m.direccion = 'saliente'
                AND m.fuera_ventana_24h AND m.created_at >= now() - interval '30 days'), 0)::bigint,
    COALESCE((SELECT COUNT(*) FROM wa_mensajes m
              WHERE m.medico_id = p.id AND m.direccion = 'saliente'
                AND m.created_at >= now() - interval '30 days'), 0)::bigint,
    COALESCE((SELECT COUNT(*) FROM wa_bitacora b
              WHERE b.medico_id = p.id AND b.nivel = 'error'
                AND b.created_at >= now() - interval '7 days'), 0)::bigint,
    COALESCE((SELECT COUNT(*) FROM wa_turnos t WHERE t.medico_id = p.id), 0)::bigint
  FROM perfiles p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN wa_canales c ON c.medico_id = p.id
  WHERE p.rol IS DISTINCT FROM 'secretaria';
$$;

REVOKE EXECUTE ON FUNCTION superadmin_metricas_medicos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION superadmin_metricas_medicos() TO service_role;

-- Para designar al superadmin (NO va en el schema, es dato por-entorno):
--   UPDATE perfiles SET es_superadmin = true
--   WHERE id = (SELECT id FROM auth.users WHERE email = 'tu-email@dominio.com');

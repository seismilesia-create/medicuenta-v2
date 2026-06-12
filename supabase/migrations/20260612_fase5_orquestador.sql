-- ============================================================================
-- Fase 5 (v1a) — Orquestador que observa (spec dashboard §6)
-- El orquestador detecta problemas mirando las mismas señales del superadmin.
-- Sumamos `trial_ends_at` a la función para poder alertar pruebas por vencer.
-- (La detección y las alertas viven en la app: src/lib/admin/alertas.ts)
-- ============================================================================

DROP FUNCTION IF EXISTS superadmin_metricas_medicos();
CREATE FUNCTION superadmin_metricas_medicos()
RETURNS TABLE (
  medico_id uuid,
  nombre text,
  apellido text,
  email text,
  alta timestamptz,
  numero text,
  canal_estado text,
  plan text,
  sub_estado text,
  trial_ends_at timestamptz,
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
    s.plan,
    s.estado,
    s.trial_ends_at,
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
  LEFT JOIN suscripciones s ON s.medico_id = p.id
  WHERE p.rol IS DISTINCT FROM 'secretaria';
$$;
REVOKE EXECUTE ON FUNCTION superadmin_metricas_medicos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION superadmin_metricas_medicos() TO service_role;

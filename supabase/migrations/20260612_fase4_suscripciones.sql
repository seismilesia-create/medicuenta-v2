-- ============================================================================
-- Fase 4 (F4.2) — Planes y suscripciones (spec dashboard §3/§5.2)
-- Dos planes: 'basico' (facturación + asistente IA de facturación) y 'full'
-- (+ consultorio/WhatsApp: agenda, conversaciones, pacientes, asistente de turnos,
-- secretaria). El candado de funciones se aplica por el plan (app-layer §3).
-- La cobranza (estado/MercadoPago) se conecta en F4.3; acá el estado lo maneja
-- el superadmin a mano.
-- ============================================================================

CREATE TABLE IF NOT EXISTS suscripciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'basico' CHECK (plan IN ('basico', 'full')),
  estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('prueba', 'activa', 'morosa', 'suspendida', 'baja')),
  trial_ends_at TIMESTAMPTZ,
  mp_subscription_id TEXT,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_suscripciones_medico ON suscripciones(medico_id);

ALTER TABLE suscripciones ENABLE ROW LEVEL SECURITY;
-- SELECT delegado (patrón 3B): el médico ve su plan, y la secretaria el del médico
-- al que asiste (para que el candado funcione en su sesión). NO hay INSERT/UPDATE
-- por RLS: lo gestiona el superadmin por service-role (y a futuro el webhook de MP).
DROP POLICY IF EXISTS "suscripciones_select" ON suscripciones;
CREATE POLICY "suscripciones_select" ON suscripciones FOR SELECT
  USING (public.puede_acceder_consultorio(medico_id));

COMMENT ON TABLE suscripciones IS
  'Plan (basico/full) y estado de suscripción por médico. El plan canda las funciones (spec §3).';

-- Seed: los médicos existentes arrancan en FULL/activa para no perder el consultorio
-- que ya venían usando. Los nuevos, sin fila, se tratan como 'basico' en la app.
INSERT INTO suscripciones (medico_id, plan, estado)
SELECT p.id, 'full', 'activa'
FROM perfiles p
WHERE p.rol IS DISTINCT FROM 'secretaria'
ON CONFLICT (medico_id) DO NOTHING;

-- Métricas del superadmin: sumamos plan + estado a la función (recreamos por cambio
-- de firma). Mantiene el resto igual (§5.1).
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

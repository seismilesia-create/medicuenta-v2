-- ============================================================================
-- Fase 4 — Instrumentación de COSTOS (spec dashboard del dueño, §5.1)
-- Captura lo que le cuesta a Héctor cada médico, para fijar precios/promo:
--   1) uso_ia: tokens de IA por médico (asistente de WhatsApp + de facturación).
--   2) wa_mensajes.fuera_ventana_24h: marca los salientes que caen FUERA de la
--      ventana de 24 h de Meta (esos los cobra Meta; pueden ser del agente o de
--      un humano respondiendo tarde desde el panel).
-- Médico-only por RLS (el médico ve lo suyo); el superadmin agregará cross-tenant
-- por service-role más adelante. El runner de WhatsApp inserta por service-role.
-- ============================================================================

CREATE TABLE IF NOT EXISTS uso_ia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  origen TEXT NOT NULL CHECK (origen IN ('whatsapp', 'panel')),
  modelo TEXT,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  total_tokens INT NOT NULL DEFAULT 0,
  -- Drill-down opcional (puede apuntar a wa_conversaciones o chat_conversaciones);
  -- sin FK porque son dos tablas distintas y la métrica clave es por médico.
  conversacion_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agregación por médico y por fecha (el promedio/outliers del dashboard).
CREATE INDEX IF NOT EXISTS idx_uso_ia_medico_created ON uso_ia(medico_id, created_at DESC);

ALTER TABLE uso_ia ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uso_ia_select" ON uso_ia FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "uso_ia_insert" ON uso_ia FOR INSERT WITH CHECK (auth.uid() = medico_id);

COMMENT ON TABLE uso_ia IS
  'Costo de IA por médico (tokens). Fuente de la métrica de costo del dashboard del dueño (§5.1).';

-- Marca de costo de WhatsApp: un saliente FUERA de la ventana de 24 h cuesta.
ALTER TABLE wa_mensajes
  ADD COLUMN IF NOT EXISTS fuera_ventana_24h BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN wa_mensajes.fuera_ventana_24h IS
  'true si este saliente se envió fuera de la ventana de 24 h de Meta (tiene costo). Solo aplica a direccion=saliente.';

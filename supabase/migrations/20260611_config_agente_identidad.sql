-- ============================================================================
-- Identidad del asistente por médico: nombre y especialidad viven en la config
-- del agente (se cargan al dar de alta al médico; el system prompt los usa).
-- ============================================================================

ALTER TABLE wa_config_agente
  ADD COLUMN IF NOT EXISTS nombre_medico TEXT,
  ADD COLUMN IF NOT EXISTS especialidad TEXT;

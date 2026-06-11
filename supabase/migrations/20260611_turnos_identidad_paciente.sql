-- ============================================================================
-- Identidad completa del paciente en el turno: DNI (candado anti-acaparamiento
-- entre números distintos) + obra social (o "particular") a la vista del médico.
-- ============================================================================

ALTER TABLE wa_turnos
  ADD COLUMN IF NOT EXISTS paciente_dni TEXT,
  ADD COLUMN IF NOT EXISTS paciente_obra_social TEXT;

CREATE INDEX IF NOT EXISTS idx_wa_turnos_dni ON wa_turnos(medico_id, paciente_dni);

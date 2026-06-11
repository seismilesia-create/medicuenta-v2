-- ============================================================================
-- Identidad completa del paciente en el turno: DNI (candado anti-acaparamiento
-- entre números distintos), obra social (o "particular") y apellido SEPARADO
-- del nombre (regla de modelado del dueño: mejor estructura, orden por apellido,
-- futura conexión con historia clínica).
-- Idempotente: se puede correr aunque una versión previa ya se haya aplicado.
-- ============================================================================

ALTER TABLE wa_turnos
  ADD COLUMN IF NOT EXISTS paciente_dni TEXT,
  ADD COLUMN IF NOT EXISTS paciente_obra_social TEXT,
  ADD COLUMN IF NOT EXISTS paciente_apellido TEXT;

CREATE INDEX IF NOT EXISTS idx_wa_turnos_dni ON wa_turnos(medico_id, paciente_dni);

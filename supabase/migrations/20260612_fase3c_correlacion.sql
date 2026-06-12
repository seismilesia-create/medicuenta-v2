-- ============================================================================
-- Fase 3C — Correlación turno→orden (D8 del spec, §9.2)
-- Vincula una orden de facturación con el turno REAL de la agenda. Sirve para:
--   1) proponer fecha_atencion + horario_realizacion reales (menos débitos),
--   2) guardar el nexo agenda↔facturación (data real de atención = activo B2B).
-- `ordenes` sigue siendo médico-only (RLS intacta de 3B). La FK valida contra
-- wa_turnos (chequeo del sistema, no atado a RLS). ON DELETE SET NULL: si se
-- borra el turno, la orden queda pero sin vínculo (nunca se pierde facturación).
-- ============================================================================

ALTER TABLE ordenes
  ADD COLUMN IF NOT EXISTS turno_id UUID REFERENCES wa_turnos(id) ON DELETE SET NULL;

-- Índice por médico+turno: (a) encontrar la orden de un turno, (b) excluir
-- turnos ya vinculados al sugerir. Acompaña la RLS médico-only.
CREATE INDEX IF NOT EXISTS idx_ordenes_medico_turno ON ordenes(medico_id, turno_id);

COMMENT ON COLUMN ordenes.turno_id IS
  'FK opcional al turno de la agenda (wa_turnos) del que salió esta orden. Correlación 3C: propone fecha/hora reales. Los sobreturnos NO se vinculan (solo sugieren fecha).';

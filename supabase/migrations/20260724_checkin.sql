-- ── Check-in de recepción ────────────────────────────────────────────────────
-- La llegada es una COLUMNA, no un estado nuevo: así no se migra el CHECK de
-- `estado` ni el EXCLUDE anti-solape de wa_turnos, y la heurística
-- estadoEfectivoTurno ("pasado ⇒ atendido", src/lib/consultorio/asistencia.ts)
-- queda intacta. Llegar y ser atendido son hechos independientes.
-- checkin_* viaja con las policies delegadas de Fase 3B (la secretaria ya tiene
-- CRUD en wa_turnos / wa_sobreturnos): sin cambios de RLS.

ALTER TABLE wa_turnos
  ADD COLUMN IF NOT EXISTS checkin_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checkin_por UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE wa_sobreturnos
  ADD COLUMN IF NOT EXISTS checkin_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checkin_por UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Auditoría de carga de órdenes: quién la registró (secretaria vía check-in o
-- el médico). NULL = flujo histórico del médico.
ALTER TABLE ordenes
  ADD COLUMN IF NOT EXISTS registrada_por UUID REFERENCES auth.users(id) ON DELETE SET NULL;

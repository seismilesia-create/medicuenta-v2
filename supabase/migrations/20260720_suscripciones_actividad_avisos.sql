-- Push de la prueba (trial): señal de actividad del médico + marcas anti-repetición.
--
-- last_active_at:     última vez que el médico usó la app (lo bumpea el middleware,
--                     throttleado a ~1 escritura/día). Sirve para notificar SOLO al inactivo.
-- push_reenganche_at: cuándo se envió el push cálido de re-enganche (1 vez por prueba).
-- push_urgencia_at:   cuándo se envió el push de "faltan 3 días" (1 vez).
--
-- Todo lo escribe service-role (la tabla ya es SELECT-only por RLS), así que no hacen
-- falta policies nuevas.

ALTER TABLE suscripciones
  ADD COLUMN IF NOT EXISTS last_active_at     timestamptz,
  ADD COLUMN IF NOT EXISTS push_reenganche_at timestamptz,
  ADD COLUMN IF NOT EXISTS push_urgencia_at   timestamptz;

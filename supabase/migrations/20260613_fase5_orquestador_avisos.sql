-- ============================================================================
-- Fase 5 (v1b) — Entrega proactiva del orquestador (spec dashboard §6, DD5/DD6)
-- El orquestador ya detecta problemas (v1a) y los muestra en /admin. Ahora corre
-- solo (cron diario) y le manda un email al dueño cuando hay novedades.
--
-- Esta tabla guarda QUÉ se mandó: sirve de bitácora de avisos y, sobre todo, para
-- el dedup por cambio (no reenviar si el set de alertas no cambió desde el último).
-- Solo la escribe/lee el cron por service-role (igual que superadmin_metricas_medicos).
-- ============================================================================

CREATE TABLE IF NOT EXISTS orquestador_avisos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma       text NOT NULL,           -- huella estable del set de alertas (digest.firma)
  cantidad    int NOT NULL DEFAULT 0,  -- cuántas alertas tenía ese aviso
  payload     jsonb,                   -- el set de alertas, para auditar
  enviado_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE orquestador_avisos IS
  'Bitácora de avisos proactivos del orquestador (v1b). La última fila define el dedup por cambio.';

CREATE INDEX IF NOT EXISTS idx_orquestador_avisos_enviado_at
  ON orquestador_avisos (enviado_at DESC);

-- RLS: nadie logueado toca esta tabla. Solo service-role (el cron). Mismo patrón
-- que el resto del panel del dueño: REVOKE de PUBLIC + GRANT a service_role.
ALTER TABLE orquestador_avisos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON orquestador_avisos FROM PUBLIC, anon, authenticated;
GRANT ALL ON orquestador_avisos TO service_role;

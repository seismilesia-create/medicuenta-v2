-- ── Cierre del día (rendición diaria) ────────────────────────────────────────

-- Momento exacto del pago de la receta: updated_at se pisa con la entrega y la
-- reconciliación, así que el corte diario necesita su propia marca. Sin
-- backfill: el cierre mira del deploy en adelante.
ALTER TABLE recetas ADD COLUMN IF NOT EXISTS pagada_at TIMESTAMPTZ;

-- Snapshot del día por médico. `fecha` es día calendario ARGENTINA (UTC-3 fijo).
-- cerrado_por NULL = cierre automático del cron de las 23:00 ART.
-- RLS médico-only: el cierre valoriza facturación y plus — no se delega (3B).
-- El cron escribe con service-role; el cierre manual con la sesión del médico.
CREATE TABLE IF NOT EXISTS cierres_dia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  snapshot JSONB NOT NULL,
  total_honorarios DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_plus DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_mp DECIMAL(12,2) NOT NULL DEFAULT 0,
  cerrado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (medico_id, fecha)
);
CREATE INDEX IF NOT EXISTS idx_cierres_medico_fecha ON cierres_dia(medico_id, fecha DESC);

ALTER TABLE cierres_dia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cierres_dia_select" ON cierres_dia;
CREATE POLICY "cierres_dia_select" ON cierres_dia FOR SELECT USING (auth.uid() = medico_id);
DROP POLICY IF EXISTS "cierres_dia_insert" ON cierres_dia;
CREATE POLICY "cierres_dia_insert" ON cierres_dia FOR INSERT WITH CHECK (auth.uid() = medico_id);
DROP POLICY IF EXISTS "cierres_dia_update" ON cierres_dia;
CREATE POLICY "cierres_dia_update" ON cierres_dia FOR UPDATE USING (auth.uid() = medico_id) WITH CHECK (auth.uid() = medico_id);
DROP POLICY IF EXISTS "cierres_dia_delete" ON cierres_dia;
CREATE POLICY "cierres_dia_delete" ON cierres_dia FOR DELETE USING (auth.uid() = medico_id);

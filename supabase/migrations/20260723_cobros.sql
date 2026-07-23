-- ── cobros: libro de cobros del consultorio ──────────────────────────────────
-- La plata que entra (plus de obra social, consulta particular), con medio,
-- estado y rastro de MercadoPago. `ordenes.monto_plus` / `monto_particular`
-- siguen siendo la fuente de Reportes; este ledger existe porque el cobro puede
-- nacer ANTES que la orden (check-in / bot) y la rendición diaria suma por
-- medio de pago entre conceptos. Sync unidireccional en src/lib/cobros/sync.ts.
-- RLS médico-only (garantía 3B: la plata NUNCA se delega por RLS); la
-- secretaria y el bot operan vía service-role en acciones autorizadas
-- (patrón consultorio-recetas.ts).

CREATE TABLE IF NOT EXISTS cobros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  concepto TEXT NOT NULL DEFAULT 'plus' CHECK (concepto IN ('plus', 'consulta_particular')),
  monto DECIMAL(12,2) NOT NULL CHECK (monto > 0),
  medio TEXT NOT NULL CHECK (medio IN ('efectivo', 'transferencia', 'debito_qr', 'mercadopago')),
  estado TEXT NOT NULL DEFAULT 'cobrado' CHECK (estado IN ('pendiente', 'cobrado', 'anulado', 'devuelto')),
  orden_id UUID REFERENCES ordenes(id) ON DELETE SET NULL,
  turno_id UUID REFERENCES wa_turnos(id) ON DELETE SET NULL,
  sobreturno_id UUID REFERENCES wa_sobreturnos(id) ON DELETE SET NULL,
  paciente_nombre TEXT,
  paciente_dni TEXT,
  mp_preference_id TEXT,
  mp_payment_id TEXT,
  registrado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- NULL = lo cobró el bot
  cobrado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cobros_medico_created ON cobros(medico_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cobros_medico_orden ON cobros(medico_id, orden_id);
CREATE INDEX IF NOT EXISTS idx_cobros_medico_turno ON cobros(medico_id, turno_id);

-- Anti doble cobro: un solo cobro VIVO (pendiente/cobrado) por concepto y ancla.
-- 'anulado'/'devuelto' no bloquean: tras un contracargo se puede recobrar.
CREATE UNIQUE INDEX IF NOT EXISTS ux_cobros_vivo_orden ON cobros(orden_id, concepto)
  WHERE estado IN ('pendiente', 'cobrado') AND orden_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_cobros_vivo_turno ON cobros(turno_id, concepto)
  WHERE estado IN ('pendiente', 'cobrado') AND turno_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_cobros_vivo_sobreturno ON cobros(sobreturno_id, concepto)
  WHERE estado IN ('pendiente', 'cobrado') AND sobreturno_id IS NOT NULL;

ALTER TABLE cobros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cobros_select" ON cobros;
CREATE POLICY "cobros_select" ON cobros FOR SELECT USING (auth.uid() = medico_id);
DROP POLICY IF EXISTS "cobros_insert" ON cobros;
CREATE POLICY "cobros_insert" ON cobros FOR INSERT WITH CHECK (auth.uid() = medico_id);
DROP POLICY IF EXISTS "cobros_update" ON cobros;
CREATE POLICY "cobros_update" ON cobros FOR UPDATE USING (auth.uid() = medico_id) WITH CHECK (auth.uid() = medico_id);
DROP POLICY IF EXISTS "cobros_delete" ON cobros;
CREATE POLICY "cobros_delete" ON cobros FOR DELETE USING (auth.uid() = medico_id);

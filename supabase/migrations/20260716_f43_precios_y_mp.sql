-- ============================================================================
-- F4.3 (fase 4) — Precios editables + lo que MercadoPago necesita guardar.
-- Spec: docs/superpowers/specs/2026-07-16-mp-suscripcion-saas-design.md (R6, D11).
-- ============================================================================

-- ── 1) Precios por plan ─────────────────────────────────────────────────────
-- El dueño los edita desde el panel, sin deploy (R6): en Argentina el precio se
-- come la inflación y no puede depender de que alguien recompile.
--
-- `monto_ars` arranca en NULL A PROPÓSITO, no con un placeholder: si sembramos un
-- monto de mentira y nadie lo cambia, el primer médico que contrate paga ESE monto
-- de verdad. Sin precio cargado, contratar queda deshabilitado. Falla seguro.
--
-- El CHECK >= 100 es el mínimo real de MP para cobrar con tarjeta (los ejemplos
-- oficiales usan transaction_amount: 10, que está por debajo y no cobra).
CREATE TABLE IF NOT EXISTS precios_planes (
  plan TEXT PRIMARY KEY CHECK (plan IN ('basico', 'full')),
  monto_ars NUMERIC(10, 2) CHECK (monto_ars IS NULL OR monto_ars >= 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO precios_planes (plan, monto_ars) VALUES ('basico', NULL), ('full', NULL)
ON CONFLICT (plan) DO NOTHING;

ALTER TABLE precios_planes ENABLE ROW LEVEL SECURITY;

-- El médico necesita ver el precio ANTES de contratar. No hay INSERT/UPDATE por RLS:
-- lo escribe el superadmin por service-role, igual que `suscripciones`.
DROP POLICY IF EXISTS "precios_planes_select" ON precios_planes;
CREATE POLICY "precios_planes_select" ON precios_planes FOR SELECT
  TO authenticated USING (true);

COMMENT ON TABLE precios_planes IS
  'Precio mensual en ARS por plan (F4.3 R6). NULL = todavia sin publicar → no se puede '
  'contratar. Lo edita el superadmin; MP cobra ~6,29% + IVA sobre este monto.';

-- ── 2) Lo que la suscripción necesita de MercadoPago ────────────────────────
-- `mp_subscription_id` y `current_period_end` ya existían de 20260612.
ALTER TABLE suscripciones
  -- D11: MP RECHAZA el pago si el payer_email no coincide con el email real del
  -- pagador. El del médico en MediCuenta no tiene por qué ser el de su cuenta de
  -- MP (suele ser una personal vieja) → se lo pedimos al contratar y lo guardamos.
  ADD COLUMN IF NOT EXISTS mp_payer_email TEXT,
  -- El status crudo del preapproval (pending/authorized/paused/canceled), tal cual
  -- lo devuelve MP. Nuestro `estado` es la lectura de negocio; esto es el dato.
  ADD COLUMN IF NOT EXISTS mp_preapproval_status TEXT,
  ADD COLUMN IF NOT EXISTS ultimo_evento_mp TIMESTAMPTZ;

-- El webhook resuelve el médico por el id del preapproval, no por la URL.
CREATE INDEX IF NOT EXISTS idx_suscripciones_mp_sub
  ON suscripciones (mp_subscription_id)
  WHERE mp_subscription_id IS NOT NULL;

-- ── 3) Idempotencia de los eventos de MP ────────────────────────────────────
-- Hay que activar el topic `payment` ADEMÁS de los de suscripción, así que el mismo
-- cobro llega duplicado por dos vías. Sin esto, un evento repetido correría
-- `current_period_end` de más y le regalaría un mes al médico.
CREATE TABLE IF NOT EXISTS mp_eventos_suscripcion (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  procesado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE mp_eventos_suscripcion ENABLE ROW LEVEL SECURITY;
-- Sin políticas: es puramente interno del webhook (service-role). Nadie más lo lee.

COMMENT ON TABLE mp_eventos_suscripcion IS
  'Eventos de MP ya procesados (F4.3). El id es el del evento/authorized_payment: la PK '
  'es la que evita reprocesar el mismo cobro que llega por payment y por subscription.';

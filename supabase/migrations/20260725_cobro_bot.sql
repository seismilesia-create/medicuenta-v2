-- ── Cobro al llegar (bot) ────────────────────────────────────────────────────
-- Monto default del plus que el bot cobra cuando el paciente hace el check-in
-- ("llegué") — mismo patrón que precio_receta_default. NULL = el bot no cobra
-- plus por WhatsApp y deriva al mostrador. La consulta particular usa el precio
-- del servicio del turno (wa_servicios.precio).
ALTER TABLE wa_config_agente
  ADD COLUMN IF NOT EXISTS monto_plus_default DECIMAL(12,2);

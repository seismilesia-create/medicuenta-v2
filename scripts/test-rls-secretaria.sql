-- ============================================================================
-- Tests de seguridad RLS de la secretaria (Fase 3B, vara del spec §10)
-- Probado por IMPERSONACIÓN: `set local role authenticated` + `set local request.jwt.claims`
-- hace que auth.uid() devuelva el sub y la RLS se evalúe como ese usuario.
-- Cada bloque va en su transacción con ROLLBACK: no deja rastro, es repetible.
--
-- Datos del escenario (proyecto de prueba eylcrxhpccwobipcjzal):
--   médico  = admin@medicuenta.com   924014ac-fb0a-4d9c-9028-49535e5e2e60  (con turnos/pacientes)
--   secret. = gabriel@seismilesia.com 9e473632-1f3f-4d25-a73c-adb08050d1f9 (vínculo 'activa')
-- Correr con: el MCP de Supabase (execute_sql) o psql, bloque por bloque.
-- Resultado esperado: cada columna *_DEBE_* matchea su nombre.
-- ============================================================================

-- ── 1) LECTURA — la secretaria VE el consultorio del médico, 0 en facturación ──
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"9e473632-1f3f-4d25-a73c-adb08050d1f9","role":"authenticated"}';
SELECT
  (SELECT count(*) FROM wa_turnos         WHERE medico_id='924014ac-fb0a-4d9c-9028-49535e5e2e60') AS ve_turnos,          -- >0
  (SELECT count(*) FROM wa_pacientes      WHERE medico_id='924014ac-fb0a-4d9c-9028-49535e5e2e60') AS ve_pacientes,       -- >0
  (SELECT count(*) FROM wa_conversaciones WHERE medico_id='924014ac-fb0a-4d9c-9028-49535e5e2e60') AS ve_conversaciones,  -- >0
  (SELECT count(*) FROM wa_mensajes       WHERE medico_id='924014ac-fb0a-4d9c-9028-49535e5e2e60') AS ve_mensajes,        -- >0
  (SELECT count(*) FROM wa_horarios       WHERE medico_id='924014ac-fb0a-4d9c-9028-49535e5e2e60') AS ve_horarios_select, -- >0 (solo-SELECT delegado)
  (SELECT count(*) FROM wa_servicios      WHERE medico_id='924014ac-fb0a-4d9c-9028-49535e5e2e60') AS ve_servicios_select,-- >0
  (SELECT count(*) FROM ordenes           WHERE medico_id='924014ac-fb0a-4d9c-9028-49535e5e2e60') AS x_ordenes,          -- 0
  (SELECT count(*) FROM liquidaciones     WHERE medico_id='924014ac-fb0a-4d9c-9028-49535e5e2e60') AS x_liquidaciones,    -- 0
  (SELECT count(*) FROM debitos           WHERE medico_id='924014ac-fb0a-4d9c-9028-49535e5e2e60') AS x_debitos,          -- 0
  (SELECT count(*) FROM cirugias          WHERE medico_id='924014ac-fb0a-4d9c-9028-49535e5e2e60') AS x_cirugias,         -- 0
  (SELECT count(*) FROM recetas           WHERE medico_id='924014ac-fb0a-4d9c-9028-49535e5e2e60') AS x_recetas,          -- 0
  (SELECT count(*) FROM recetas_cobro     WHERE medico_id='924014ac-fb0a-4d9c-9028-49535e5e2e60') AS x_recetas_cobro,    -- 0
  (SELECT count(*) FROM mp_conexiones     WHERE medico_id='924014ac-fb0a-4d9c-9028-49535e5e2e60') AS x_mp,               -- 0
  (SELECT count(*) FROM chat_conversaciones WHERE medico_id='924014ac-fb0a-4d9c-9028-49535e5e2e60') AS x_chat_conv,      -- 0
  (SELECT count(*) FROM chat_mensajes     WHERE medico_id='924014ac-fb0a-4d9c-9028-49535e5e2e60') AS x_chat_msg,         -- 0
  (SELECT count(*) FROM wa_config_agente  WHERE medico_id='924014ac-fb0a-4d9c-9028-49535e5e2e60') AS x_config,           -- 0
  (SELECT count(*) FROM wa_canales        WHERE medico_id='924014ac-fb0a-4d9c-9028-49535e5e2e60') AS x_canales,          -- 0
  (SELECT count(*) FROM wa_os_suspendidas WHERE medico_id='924014ac-fb0a-4d9c-9028-49535e5e2e60') AS x_os;               -- 0
ROLLBACK;
-- Resultado verificado 2026-06-12: 3,2,2,74,10,1 | 0,0,0,0,0,0,0,0,0,0,0,0  ✓

-- ── 2) ESCRITURA — insert delegado OK; horarios/servicios solo-SELECT (update 0) ──
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"9e473632-1f3f-4d25-a73c-adb08050d1f9","role":"authenticated"}';
WITH ins AS (
  INSERT INTO wa_turnos(medico_id, starts_at, ends_at, estado, origen)
  VALUES('924014ac-fb0a-4d9c-9028-49535e5e2e60', now()+interval '60 days', now()+interval '60 days'+interval '20 min', 'reservado', 'panel')
  RETURNING 1),
upd_h AS (UPDATE wa_horarios  SET updated_at=now() WHERE medico_id='924014ac-fb0a-4d9c-9028-49535e5e2e60' RETURNING 1),
upd_s AS (UPDATE wa_servicios SET updated_at=now() WHERE medico_id='924014ac-fb0a-4d9c-9028-49535e5e2e60' RETURNING 1)
SELECT (SELECT count(*) FROM ins) AS insert_turno_DEBE_1,
       (SELECT count(*) FROM upd_h) AS update_horarios_DEBE_0,
       (SELECT count(*) FROM upd_s) AS update_servicios_DEBE_0;
ROLLBACK;
-- Resultado verificado 2026-06-12: 1, 0, 0  ✓

-- ── 3) ESCRITURA BLOQUEADA — la secretaria NO puede insertar facturación ──
-- Esperado: ERROR 42501 "new row violates row-level security policy for table ordenes"
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"9e473632-1f3f-4d25-a73c-adb08050d1f9","role":"authenticated"}';
INSERT INTO ordenes(medico_id, tipo, nombre_paciente, estado, fecha_atencion, agente_facturador, nivel)
VALUES('924014ac-fb0a-4d9c-9028-49535e5e2e60','consulta','Test Secretaria','borrador', current_date, 'test', 1);
ROLLBACK;
-- Resultado verificado 2026-06-12: ERROR 42501 (rechazado)  ✓

-- ── 4) REVOCAR = corte inmediato ──
BEGIN;
UPDATE equipo_consultorio SET estado='revocada'
  WHERE medico_id='924014ac-fb0a-4d9c-9028-49535e5e2e60' AND secretaria_id='9e473632-1f3f-4d25-a73c-adb08050d1f9';
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"9e473632-1f3f-4d25-a73c-adb08050d1f9","role":"authenticated"}';
SELECT count(*) AS revocada_ve_turnos_DEBE_0 FROM wa_turnos WHERE medico_id='924014ac-fb0a-4d9c-9028-49535e5e2e60';
ROLLBACK;
-- Resultado verificado 2026-06-12: 0  ✓

-- ── 5) Médico NO vinculado — aislado ──
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
SELECT
  (SELECT count(*) FROM wa_turnos    WHERE medico_id='924014ac-fb0a-4d9c-9028-49535e5e2e60') AS ajeno_turnos_DEBE_0,
  (SELECT count(*) FROM wa_pacientes WHERE medico_id='924014ac-fb0a-4d9c-9028-49535e5e2e60') AS ajeno_pacientes_DEBE_0,
  (SELECT count(*) FROM wa_horarios  WHERE medico_id='924014ac-fb0a-4d9c-9028-49535e5e2e60') AS ajeno_horarios_DEBE_0;
ROLLBACK;
-- Resultado verificado 2026-06-12: 0, 0, 0  ✓

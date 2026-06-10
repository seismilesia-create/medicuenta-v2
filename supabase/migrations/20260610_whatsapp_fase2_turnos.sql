-- ============================================================================
-- WhatsApp Fase 2 — turnos: wa_servicios, wa_horarios, wa_excepciones, wa_turnos
-- Motor portado de Agente_Whatsapp, re-keyeado a medico_id (RLS auth.uid()=medico_id).
-- El sistema (webhook/runner) escribe via service-role y filtra medico_id a mano.
-- ============================================================================

-- Necesaria para el constraint anti-overbooking (EXCLUDE con = sobre uuid)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── wa_servicios: catálogo de servicios del médico (consulta, control, etc.) ─
CREATE TABLE wa_servicios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  duracion_min INT NOT NULL DEFAULT 30 CHECK (duracion_min > 0),
  precio DECIMAL(12,2),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (medico_id, nombre)
);
CREATE INDEX idx_wa_servicios_medico_id ON wa_servicios(medico_id);
ALTER TABLE wa_servicios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_servicios_select" ON wa_servicios FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "wa_servicios_insert" ON wa_servicios FOR INSERT WITH CHECK (auth.uid() = medico_id);
CREATE POLICY "wa_servicios_update" ON wa_servicios FOR UPDATE USING (auth.uid() = medico_id);
CREATE POLICY "wa_servicios_delete" ON wa_servicios FOR DELETE USING (auth.uid() = medico_id);

-- ── wa_horarios: horario semanal de atención (varios bloques por día → siesta) ─
CREATE TABLE wa_horarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0=domingo … 6=sábado
  open_time TIME NOT NULL,
  close_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (close_time > open_time)
);
CREATE INDEX idx_wa_horarios_medico_id ON wa_horarios(medico_id);
ALTER TABLE wa_horarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_horarios_select" ON wa_horarios FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "wa_horarios_insert" ON wa_horarios FOR INSERT WITH CHECK (auth.uid() = medico_id);
CREATE POLICY "wa_horarios_update" ON wa_horarios FOR UPDATE USING (auth.uid() = medico_id);
CREATE POLICY "wa_horarios_delete" ON wa_horarios FOR DELETE USING (auth.uid() = medico_id);

-- ── wa_excepciones: feriados / vacaciones / horarios especiales ──────────────
-- kind en inglés A PROPÓSITO: el motor de slots (src/lib/turnos/slots.ts) se porta
-- 1:1 del origen y consume estos literales sin capa de mapeo.
CREATE TABLE wa_excepciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('closed', 'custom', 'open')),
  ranges JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{"open":"HH:MM","close":"HH:MM"}] solo en 'custom'
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX idx_wa_excepciones_medico_fecha ON wa_excepciones(medico_id, start_date);
ALTER TABLE wa_excepciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_excepciones_select" ON wa_excepciones FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "wa_excepciones_insert" ON wa_excepciones FOR INSERT WITH CHECK (auth.uid() = medico_id);
CREATE POLICY "wa_excepciones_update" ON wa_excepciones FOR UPDATE USING (auth.uid() = medico_id);
CREATE POLICY "wa_excepciones_delete" ON wa_excepciones FOR DELETE USING (auth.uid() = medico_id);

-- ── wa_turnos: turnos agendados ───────────────────────────────────────────────
CREATE TABLE wa_turnos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contacto_id UUID REFERENCES wa_contactos(id) ON DELETE SET NULL,
  servicio_id UUID REFERENCES wa_servicios(id) ON DELETE SET NULL,
  paciente_telefono TEXT NOT NULL,  -- candado de cancelación: solo el dueño del número
  paciente_nombre TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  estado TEXT NOT NULL DEFAULT 'reservado'
    CHECK (estado IN ('reservado', 'confirmado', 'cancelado', 'completado', 'ausente')),
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX idx_wa_turnos_medico_id ON wa_turnos(medico_id);
CREATE INDEX idx_wa_turnos_medico_start ON wa_turnos(medico_id, starts_at);
CREATE INDEX idx_wa_turnos_contacto_id ON wa_turnos(contacto_id);
CREATE INDEX idx_wa_turnos_telefono ON wa_turnos(medico_id, paciente_telefono);

-- Anti-overbooking a nivel base: dos turnos NO cancelados del mismo médico no
-- pueden solaparse. Atrapa la carrera entre dos reservas simultáneas que el
-- chequeo en app no ve. Violación = SQLSTATE 23P01 (exclusion_violation).
ALTER TABLE wa_turnos ADD CONSTRAINT wa_turnos_sin_solape
  EXCLUDE USING gist (medico_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (estado <> 'cancelado');

ALTER TABLE wa_turnos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_turnos_select" ON wa_turnos FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "wa_turnos_insert" ON wa_turnos FOR INSERT WITH CHECK (auth.uid() = medico_id);
CREATE POLICY "wa_turnos_update" ON wa_turnos FOR UPDATE USING (auth.uid() = medico_id);
CREATE POLICY "wa_turnos_delete" ON wa_turnos FOR DELETE USING (auth.uid() = medico_id);

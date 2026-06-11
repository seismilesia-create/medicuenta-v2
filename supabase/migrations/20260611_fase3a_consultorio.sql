-- ============================================================================
-- Fase 3A (parte 1) — motor del consultorio
-- Spec: docs/superpowers/specs/2026-06-11-fase3-panel-consultorio-design.md §4
-- Molde MediCuenta: RLS auth.uid()=medico_id (4 policies), índice por medico_id.
-- El bot escribe via service-role (bypass RLS) filtrando medico_id a mano.
-- ============================================================================

-- ── wa_sobreturnos: lista del día SIN hora (D3) — solo los crea el panel ─────
CREATE TABLE wa_sobreturnos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  paciente_nombre TEXT NOT NULL,
  paciente_apellido TEXT NOT NULL,
  paciente_dni TEXT,
  paciente_obra_social TEXT,
  paciente_telefono TEXT,
  cobro TEXT NOT NULL CHECK (cobro IN ('particular', 'sin_cargo')),
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'atendido', 'no_vino', 'cancelado')),
  notas TEXT,
  creado_por UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_sobreturnos_medico_fecha ON wa_sobreturnos(medico_id, fecha);
ALTER TABLE wa_sobreturnos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_sobreturnos_select" ON wa_sobreturnos FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "wa_sobreturnos_insert" ON wa_sobreturnos FOR INSERT WITH CHECK (auth.uid() = medico_id);
CREATE POLICY "wa_sobreturnos_update" ON wa_sobreturnos FOR UPDATE USING (auth.uid() = medico_id);
CREATE POLICY "wa_sobreturnos_delete" ON wa_sobreturnos FOR DELETE USING (auth.uid() = medico_id);

-- ── wa_pacientes: la base que se arma sola; el DNI unifica (D7) ──────────────
CREATE TABLE wa_pacientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dni TEXT NOT NULL,
  nombre TEXT,
  apellido TEXT,
  obra_social TEXT,
  telefonos JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (medico_id, dni)
);
CREATE INDEX idx_wa_pacientes_medico_id ON wa_pacientes(medico_id);
CREATE INDEX idx_wa_pacientes_medico_apellido ON wa_pacientes(medico_id, apellido);
ALTER TABLE wa_pacientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_pacientes_select" ON wa_pacientes FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "wa_pacientes_insert" ON wa_pacientes FOR INSERT WITH CHECK (auth.uid() = medico_id);
CREATE POLICY "wa_pacientes_update" ON wa_pacientes FOR UPDATE USING (auth.uid() = medico_id);
CREATE POLICY "wa_pacientes_delete" ON wa_pacientes FOR DELETE USING (auth.uid() = medico_id);

-- ── wa_os_suspendidas: fuente provisoria manual, "enchufable" al círculo (D9) ─
CREATE TABLE wa_os_suspendidas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre_os TEXT NOT NULL,
  nota TEXT,
  fuente TEXT NOT NULL DEFAULT 'manual' CHECK (fuente IN ('manual', 'circulo')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (medico_id, nombre_os)
);
CREATE INDEX idx_wa_os_suspendidas_medico_id ON wa_os_suspendidas(medico_id);
ALTER TABLE wa_os_suspendidas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_os_suspendidas_select" ON wa_os_suspendidas FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "wa_os_suspendidas_insert" ON wa_os_suspendidas FOR INSERT WITH CHECK (auth.uid() = medico_id);
CREATE POLICY "wa_os_suspendidas_update" ON wa_os_suspendidas FOR UPDATE USING (auth.uid() = medico_id);
CREATE POLICY "wa_os_suspendidas_delete" ON wa_os_suspendidas FOR DELETE USING (auth.uid() = medico_id);

-- ── wa_bitacora: trazas estructuradas (comida del futuro orquestador, §10/§12) ─
CREATE TABLE wa_bitacora (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  origen TEXT NOT NULL CHECK (origen IN ('agente', 'panel', 'webhook', 'gcal', 'mp')),
  nivel TEXT NOT NULL CHECK (nivel IN ('info', 'error')),
  evento TEXT NOT NULL,
  detalle JSONB NOT NULL DEFAULT '{}'::jsonb,
  conversacion_id UUID REFERENCES wa_conversaciones(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_bitacora_medico_created ON wa_bitacora(medico_id, created_at DESC);
ALTER TABLE wa_bitacora ENABLE ROW LEVEL SECURITY;
-- Lectura del médico; el panel (sesión) también inserta; el bot va por service-role.
CREATE POLICY "wa_bitacora_select" ON wa_bitacora FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "wa_bitacora_insert" ON wa_bitacora FOR INSERT WITH CHECK (auth.uid() = medico_id);

-- ── wa_turnos: trazabilidad (D2) + teléfono opcional para turno manual (§5.2) ─
ALTER TABLE wa_turnos
  ADD COLUMN origen TEXT NOT NULL DEFAULT 'bot' CHECK (origen IN ('bot', 'panel')),
  ADD COLUMN creado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE wa_turnos ALTER COLUMN paciente_telefono DROP NOT NULL;

-- ── wa_conversaciones: último mensaje DEL PACIENTE (semáforo/ventana 24h, D13) ─
ALTER TABLE wa_conversaciones ADD COLUMN last_paciente_at TIMESTAMPTZ;
UPDATE wa_conversaciones c SET last_paciente_at = (
  SELECT max(m.created_at) FROM wa_mensajes m
  WHERE m.conversacion_id = c.id AND m.direccion = 'entrante'
);

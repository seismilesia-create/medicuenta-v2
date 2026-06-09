-- ============================================================================
-- WhatsApp Fase 0 — tablas base, re-keyeadas a medico_id (RLS auth.uid()=medico_id)
-- ============================================================================

-- ── wa_canales: conexión del número de WhatsApp de cada médico ──────────────
CREATE TABLE wa_canales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number_id TEXT NOT NULL UNIQUE,
  display_phone_number TEXT,
  access_token_cifrado TEXT NOT NULL,
  numero_personal TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'conectado' CHECK (estado IN ('conectado', 'pendiente')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_canales_medico_id ON wa_canales(medico_id);
ALTER TABLE wa_canales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_canales_select" ON wa_canales FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "wa_canales_insert" ON wa_canales FOR INSERT WITH CHECK (auth.uid() = medico_id);
CREATE POLICY "wa_canales_update" ON wa_canales FOR UPDATE USING (auth.uid() = medico_id);
CREATE POLICY "wa_canales_delete" ON wa_canales FOR DELETE USING (auth.uid() = medico_id);

-- ── wa_contactos: pacientes que escriben al bot ─────────────────────────────
CREATE TABLE wa_contactos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  telefono TEXT NOT NULL,
  nombre TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (medico_id, telefono)
);
CREATE INDEX idx_wa_contactos_medico_id ON wa_contactos(medico_id);
ALTER TABLE wa_contactos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_contactos_select" ON wa_contactos FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "wa_contactos_insert" ON wa_contactos FOR INSERT WITH CHECK (auth.uid() = medico_id);
CREATE POLICY "wa_contactos_update" ON wa_contactos FOR UPDATE USING (auth.uid() = medico_id);
CREATE POLICY "wa_contactos_delete" ON wa_contactos FOR DELETE USING (auth.uid() = medico_id);

-- ── wa_conversaciones: hilo de WhatsApp por paciente ────────────────────────
CREATE TABLE wa_conversaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contacto_id UUID NOT NULL REFERENCES wa_contactos(id) ON DELETE CASCADE,
  estado TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
  bot_pausado BOOLEAN NOT NULL DEFAULT false,
  necesita_humano BOOLEAN NOT NULL DEFAULT false,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_conversaciones_medico_id ON wa_conversaciones(medico_id);
CREATE INDEX idx_wa_conversaciones_contacto_id ON wa_conversaciones(contacto_id);
ALTER TABLE wa_conversaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_conversaciones_select" ON wa_conversaciones FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "wa_conversaciones_insert" ON wa_conversaciones FOR INSERT WITH CHECK (auth.uid() = medico_id);
CREATE POLICY "wa_conversaciones_update" ON wa_conversaciones FOR UPDATE USING (auth.uid() = medico_id);
CREATE POLICY "wa_conversaciones_delete" ON wa_conversaciones FOR DELETE USING (auth.uid() = medico_id);

-- ── wa_mensajes: mensajes del hilo ──────────────────────────────────────────
CREATE TABLE wa_mensajes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversacion_id UUID NOT NULL REFERENCES wa_conversaciones(id) ON DELETE CASCADE,
  direccion TEXT NOT NULL CHECK (direccion IN ('entrante', 'saliente')),
  origen TEXT NOT NULL CHECK (origen IN ('ia', 'humano', 'paciente', 'medico')),
  contenido TEXT NOT NULL,
  wamid TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_mensajes_medico_id ON wa_mensajes(medico_id);
CREATE INDEX idx_wa_mensajes_conversacion_id ON wa_mensajes(conversacion_id);
ALTER TABLE wa_mensajes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_mensajes_select" ON wa_mensajes FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "wa_mensajes_insert" ON wa_mensajes FOR INSERT WITH CHECK (auth.uid() = medico_id);
CREATE POLICY "wa_mensajes_update" ON wa_mensajes FOR UPDATE USING (auth.uid() = medico_id);
CREATE POLICY "wa_mensajes_delete" ON wa_mensajes FOR DELETE USING (auth.uid() = medico_id);

-- ── wa_config_agente: configuración del agente por médico ───────────────────
CREATE TABLE wa_config_agente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  system_prompt TEXT,
  tono TEXT,
  saludo TEXT,
  faqs JSONB NOT NULL DEFAULT '[]'::jsonb,
  precio_receta_default DECIMAL(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_config_agente_medico_id ON wa_config_agente(medico_id);
ALTER TABLE wa_config_agente ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_config_agente_select" ON wa_config_agente FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "wa_config_agente_insert" ON wa_config_agente FOR INSERT WITH CHECK (auth.uid() = medico_id);
CREATE POLICY "wa_config_agente_update" ON wa_config_agente FOR UPDATE USING (auth.uid() = medico_id);
CREATE POLICY "wa_config_agente_delete" ON wa_config_agente FOR DELETE USING (auth.uid() = medico_id);

-- ── wa_eventos_webhook: dedupe/idempotencia (escribe el sistema, service-role) ─
CREATE TABLE wa_eventos_webhook (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wamid TEXT NOT NULL UNIQUE,
  medico_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  procesado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE wa_eventos_webhook ENABLE ROW LEVEL SECURITY;
-- Sólo lectura para el médico dueño; las inserciones van por service-role (bypass RLS).
CREATE POLICY "wa_eventos_webhook_select" ON wa_eventos_webhook FOR SELECT USING (auth.uid() = medico_id);

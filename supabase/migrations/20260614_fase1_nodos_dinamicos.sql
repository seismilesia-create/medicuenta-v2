-- ============================================================================
-- Fase 1 — Arquitectura de Nodos Dinámicos para WhatsApp (PRP-006)
-- Espejo versionado de la migración aplicada vía Supabase MCP (apply_migration).
-- ADITIVA e IDEMPOTENTE (ver docs/REGLAS-ACTUALIZACION.md). NO toca wa_canales
-- (coexiste durante el piloto). El seed del piloto va aparte (no es esquema).
-- ============================================================================

-- ── wa_nodos: flota de números virtuales (infraestructura; solo service-role) ─
-- ~80% de wa_canales (número + token cifrado + estado) + lo nuevo: capacidad,
-- contador de médicos, quality_rating, y número COMPARTIDO (sin dueño médico).
CREATE TABLE IF NOT EXISTS wa_nodos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number_id TEXT NOT NULL UNIQUE,          -- id de Meta del número del nodo
  numero_whatsapp TEXT NOT NULL,                 -- E.164 dialable, para wa.me/<este>
  display_phone_number TEXT,
  access_token_cifrado TEXT NOT NULL,            -- mismo AES-256-GCM que wa_canales
  proveedor TEXT,                                -- 'zadarma' | 'twilio' | 'meta-test' | ...
  estado TEXT NOT NULL DEFAULT 'activo'
    CHECK (estado IN ('activo','restringido','en_revision','reserva')),
  capacidad_max INT NOT NULL DEFAULT 50,
  medicos_activos INT NOT NULL DEFAULT 0,        -- denormalizado para asignación
  quality_rating TEXT,                           -- 'high'|'medium'|'low' (Meta API; fase posterior)
  verificado_en TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE wa_nodos ENABLE ROW LEVEL SECURITY;
-- Tabla de infraestructura: RLS habilitada SIN policy = denegado a clientes
-- autenticados; el acceso es solo por service-role (igual que las inserciones
-- de wa_eventos_webhook). El token cifrado del nodo nunca se expone al cliente.

-- ── wa_asignaciones: médico → nodo + link público estable ───────────────────
CREATE TABLE IF NOT EXISTS wa_asignaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nodo_id UUID NOT NULL REFERENCES wa_nodos(id),
  slug_publico TEXT NOT NULL UNIQUE,             -- 'dr-perez' → /c/dr-perez
  numero_personal TEXT NOT NULL,                 -- para clasificar remitente médico vs paciente
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (medico_id)                             -- 1 asignación activa por médico (este PRP)
);
CREATE INDEX IF NOT EXISTS idx_wa_asignaciones_medico_id ON wa_asignaciones(medico_id);
CREATE INDEX IF NOT EXISTS idx_wa_asignaciones_slug ON wa_asignaciones(slug_publico);
ALTER TABLE wa_asignaciones ENABLE ROW LEVEL SECURITY;
-- El médico lee SU asignación (para mostrar su link); la escritura va por service-role.
DROP POLICY IF EXISTS "wa_asignaciones_select" ON wa_asignaciones;
CREATE POLICY "wa_asignaciones_select" ON wa_asignaciones FOR SELECT USING (auth.uid() = medico_id);

-- ── wa_ruteo_conversacion: (nodo, paciente) → médico ────────────────────────
-- Cierra el HUECO del informe: el [ID:slug] del link solo viaja en el 1.er
-- mensaje; del 2.º en adelante el paciente escribe libre. Esta tabla persiste el
-- vínculo (se escribe en el 1.er mensaje, se lee en los siguientes).
CREATE TABLE IF NOT EXISTS wa_ruteo_conversacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number_id TEXT NOT NULL,                 -- nodo por el que entró
  telefono_paciente TEXT NOT NULL,               -- normalizado (normalizeRecipient)
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (phone_number_id, telefono_paciente)    -- 1 médico activo por (nodo, paciente)
);
CREATE INDEX IF NOT EXISTS idx_wa_ruteo_medico ON wa_ruteo_conversacion(medico_id);
ALTER TABLE wa_ruteo_conversacion ENABLE ROW LEVEL SECURITY;
-- Sistema-only (service-role escribe). El médico puede leer las suyas (panel).
DROP POLICY IF EXISTS "wa_ruteo_select" ON wa_ruteo_conversacion;
CREATE POLICY "wa_ruteo_select" ON wa_ruteo_conversacion FOR SELECT USING (auth.uid() = medico_id);

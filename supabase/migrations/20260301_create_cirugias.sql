-- Tabla cirugias
CREATE TABLE cirugias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Campos basicos (obligatorios)
  nombre_paciente TEXT NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  obra_social TEXT NOT NULL,
  codigo_practica TEXT NOT NULL,
  nombre_practica TEXT NOT NULL,
  honorarios DECIMAL(12,2) NOT NULL DEFAULT 0,
  gastos DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'presentada', 'aprobada', 'debitada')),
  observaciones TEXT,

  -- Equipo quirurgico (nullable)
  ayudante TEXT,
  anestesiologo TEXT,
  instrumentador TEXT,

  -- Anestesia y lugar (nullable)
  tipo_anestesia TEXT,
  duracion_minutos INTEGER,
  sanatorio TEXT,
  sala TEXT,

  -- Practicas adicionales
  practicas_adicionales JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_calculado DECIMAL(12,2) NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_cirugias_medico_id ON cirugias(medico_id);
CREATE INDEX idx_cirugias_fecha ON cirugias(fecha DESC);
CREATE INDEX idx_cirugias_estado ON cirugias(estado);
CREATE INDEX idx_cirugias_obra_social ON cirugias(obra_social);

-- RLS
ALTER TABLE cirugias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cirugias_select" ON cirugias
  FOR SELECT USING (auth.uid() = medico_id);

CREATE POLICY "cirugias_insert" ON cirugias
  FOR INSERT WITH CHECK (auth.uid() = medico_id);

CREATE POLICY "cirugias_update" ON cirugias
  FOR UPDATE USING (auth.uid() = medico_id);

CREATE POLICY "cirugias_delete" ON cirugias
  FOR DELETE USING (auth.uid() = medico_id);

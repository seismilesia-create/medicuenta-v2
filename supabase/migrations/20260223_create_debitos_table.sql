-- Create debitos table
CREATE TABLE IF NOT EXISTS debitos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  orden_id UUID REFERENCES ordenes(id) ON DELETE SET NULL,
  liquidacion_id UUID REFERENCES liquidaciones(id) ON DELETE SET NULL,
  motivo TEXT NOT NULL CHECK (motivo IN ('falta_token', 'falta_firma', 'falta_diagnostico', 'no_autorizada', 'error_codigo', 'otro')),
  motivo_detalle TEXT,
  monto DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (monto >= 0),
  refacturable BOOLEAN NOT NULL DEFAULT false,
  refacturado BOOLEAN NOT NULL DEFAULT false,
  fecha DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_debitos_medico_id ON debitos(medico_id);
CREATE INDEX IF NOT EXISTS idx_debitos_fecha ON debitos(fecha);
CREATE INDEX IF NOT EXISTS idx_debitos_motivo ON debitos(motivo);
CREATE INDEX IF NOT EXISTS idx_debitos_refacturable ON debitos(refacturable) WHERE refacturable = true;

-- Enable Row Level Security
ALTER TABLE debitos ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own debitos"
  ON debitos FOR SELECT
  USING (auth.uid() = medico_id);

CREATE POLICY "Users can insert their own debitos"
  ON debitos FOR INSERT
  WITH CHECK (auth.uid() = medico_id);

CREATE POLICY "Users can update their own debitos"
  ON debitos FOR UPDATE
  USING (auth.uid() = medico_id);

CREATE POLICY "Users can delete their own debitos"
  ON debitos FOR DELETE
  USING (auth.uid() = medico_id);

-- Add comments for documentation
COMMENT ON TABLE debitos IS 'Registra los débitos aplicados por obras sociales a los médicos';
COMMENT ON COLUMN debitos.motivo IS 'Motivo del débito: falta_token, falta_firma, falta_diagnostico, no_autorizada, error_codigo, otro';
COMMENT ON COLUMN debitos.refacturable IS 'Indica si el débito puede corregirse y refacturarse';
COMMENT ON COLUMN debitos.refacturado IS 'Indica si el débito ya fue corregido y refacturado';

-- ============================================================================
-- WhatsApp Fase 1 — cobro de recetas: mp_conexiones, recetas, bucket recetas
-- ============================================================================

-- ── mp_conexiones: OAuth/token de MercadoPago por médico (cifrado) ──────────
CREATE TABLE mp_conexiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  mp_user_id TEXT NOT NULL,
  access_token_cifrado TEXT NOT NULL,
  refresh_token_cifrado TEXT,
  expires_at TIMESTAMPTZ,
  estado TEXT NOT NULL DEFAULT 'conectado' CHECK (estado IN ('conectado', 'reconectar')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mp_conexiones_medico_id ON mp_conexiones(medico_id);
ALTER TABLE mp_conexiones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mp_conexiones_select" ON mp_conexiones FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "mp_conexiones_insert" ON mp_conexiones FOR INSERT WITH CHECK (auth.uid() = medico_id);
CREATE POLICY "mp_conexiones_update" ON mp_conexiones FOR UPDATE USING (auth.uid() = medico_id);
CREATE POLICY "mp_conexiones_delete" ON mp_conexiones FOR DELETE USING (auth.uid() = medico_id);

-- ── recetas: receta + estado de cobro ────────────────────────────────────────
CREATE TABLE recetas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contacto_id UUID REFERENCES wa_contactos(id) ON DELETE SET NULL,
  paciente_nombre TEXT NOT NULL DEFAULT '',
  paciente_dni TEXT NOT NULL DEFAULT '',
  paciente_telefono TEXT,
  pdf_path TEXT NOT NULL,
  nro_receta TEXT,
  monto DECIMAL(12,2),
  estado TEXT NOT NULL DEFAULT 'pendiente_pago'
    CHECK (estado IN ('pendiente_datos', 'pendiente_pago', 'pagada', 'entregada', 'vencida')),
  mp_preference_id TEXT,
  mp_payment_id TEXT,
  datos_ocr JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_recetas_medico_nro ON recetas(medico_id, nro_receta)
  WHERE nro_receta IS NOT NULL AND nro_receta <> '';
CREATE INDEX idx_recetas_medico_id ON recetas(medico_id);
CREATE INDEX idx_recetas_estado ON recetas(medico_id, estado);
CREATE INDEX idx_recetas_dni ON recetas(medico_id, paciente_dni);
CREATE INDEX idx_recetas_telefono ON recetas(medico_id, paciente_telefono);
ALTER TABLE recetas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recetas_select" ON recetas FOR SELECT USING (auth.uid() = medico_id);
CREATE POLICY "recetas_insert" ON recetas FOR INSERT WITH CHECK (auth.uid() = medico_id);
CREATE POLICY "recetas_update" ON recetas FOR UPDATE USING (auth.uid() = medico_id);
CREATE POLICY "recetas_delete" ON recetas FOR DELETE USING (auth.uid() = medico_id);

-- ── bucket privado para los PDFs (mismo patrón que 'comprobantes') ──────────
insert into storage.buckets (id, name, public) values ('recetas', 'recetas', false)
on conflict (id) do nothing;

create policy "recetas_storage_select" on storage.objects for select
  using (bucket_id = 'recetas' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "recetas_storage_insert" on storage.objects for insert
  with check (bucket_id = 'recetas' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "recetas_storage_update" on storage.objects for update
  using (bucket_id = 'recetas' and (storage.foldername(name))[1] = auth.uid()::text);

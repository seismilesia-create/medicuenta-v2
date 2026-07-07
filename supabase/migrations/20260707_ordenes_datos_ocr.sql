-- OCR crudo de la orden (para reprocesar sin re-fotografiar cuando haya
-- modelos de otras OS). Aditiva, nullable → segura sobre datos existentes.
alter table public.ordenes
  add column if not exists datos_ocr jsonb;

comment on column public.ordenes.datos_ocr is
  'OCR crudo { version, datos } de la foto de la orden. Habilita reproceso.';

-- Fase A orden de consulta OSEP: constancia de la receta saldada por orden de consulta
-- (en vez de MercadoPago). Columnas nullable → migración aditiva segura.
alter table public.recetas
  add column if not exists forma_pago text
    check (forma_pago is null or forma_pago in ('mercadopago','orden_consulta','efectivo','transferencia')),
  add column if not exists nro_orden_consulta text,
  add column if not exists liberada_por uuid references auth.users(id),
  add column if not exists liberada_at timestamptz;

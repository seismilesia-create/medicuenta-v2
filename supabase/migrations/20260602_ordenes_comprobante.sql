-- Foto de la orden como comprobante/prueba.
-- 1) Columna con la RUTA del archivo en Storage (no la imagen en sí).
alter table ordenes
  add column if not exists imagen_comprobante text;

comment on column ordenes.imagen_comprobante is 'Ruta en Storage (bucket comprobantes) de la foto de la orden. Formato: <medico_id>/<uuid>.jpg';

-- 2) Bucket PRIVADO para los comprobantes.
insert into storage.buckets (id, name, public)
values ('comprobantes', 'comprobantes', false)
on conflict (id) do nothing;

-- 3) Políticas: cada médico gestiona SOLO su carpeta (primer segmento de la ruta = su uid).
drop policy if exists "comprobantes_select_own" on storage.objects;
create policy "comprobantes_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'comprobantes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "comprobantes_insert_own" on storage.objects;
create policy "comprobantes_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'comprobantes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "comprobantes_delete_own" on storage.objects;
create policy "comprobantes_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'comprobantes' and (storage.foldername(name))[1] = auth.uid()::text);

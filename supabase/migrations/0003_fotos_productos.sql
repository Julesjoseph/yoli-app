-- Fotos de productos: columna en products y carpeta pública en Storage.
-- Cada negocio sube sus fotos dentro de una carpeta con su id: productos/<business_id>/<archivo>.jpg

alter table products add column if not exists image_url text;

insert into storage.buckets (id, name, public)
values ('productos', 'productos', true)
on conflict (id) do nothing;

-- Cualquiera puede ver las fotos (el bucket es público); solo dueño/gerente sube o cambia las de su negocio.
create policy "fotos: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'productos' and is_manager(((storage.foldername(name))[1])::uuid));
create policy "fotos: cambiar" on storage.objects for update to authenticated
  using (bucket_id = 'productos' and is_manager(((storage.foldername(name))[1])::uuid));
create policy "fotos: borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'productos' and is_manager(((storage.foldername(name))[1])::uuid));

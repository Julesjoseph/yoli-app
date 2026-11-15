-- YOLI APP · Sincronización al instante (Supabase Realtime)
-- Avisa a los teléfonos y al panel en cuanto cambia algo en estas tablas.
-- Cada usuario solo recibe los cambios de su negocio (se respetan las reglas RLS).
-- Se puede correr más de una vez sin problema.

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array[
    'orders', 'expenses', 'inventory_movements', 'products', 'categories', 'ingredients',
    'recipe_items', 'platform_commissions', 'locations'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

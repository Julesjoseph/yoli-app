-- YOLI APP · Combos con acompañantes.
-- Un producto (el combo) puede:
--   * incluir otros productos fijos (group_name vacío), p. ej. "Hamburguesa clásica";
--   * tener grupos para elegir uno (group_name = 'Acompañante', 'Bebida'...), con precio extra opcional.
-- Al vender, el inventario descuenta la receta del combo + la de lo incluido + la de lo elegido.
-- Se puede correr más de una vez sin problema.

create table if not exists combo_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,       -- el combo
  item_product_id uuid not null references products(id) on delete cascade,  -- lo que trae / se puede elegir
  group_name text not null default '',                                      -- '' = incluido siempre
  extra_price numeric(12,2) not null default 0 check (extra_price >= 0),
  sort_order int not null default 0
);
create index if not exists combo_items_product on combo_items (product_id);

alter table combo_items enable row level security;
drop policy if exists "ver combos" on combo_items;
create policy "ver combos" on combo_items for select using (is_member(business_id));
drop policy if exists "gestionar combos" on combo_items;
create policy "gestionar combos" on combo_items for all
  using (is_manager(business_id)) with check (is_manager(business_id));

-- Que llegue al instante a los otros equipos (si existe la publicación de tiempo real).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'combo_items') then
    alter publication supabase_realtime add table combo_items;
  end if;
end $$;

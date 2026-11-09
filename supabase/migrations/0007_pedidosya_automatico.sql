-- YOLI APP · Pedidos de PedidosYa automáticos (Partner API de Delivery Hero)
-- La función de Supabase "pedidosya-webhook" recibe cada aviso de PedidosYa y
-- llama a ingest_pedidosya_order(), que guarda el pedido como venta del canal
-- "pedidosya", descuenta el inventario según la receta y, si se cancela, lo anula.
-- Se puede correr más de una vez sin problema.

-- Qué tienda de PedidosYa (vendor / store) corresponde a qué local de YOLI.
create table if not exists delivery_links (
  platform_id text not null references delivery_platforms(id),
  vendor_id text not null,                  -- id de la tienda en PedidosYa (client.id o client.store_id)
  business_id uuid not null references businesses(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (platform_id, vendor_id)
);
alter table delivery_links enable row level security;
drop policy if exists "ver enlaces delivery" on delivery_links;
create policy "ver enlaces delivery" on delivery_links for select using (is_member(business_id));
drop policy if exists "gestionar enlaces delivery" on delivery_links;
create policy "gestionar enlaces delivery" on delivery_links for all
  using (is_manager(business_id)) with check (is_manager(business_id));

-- Registro de cada aviso recibido (para revisar si algo no entró).
create table if not exists delivery_events (
  id bigint generated always as identity primary key,
  platform_id text not null,
  external_id text,
  status text,
  result text,
  payload jsonb not null,
  received_at timestamptz not null default now()
);
alter table delivery_events enable row level security; -- solo el servidor lo usa

create or replace function ingest_pedidosya_order(p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_ext text := p ->> 'order_id';
  v_status text := upper(coalesce(p ->> 'status', 'RECEIVED'));
  v_link delivery_links;
  v_order uuid;
  v_gross numeric;
  v_rate numeric;
  v_comm numeric;
  v_at timestamptz;
  v_result text;
begin
  if v_ext is null then
    v_result := 'sin order_id';
  else
    select * into v_link from delivery_links
     where platform_id = 'pedidosya'
       and vendor_id in (p #>> '{client,id}', p #>> '{client,store_id}', p #>> '{client,external_partner_config_id}')
     limit 1;

    if v_link.business_id is null then
      v_result := 'tienda no enlazada: ' || coalesce(p #>> '{client,id}', '?') || ' / ' || coalesce(p #>> '{client,store_id}', '?');
    else
      -- Mismo pedido => mismo id (los avisos repetidos no duplican la venta).
      v_order := md5('pedidosya:' || v_ext)::uuid;

      if v_status in ('CANCELLED', 'CANCELED') then
        update orders set status = 'anulada' where id = v_order;
        delete from inventory_movements where order_id = v_order; -- el inventario vuelve
        v_result := 'anulada';
      elsif exists (select 1 from orders where id = v_order) then
        v_result := 'ya existía (' || v_status || ')';
      else
        -- Total de la comida (sin envío): subtotal de PedidosYa o suma de los productos.
        select coalesce(nullif((p #>> '{payment,sub_total}')::numeric, 0),
                        sum(coalesce((i #>> '{pricing,total_price}')::numeric,
                                     (i #>> '{pricing,unit_price}')::numeric * coalesce((i #>> '{pricing,quantity}')::numeric, 1))),
                        0)
               - coalesce((p #>> '{payment,discount}')::numeric, 0)
          into v_gross
          from jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb)) i
         where coalesce(i ->> 'status', '') not in ('NOT_FOUND');
        v_gross := round(greatest(v_gross, 0), 2);
        select commission_rate into v_rate from platform_commissions
         where business_id = v_link.business_id and platform_id = 'pedidosya';
        v_comm := round(v_gross * coalesce(v_rate, 0), 2);
        v_at := coalesce((p #>> '{sys,created_at}')::timestamptz, now());

        insert into orders (id, business_id, location_id, channel, external_ref, status, subtotal, itbis, tip_law,
                            total, platform_commission, net_income, payment_method, created_at)
        values (v_order, v_link.business_id, v_link.location_id, 'pedidosya',
                coalesce(p ->> 'order_code', v_ext), 'pagada',
                round(v_gross / 1.18, 2), v_gross - round(v_gross / 1.18, 2), 0,
                v_gross, v_comm, v_gross - v_comm, 'plataforma', v_at);

        -- Productos: se unen por SKU (= id del producto en YOLI) o por nombre.
        insert into order_items (id, order_id, product_id, name, unit_price, quantity)
        select md5('pedidosya:' || v_ext || ':' || n)::uuid, v_order, pr.id,
               coalesce(i ->> 'name', pr.name, 'Producto'),
               coalesce((i #>> '{pricing,unit_price}')::numeric, 0),
               greatest(1, round(coalesce((i #>> '{pricing,quantity}')::numeric, 1)))::int
          from jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb)) with ordinality as x(i, n)
          left join lateral (
            select id, name from products
             where business_id = v_link.business_id
               and (id::text = i ->> 'sku' or lower(trim(name)) = lower(trim(i ->> 'name')))
             order by (id::text = i ->> 'sku') desc
             limit 1
          ) pr on true
         where coalesce(i ->> 'status', '') not in ('NOT_FOUND');

        -- Inventario según la receta de cada producto.
        insert into inventory_movements (id, business_id, location_id, ingredient_id, quantity, reason, order_id, created_at)
        select gen_random_uuid(), v_link.business_id, v_link.location_id, ri.ingredient_id,
               -sum(ri.quantity * oi.quantity), 'venta', v_order, v_at
          from order_items oi join recipe_items ri on ri.product_id = oi.product_id
         where oi.order_id = v_order
         group by ri.ingredient_id;

        v_result := 'creada';
      end if;
    end if;
  end if;

  insert into delivery_events (platform_id, external_id, status, result, payload)
  values ('pedidosya', v_ext, v_status, v_result, p);
  return v_result;
end $$;

-- Solo el receptor del servidor (service_role) puede llamarla; la app no.
revoke all on function ingest_pedidosya_order(jsonb) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function ingest_pedidosya_order(jsonb) from anon, authenticated;
  end if;
end $$;

-- YOLI APP · ITBIS exento solo en PedidosYa / Uber Eats.
-- Cada producto puede venderse sin ITBIS en delivery aunque en el local lo lleve.
-- También actualiza el receptor automático de PedidosYa para respetarlo.
-- Se puede correr más de una vez sin problema (después de 0007).

alter table products add column if not exists delivery_itbis_exempt boolean not null default false;

-- El receptor de PedidosYa solo se actualiza si ya corriste 0007 (si no, se salta).
do $outer$
begin
  if to_regclass('public.delivery_links') is null then
    raise notice 'PedidosYa automático (0007) no está instalado: solo se agregó la opción de ITBIS.';
    return;
  end if;
  execute $fn$
create or replace function ingest_pedidosya_order(p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_ext text := p ->> 'order_id';
  v_status text := upper(coalesce(p ->> 'status', 'RECEIVED'));
  v_link delivery_links;
  v_order uuid;
  v_gross numeric;
  v_items numeric;
  v_exempt numeric;
  v_sub numeric;
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

        -- Parte de la comida que va exenta de ITBIS en delivery (productos marcados en YOLI).
        select coalesce(sum(t.amount), 0), coalesce(sum(t.amount) filter (where t.exempt), 0)
          into v_items, v_exempt
          from (
            select coalesce((i #>> '{pricing,total_price}')::numeric,
                            (i #>> '{pricing,unit_price}')::numeric * coalesce((i #>> '{pricing,quantity}')::numeric, 1), 0) as amount,
                   coalesce(pr.delivery_itbis_exempt, false) as exempt
              from jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb)) i
              left join lateral (
                select delivery_itbis_exempt from products
                 where business_id = v_link.business_id
                   and (id::text = i ->> 'sku' or lower(trim(name)) = lower(trim(i ->> 'name')))
                 order by (id::text = i ->> 'sku') desc
                 limit 1
              ) pr on true
             where coalesce(i ->> 'status', '') not in ('NOT_FOUND')
          ) t;
        v_exempt := case when v_items > 0 then v_gross * v_exempt / v_items else 0 end;
        v_sub := round(v_exempt + (v_gross - v_exempt) / 1.18, 2);
        select commission_rate into v_rate from platform_commissions
         where business_id = v_link.business_id and platform_id = 'pedidosya';
        v_comm := round(v_gross * coalesce(v_rate, 0), 2);
        v_at := coalesce((p #>> '{sys,created_at}')::timestamptz, now());

        insert into orders (id, business_id, location_id, channel, external_ref, status, subtotal, itbis, tip_law,
                            total, platform_commission, net_income, payment_method, created_at)
        values (v_order, v_link.business_id, v_link.location_id, 'pedidosya',
                coalesce(p ->> 'order_code', v_ext), 'pagada',
                v_sub, v_gross - v_sub, 0,
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
end $$
$fn$;
  revoke all on function ingest_pedidosya_order(jsonb) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function ingest_pedidosya_order(jsonb) from anon, authenticated;
  end if;
end $outer$;

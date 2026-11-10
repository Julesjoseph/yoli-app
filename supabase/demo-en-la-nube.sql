-- YOLI APP · Demo en la nube
-- Crea (o vuelve a crear) el "Negocio demo" con un mes de ventas, gastos e
-- inventario de prueba, para la cuenta demo@yoli.app.
--
-- ANTES: Supabase › Authentication › Users › Add user › Create new user
--   Email: demo@yoli.app   Password: YoliDemo-2026   (marca "Auto Confirm User")
--
-- Se puede correr cuantas veces quieras: borra el negocio demo anterior y lo
-- vuelve a llenar con fechas de este mes. NO toca tu negocio real.

do $$
declare
  v_user uuid;
  v_biz uuid;
  v_loc uuid;
  v_cat uuid[];
  v_ing jsonb := '{}'::jsonb;
  v_prod uuid[];
  v_price numeric[];
  v_names text[];
  v_pick int[];
  v_day date;
  v_hours int;
  v_count int;
  v_order uuid;
  v_at timestamptz;
  v_channel text;
  v_pay text;
  v_full numeric;
  v_sub numeric;
  v_disc numeric;
  v_factor numeric;
  v_gross numeric;
  v_subtotal numeric;
  v_tip numeric;
  v_total numeric;
  v_comm numeric;
  v_cash numeric;
  v_qty int;
  v_p int;
  r record;
  i int;
  k int;
  d int;
begin
  select id into v_user from auth.users where email = 'demo@yoli.app';
  if v_user is null then
    raise exception 'Primero crea el usuario demo@yoli.app en Authentication › Users (Add user, Auto Confirm).';
  end if;

  -- Borrar el negocio demo anterior (solo los negocios donde el usuario demo es dueño).
  delete from businesses where id in (select business_id from members where user_id = v_user and role = 'dueno');

  perform setseed(0.2026);

  insert into businesses (name) values ('Negocio demo') returning id into v_biz;
  insert into locations (business_id, name, kind) values (v_biz, 'Local principal', 'mixto') returning id into v_loc;
  insert into members (business_id, user_id, role, display_name) values (v_biz, v_user, 'dueno', 'Demo');
  -- El demo nunca vence (si ya existe la tabla de suscripciones, migración 0008).
  if to_regclass('public.subscriptions') is not null then
    execute 'insert into subscriptions (business_id, status) values ($1, ''activo'')
             on conflict (business_id) do update set status = ''activo'', paid_until = null' using v_biz;
  end if;
  insert into platform_commissions (business_id, platform_id, commission_rate)
    values (v_biz, 'pedidosya', 0.25), (v_biz, 'ubereats', 0.30);
  -- Factura electrónica en modo prueba para el demo (si ya existe, migración 0012).
  update businesses set rnc = '131000001', legal_name = 'Negocio Demo SRL' where id = v_biz;
  if to_regclass('public.einvoice_settings') is not null then
    execute 'insert into einvoice_settings (business_id, provider, environment, enabled) values ($1, ''prueba'', ''prueba'', true)
             on conflict (business_id) do nothing' using v_biz;
  end if;

  -- Menú de ejemplo
  for i in 1..4 loop
    insert into categories (business_id, name, sort_order)
      values (v_biz, (array['Comida rápida', 'Comedor', 'Cafetería', 'Bebidas'])[i], i)
      returning id into r;
    v_cat := v_cat || r.id;
  end loop;

  for r in select * from (values
    ('pan', 'Pan de hamburguesa', 'unidad', 15, 20),
    ('carne', 'Carne molida', 'g', 0.45, 2000),
    ('queso', 'Queso', 'lonja', 8, 30),
    ('papas', 'Papas', 'g', 0.08, 3000),
    ('arroz', 'Arroz', 'g', 0.06, 5000),
    ('pollo', 'Pollo', 'g', 0.25, 3000),
    ('habichuelas', 'Habichuelas', 'g', 0.1, 2000),
    ('cafe', 'Café molido', 'g', 1.2, 500),
    ('leche', 'Leche', 'ml', 0.07, 2000),
    ('refresco', 'Refresco lata', 'unidad', 35, 24),
    ('piezas', 'Pollo frito (piezas)', 'pieza', 38, 16),
    ('platano', 'Plátano verde', 'unidad', 15, 10)
  ) as t(k, name, unit, cost, min) loop
    insert into ingredients (business_id, name, unit, cost_per_unit, min_stock)
      values (v_biz, r.name, r.unit, r.cost, r.min) returning id into v_order;
    v_ing := v_ing || jsonb_build_object(r.k, v_order);
  end loop;

  for r in select * from (values
    ('Hamburguesa clásica', 295, 1, '[["pan",1],["carne",150],["queso",1]]', 3),
    ('Papas fritas', 150, 1, '[["papas",250]]', 1),
    ('Combo hamburguesa', 425, 1, '[["pan",1],["carne",150],["queso",1],["papas",200],["refresco",1]]', 2),
    ('La bandera (arroz, habichuelas y pollo)', 275, 2, '[["arroz",200],["habichuelas",150],["pollo",180]]', 3),
    ('Pollo guisado con arroz', 250, 2, '[["arroz",200],["pollo",200]]', 2),
    ('Café', 75, 3, '[["cafe",12]]', 1),
    ('Café con leche', 110, 3, '[["cafe",12],["leche",150]]', 3),
    ('Refresco', 80, 4, '[["refresco",1]]', 2),
    ('Tostones', 125, 1, '[["platano",1]]', 1),
    ('Pica pollo (2 piezas)', 225, 1, '[["piezas",2]]', 2),
    ('Combo pica pollo', 375, 1, '[["piezas",2]]', 3)
  ) as t(name, price, cat, recipe, weight) loop
    insert into products (business_id, category_id, name, price, itbis_rate)
      values (v_biz, v_cat[r.cat], r.name, r.price, 0.18) returning id into v_order;
    insert into recipe_items (product_id, ingredient_id, quantity)
      select v_order, (v_ing ->> (x ->> 0))::uuid, (x ->> 1)::numeric
      from jsonb_array_elements(r.recipe::jsonb) x;
    v_prod := v_prod || v_order;
    v_price := v_price || r.price::numeric;
    v_names := v_names || r.name;
    for k in 1..r.weight loop
      v_pick := v_pick || array_length(v_prod, 1);
    end loop;
  end loop;

  -- Combo pica pollo: elige acompañante y bebida (si ya existe la tabla de combos, migración 0010).
  if to_regclass('public.combo_items') is not null then
    execute $q$
      insert into combo_items (business_id, product_id, item_product_id, group_name, extra_price, sort_order)
      select $1, c.id, o.id, g.grp, g.extra, g.ord
        from (values ('Acompañante', 'Papas fritas', 0, 1), ('Acompañante', 'Tostones', 0, 2),
                     ('Bebida', 'Refresco', 0, 3), ('Bebida', 'Café', 0, 4)) as g(grp, item, extra, ord)
        join products c on c.business_id = $1 and c.name = 'Combo pica pollo'
        join products o on o.business_id = $1 and o.name = g.item
    $q$ using v_biz;
  end if;

  -- Inventario inicial
  insert into inventory_movements (id, business_id, location_id, ingredient_id, quantity, reason, created_at)
    select gen_random_uuid(), v_biz, v_loc, id, min_stock * 6, 'ajuste', now() - interval '31 days'
    from ingredients where business_id = v_biz;

  -- Un mes de ventas
  for d in reverse 29..0 loop
    v_day := (now() at time zone 'America/Santo_Domingo')::date - d;
    v_count := case when extract(dow from v_day) in (0, 5, 6) then 11 else 7 end + floor(random() * 5)::int;
    v_hours := case when d = 0 then extract(hour from now() at time zone 'America/Santo_Domingo')::int - 1 else 21 end;
    if v_hours < 7 then v_count := 0; end if;

    for i in 1..v_count loop
      v_at := (v_day + make_time(7 + floor(random() * (v_hours - 6))::int, floor(random() * 60)::int, 0))
              at time zone 'America/Santo_Domingo';
      v_channel := case
        when random() < 0.45 then 'local'
        when random() < 0.36 then 'para_llevar'
        when random() < 0.6 then 'pedidosya'
        else 'ubereats' end;
      v_order := gen_random_uuid();
      v_full := 0;

      create temp table if not exists demo_lines (p int, qty int) on commit drop;
      truncate demo_lines;
      for k in 1..(1 + floor(random() * 3)::int) loop
        v_p := v_pick[1 + floor(random() * array_length(v_pick, 1))::int];
        if exists (select 1 from demo_lines where p = v_p) then
          update demo_lines set qty = qty + 1 where p = v_p;
        else
          insert into demo_lines values (v_p, 1);
        end if;
      end loop;
      select sum(v_price[p] * qty) into v_full from demo_lines;

      -- Igual que en la app: precios con ITBIS (18%), propina 10% en el local, comisión en delivery.
      v_disc := case when v_channel = 'local' and random() < 0.1 then 50 else 0 end;
      v_factor := (v_full - v_disc) / v_full;
      v_gross := round(v_full - v_disc, 2);
      v_subtotal := round(v_full / 1.18 * v_factor, 2);
      v_tip := case when v_channel = 'local' then round(v_subtotal * 0.10, 2) else 0 end;
      v_total := round(v_gross + v_tip, 2);
      v_comm := case v_channel when 'pedidosya' then round(v_gross * 0.25, 2)
                               when 'ubereats' then round(v_gross * 0.30, 2) else 0 end;
      v_pay := case when v_channel in ('pedidosya', 'ubereats') then 'plataforma'
                    else (array['efectivo', 'efectivo', 'tarjeta', 'transferencia'])[1 + floor(random() * 4)::int] end;
      v_cash := case when v_pay = 'efectivo' then
                  case when v_total <= 500 then 500 when v_total <= 1000 then 1000 else 2000 end end;

      insert into orders (id, business_id, location_id, channel, external_ref, status, subtotal, itbis, tip_law, total,
                          platform_commission, net_income, payment_method, created_at, discount, cash_received, change_given)
      values (v_order, v_biz, v_loc, v_channel,
              case v_channel when 'pedidosya' then 'PY-' || (100000 + floor(random() * 899999))::int
                             when 'ubereats' then 'UE-' || (100000 + floor(random() * 899999))::int end,
              'pagada', v_subtotal, round(v_gross - v_subtotal, 2), v_tip, v_total, v_comm, round(v_gross - v_comm, 2),
              v_pay, v_at, v_disc, v_cash, case when v_cash is null then null else round(v_cash - v_total, 2) end);

      insert into order_items (id, order_id, product_id, name, unit_price, quantity)
        select gen_random_uuid(), v_order, v_prod[p], v_names[p], v_price[p], qty from demo_lines;

      insert into inventory_movements (id, business_id, location_id, ingredient_id, quantity, reason, order_id, created_at)
        select gen_random_uuid(), v_biz, v_loc, ri.ingredient_id, -sum(ri.quantity * l.qty), 'venta', v_order, v_at
        from demo_lines l join recipe_items ri on ri.product_id = v_prod[l.p]
        group by ri.ingredient_id;
    end loop;
  end loop;

  -- Gastos del mes
  insert into expenses (id, business_id, location_id, category, description, amount, ncf, spent_at, created_at)
  select gen_random_uuid(), v_biz, v_loc, c, descr, amt, ncf,
         (now() at time zone 'America/Santo_Domingo')::date - dd, now() - make_interval(days => dd)
  from (values
    ('alquiler', 'Alquiler del local', 15000, 'B0100000123', 28),
    ('servicios', 'Luz (Edesur)', 4650, 'B0100004567', 25),
    ('servicios', 'Internet y teléfono', 1990, 'B0100007788', 24),
    ('nomina', 'Quincena empleados', 12000, null, 15),
    ('nomina', 'Quincena empleados', 12000, null, 0),
    ('marketing', 'Anuncio en Instagram', 1500, null, 20),
    ('mantenimiento', 'Arreglo de la nevera', 2200, null, 12),
    ('insumos', 'Compra en el supermercado', 4200, null, 28),
    ('insumos', 'Compra en el supermercado', 3900, null, 21),
    ('insumos', 'Compra en el supermercado', 4600, null, 14),
    ('insumos', 'Compra en el supermercado', 4100, null, 7),
    ('gas', 'Tanque de gas', 1350, null, 25),
    ('gas', 'Tanque de gas', 1350, null, 18),
    ('gas', 'Tanque de gas', 1350, null, 11),
    ('gas', 'Tanque de gas', 1350, null, 4)
  ) as t(c, descr, amt, ncf, dd);

  -- Compras de inventario: todo con existencia, y queso y refresco bajos para ver la alerta.
  insert into inventory_movements (id, business_id, location_id, ingredient_id, quantity, reason, created_at)
  select gen_random_uuid(), v_biz, v_loc, i.id,
         round(case when i.name in ('Queso', 'Refresco lata') then i.min_stock * 0.6 else i.min_stock * 2.5 end
               - coalesce(s.quantity, 0)),
         'compra', now() - interval '1 day'
  from ingredients i
  left join stock_by_location s on s.ingredient_id = i.id and s.location_id = v_loc
  where i.business_id = v_biz;

  raise notice 'Negocio demo listo: % ventas', (select count(*) from orders where business_id = v_biz);
end $$;

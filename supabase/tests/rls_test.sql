-- Prueba local de las migraciones y la seguridad (RLS) simulando Supabase.
-- Uso: npm run test:db (contra una base Postgres local VACÍA: borra el esquema public). Debe imprimir "TODAS LAS PRUEBAS PASARON".
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'duena@yoli.do', '{"name":"Yoli"}'),
  ('00000000-0000-0000-0000-00000000000b', 'cajero@yoli.do', '{"name":"Pedro"}'),
  ('00000000-0000-0000-0000-00000000000c', 'otro@negocio.do', '{"name":"Extraño"}'),
  ('00000000-0000-0000-0000-00000000000d', 'gerente@yoli.do', '{"name":"Ana"}');

set role authenticated;

do $$
declare
  A constant text := '00000000-0000-0000-0000-00000000000a';
  B constant text := '00000000-0000-0000-0000-00000000000b';
  C constant text := '00000000-0000-0000-0000-00000000000c';
  D constant text := '00000000-0000-0000-0000-00000000000d';
  biz uuid; loc uuid; ing uuid; n int; failed boolean;
begin
  -- La dueña crea su negocio y agrega personal
  perform set_config('request.jwt.claim.sub', A, false);
  biz := create_business('Yoli Comida', '101234567', 'Centro');
  select id into loc from locations where business_id = biz;
  insert into locations (business_id, name) values (biz, 'Norte');
  insert into ingredients (business_id, name, unit) values (biz, 'Pan', 'unidad') returning id into ing;
  insert into inventory_movements (id, business_id, location_id, ingredient_id, quantity, reason)
    values (gen_random_uuid(), biz, loc, ing, 50, 'compra');
  perform add_member(biz, 'CAJERO@yoli.do', 'cajero', loc);
  perform add_member(biz, 'gerente@yoli.do', 'gerente', null);
  select count(*) into n from platform_commissions where business_id = biz;
  assert n = 2, 'el negocio nuevo trae comisiones por defecto';

  -- El cajero ve el negocio, vende, pero no cambia el menú
  perform set_config('request.jwt.claim.sub', B, false);
  select count(*) into n from locations; assert n = 2, 'cajero ve los locales';
  insert into orders (id, business_id, location_id, channel, subtotal, itbis, total, net_income)
    values (gen_random_uuid(), biz, loc, 'local', 100, 18, 118, 118);
  failed := false;
  begin insert into categories (business_id, name) values (biz, 'X'); exception when others then failed := true; end;
  assert failed, 'cajero NO puede cambiar el menú';
  failed := false;
  begin perform add_member(biz, 'otro@negocio.do', 'cajero', null); exception when others then failed := true; end;
  assert failed, 'cajero NO puede agregar personal';

  -- Una persona de otro negocio no ve nada (incluido el stock)
  perform set_config('request.jwt.claim.sub', C, false);
  select count(*) into n from orders; assert n = 0, 'extraño no ve ventas';
  select count(*) into n from locations; assert n = 0, 'extraño no ve locales';
  select count(*) into n from stock_by_location; assert n = 0, 'extraño no ve stock';
  failed := false;
  begin
    insert into orders (id, business_id, location_id, channel, subtotal, itbis, total, net_income)
      values (gen_random_uuid(), biz, loc, 'local', 1, 0, 1, 1);
  exception when others then failed := true; end;
  assert failed, 'extraño NO puede registrar ventas en otro negocio';

  -- La gerente gestiona personal, pero no puede tocar a la dueña ni crear dueños
  perform set_config('request.jwt.claim.sub', D, false);
  select quantity into n from stock_by_location where ingredient_id = ing; assert n = 50, 'gerente ve el stock';
  failed := false;
  begin perform add_member(biz, 'otro@negocio.do', 'dueno', null); exception when others then failed := true; end;
  assert failed, 'gerente NO puede crear dueños';
  delete from members where business_id = biz and role = 'dueno';
  get diagnostics n = row_count; assert n = 0, 'gerente NO puede quitar a la dueña';
  begin update members set role = 'dueno' where user_id = D::uuid; exception when others then null; end;
  perform set_config('request.jwt.claim.sub', A, false);
  select count(*) into n from members where business_id = biz and role = 'dueno'; assert n = 1, 'gerente NO se vuelve dueña';
  delete from members where user_id = B::uuid;
  get diagnostics n = row_count; assert n = 1, 'dueña puede quitar al cajero';

  raise notice 'TODAS LAS PRUEBAS PASARON';
end $$;

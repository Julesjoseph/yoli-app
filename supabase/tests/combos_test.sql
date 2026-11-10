-- Prueba de combos (correr después de rls_test.sql: usa sus usuarios y el negocio "Yoli Comida").
reset role;
insert into members (business_id, user_id, role, display_name)
  select id, '00000000-0000-0000-0000-00000000000b', 'cajero', 'Pedro' from businesses where name = 'Yoli Comida';
set role authenticated;
do $$
declare
  A constant text := '00000000-0000-0000-0000-00000000000a'; -- dueña
  B constant text := '00000000-0000-0000-0000-00000000000b'; -- cajero
  C constant text := '00000000-0000-0000-0000-00000000000c'; -- otro negocio
  biz uuid; combo uuid; papas uuid; n int; failed boolean;
begin
  perform set_config('request.jwt.claim.sub', A, false);
  select id into biz from businesses where name = 'Yoli Comida';
  insert into products (business_id, name, price) values (biz, 'Combo pica pollo', 375) returning id into combo;
  insert into products (business_id, name, price) values (biz, 'Papas fritas', 150) returning id into papas;
  insert into combo_items (business_id, product_id, item_product_id, group_name, extra_price)
    values (biz, combo, papas, 'Acompañante', 0);

  -- Un cajero lo ve pero no lo cambia.
  perform set_config('request.jwt.claim.sub', B, false);
  select count(*) into n from combo_items where product_id = combo;
  assert n = 1, 'el cajero ve el combo';
  failed := false;
  begin
    insert into combo_items (business_id, product_id, item_product_id) values (biz, combo, papas);
  exception when others then failed := true; end;
  assert failed, 'el cajero no puede cambiar combos';

  -- Otro negocio no lo ve.
  perform set_config('request.jwt.claim.sub', C, false);
  select count(*) into n from combo_items where product_id = combo;
  assert n = 0, 'otro negocio no ve el combo';
  raise notice 'PRUEBAS COMBOS OK';
end $$;
reset role;

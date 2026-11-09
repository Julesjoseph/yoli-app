-- Prueba del receptor de PedidosYa (correr después de las migraciones y demo-en-la-nube.sql).
do $$
declare
  v_biz uuid; v_loc uuid; r text; n int; stock_before numeric; stock_after numeric; pan uuid;
  p jsonb;
begin
  select b.id, l.id into v_biz, v_loc from businesses b join locations l on l.business_id = b.id where b.name = 'Negocio demo' limit 1;
  insert into delivery_links (platform_id, vendor_id, business_id, location_id) values ('pedidosya', 'TEST-VENDOR', v_biz, v_loc)
    on conflict do nothing;
  select id into pan from ingredients where business_id = v_biz and name = 'Pan de hamburguesa';
  select coalesce(sum(quantity),0) into stock_before from inventory_movements where ingredient_id = pan;

  p := jsonb_build_object(
    'order_id', 'PY-TEST-1', 'order_code', 'ABC123', 'status', 'RECEIVED',
    'client', jsonb_build_object('id', 'TEST-VENDOR'),
    'items', jsonb_build_array(
      jsonb_build_object('name', 'Hamburguesa clásica', 'sku', 'x', 'pricing', jsonb_build_object('unit_price', 295, 'quantity', 2, 'total_price', 590)),
      jsonb_build_object('name', 'Refresco', 'pricing', jsonb_build_object('unit_price', 80, 'quantity', 1, 'total_price', 80))),
    'payment', jsonb_build_object('sub_total', 670, 'order_total', 770, 'delivery_fee', 100));

  r := ingest_pedidosya_order(p);
  assert r = 'creada', r;
  assert ingest_pedidosya_order(p) like 'ya existía%', 'duplicado';
  select count(*) into n from orders where external_ref = 'ABC123' and status = 'pagada' and total = 670 and platform_commission = 167.5;
  assert n = 1, 'orden';
  select count(*) into n from order_items oi join orders o on o.id = oi.order_id where o.external_ref = 'ABC123' and oi.product_id is not null;
  assert n = 2, 'productos unidos por nombre';
  select coalesce(sum(quantity),0) into stock_after from inventory_movements where ingredient_id = pan;
  assert stock_before - stock_after = 2, 'inventario ' || (stock_before - stock_after);

  r := ingest_pedidosya_order(p || '{"status":"CANCELLED"}');
  assert r = 'anulada', r;
  select coalesce(sum(quantity),0) into stock_after from inventory_movements where ingredient_id = pan;
  assert stock_after = stock_before, 'inventario devuelto';
  assert ingest_pedidosya_order(p || '{"client":{"id":"OTRA"}}') like 'tienda no enlazada%', 'sin enlace';

  delete from orders where external_ref = 'ABC123';
  delete from delivery_links where vendor_id = 'TEST-VENDOR';
  raise notice 'PRUEBAS PEDIDOSYA OK';
end $$;

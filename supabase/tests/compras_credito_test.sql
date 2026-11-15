-- Prueba de lista de compras y ventas a crédito (correr después de rls_test.sql).
set role authenticated;
do $$
declare
  A constant text := '00000000-0000-0000-0000-00000000000a'; -- dueña
  B constant text := '00000000-0000-0000-0000-00000000000b'; -- cajero
  C constant text := '00000000-0000-0000-0000-00000000000c'; -- otro negocio
  biz uuid; loc uuid; cli uuid := gen_random_uuid(); o uuid := gen_random_uuid(); n int; bal numeric; failed boolean;
begin
  perform set_config('request.jwt.claim.sub', B, false);
  select id into biz from businesses where name = 'Yoli Comida';
  select id into loc from locations where business_id = biz order by name limit 1;

  -- El cajero anota una compra y la marca comprada.
  insert into shopping_items (id, business_id, location_id, name, quantity) values (gen_random_uuid(), biz, loc, 'Pollo', '20 libras');
  update shopping_items set done = true, done_at = now() where business_id = biz and name = 'Pollo';
  select count(*) into n from shopping_items where business_id = biz and done;
  assert n = 1, 'el cajero marca la compra';

  -- Venta a crédito a un cliente nuevo y un abono.
  insert into customers (id, business_id, name, phone) values (cli, biz, 'Doña Carmen', '8095551234');
  insert into orders (id, business_id, location_id, channel, subtotal, itbis, total, net_income, payment_method, customer_id)
    values (o, biz, loc, 'local', 423.73, 76.27, 500, 500, 'credito', cli);
  insert into customer_payments (id, business_id, location_id, customer_id, amount, method)
    values (gen_random_uuid(), biz, loc, cli, 200, 'efectivo');
  select balance into bal from customer_balances where customer_id = cli;
  assert bal = 300, 'debe 300 después del abono';

  -- Crédito sin cliente no se acepta.
  failed := false;
  begin
    insert into orders (id, business_id, location_id, channel, subtotal, itbis, total, net_income, payment_method)
      values (gen_random_uuid(), biz, loc, 'local', 100, 18, 118, 118, 'credito');
  exception when others then failed := true; end;
  assert failed, 'venta a crédito sin cliente';

  -- Otro negocio no ve los clientes ni la lista.
  perform set_config('request.jwt.claim.sub', C, false);
  select count(*) into n from customers where id = cli;
  assert n = 0, 'otro negocio no ve clientes';
  select count(*) into n from shopping_items where business_id = biz;
  assert n = 0, 'otro negocio no ve la lista';
  select count(*) into n from customer_balances where customer_id = cli;
  assert n = 0, 'otro negocio no ve saldos';
  raise notice 'PRUEBAS COMPRAS Y CRÉDITO OK';
end $$;
reset role;

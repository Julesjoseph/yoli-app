-- Prueba de anulaciones y auditoría (correr después de rls_test.sql).
set role authenticated;
do $$
declare
  A constant text := '00000000-0000-0000-0000-00000000000a'; -- dueña
  B constant text := '00000000-0000-0000-0000-00000000000b'; -- cajero
  biz uuid; loc uuid; ing uuid; q numeric; o uuid := gen_random_uuid(); e uuid := gen_random_uuid(); n int; failed boolean; s text; who uuid;
begin
  perform set_config('request.jwt.claim.sub', B, false);
  select id into biz from businesses where name = 'Yoli Comida';
  select id into loc from locations where business_id = biz order by name limit 1;
  insert into orders (id, business_id, location_id, channel, subtotal, itbis, total, net_income)
    values (o, biz, loc, 'local', 100, 18, 118, 118);
  insert into order_items (id, order_id, name, unit_price, quantity) values (gen_random_uuid(), o, 'Pica pollo', 118, 1);
  select id into ing from ingredients where business_id = biz and name = 'Pan';
  insert into inventory_movements (id, business_id, location_id, ingredient_id, quantity, reason, order_id)
    values (gen_random_uuid(), biz, loc, ing, -2, 'venta', o);
  insert into inventory_movements (id, business_id, location_id, ingredient_id, quantity, reason, note)
    values (gen_random_uuid(), biz, loc, ing, 10, 'compra', 'Distribuidora X · gasto ' || left(e::text, 8));
  insert into expenses (id, business_id, location_id, category, amount, paid, supplier_name, due_date)
    values (e, biz, loc, 'insumos', 500, false, 'Distribuidora X', current_date + 15);

  -- El cajero no puede anular ni borrar
  failed := false;
  begin update orders set status = 'anulada', void_reason = 'error' where id = o; exception when others then failed := true; end;
  assert failed, 'cajero NO anula ventas';
  delete from orders where id = o;
  select count(*) into n from orders where id = o; assert n = 1, 'nadie borra ventas';
  delete from expenses where id = e;
  select count(*) into n from expenses where id = e; assert n = 1, 'nadie borra gastos';

  -- La dueña anula con motivo; queda en auditoría
  perform set_config('request.jwt.claim.sub', A, false);
  failed := false;
  begin update orders set status = 'anulada' where id = o; exception when others then failed := true; end;
  assert failed, 'sin motivo no se anula';
  update orders set status = 'anulada', void_reason = 'Se cobró dos veces' where id = o;
  select voided_by into who from orders where id = o; assert who = A::uuid, 'queda quién anuló';
  select sum(quantity) into q from inventory_movements where order_id = o; assert q = 0, 'el inventario vuelve';
  select count(*) into n from audit_log where record_id = o and action = 'anular' and user_name = 'Yoli'
    and jsonb_array_length(snapshot->'items') = 1;
  assert n = 1, 'auditoría con copia de la venta';

  -- Un equipo atrasado que la sube como pagada no la revive
  update orders set status = 'pagada' where id = o;
  select status into s from orders where id = o; assert s = 'anulada', 'no se revive';

  -- Cuenta por pagar: pagar y anular el gasto
  update expenses set paid = true where id = e;
  select count(*) into n from expenses where id = e and paid_at is not null; assert n = 1, 'fecha de pago';
  update expenses set voided = true, void_reason = 'Factura repetida' where id = e;
  update expenses set voided = false where id = e;
  select count(*) into n from expenses where id = e and voided; assert n = 1, 'gasto anulado no vuelve';
  select count(*) into n from audit_log where record_id = e; assert n = 2, 'pago y anulación en auditoría';
  select sum(quantity) into q from inventory_movements where note like '%gasto ' || left(e::text, 8); assert q = 0, 'la compra sale del inventario';

  -- El cajero no ve la auditoría
  perform set_config('request.jwt.claim.sub', B, false);
  select count(*) into n from audit_log; assert n = 0, 'cajero no ve auditoría';
  failed := false;
  begin insert into audit_log (business_id, table_name, record_id, action, snapshot) values (biz, 'orders', o, 'x', '{}'); exception when others then failed := true; end;
  assert failed, 'nadie escribe la auditoría a mano';
  raise notice 'PRUEBAS CONTABILIDAD OK';
end $$;
reset role;

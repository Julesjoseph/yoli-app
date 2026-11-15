-- Factura registrada a mano (otro proveedor). Después de factura_test.sql.
set role authenticated;
do $$
declare
  A constant text := '00000000-0000-0000-0000-00000000000a'; -- dueña
  B constant text := '00000000-0000-0000-0000-00000000000b'; -- cajero
  biz uuid; ord uuid; inv invoices; failed boolean; n int;
begin
  perform set_config('request.jwt.claim.sub', A, false);
  select id into biz from businesses where name = 'Yoli Comida';
  select id into ord from orders where business_id = biz and status = 'pagada' limit 1;
  assert ord is not null, 'hay una venta';

  -- Sin activar "manual" no deja.
  failed := false;
  begin perform record_manual_ecf(ord, '32', 'E320000000500', 'ABC123'); exception when others then failed := true; end;
  assert failed, 'solo con proveedor manual';
  update einvoice_settings set provider = 'manual', provider_name = 'Facturador X', enabled = true where business_id = biz;

  -- El cajero la registra.
  perform set_config('request.jwt.claim.sub', B, false);
  failed := false;
  begin perform record_manual_ecf(ord, '32', 'E31000000500', 'ABC123'); exception when others then failed := true; end;
  assert failed, 'e-NCF mal escrito';
  failed := false;
  begin perform record_manual_ecf(ord, '32', 'E320000000500', 'AB'); exception when others then failed := true; end;
  assert failed, 'código de seguridad corto';
  failed := false;
  begin perform record_manual_ecf(ord, '31', 'E310000000500', 'ABC123'); exception when others then failed := true; end;
  assert failed, '31 sin cliente';

  inv := record_manual_ecf(ord, '32', ' e320000000500 ', 'abc123');
  assert inv.encf = 'E320000000500' and inv.security_code = 'ABC123' and inv.status = 'aceptada' and inv.provider = 'manual', 'guardada';
  assert inv.message like 'Emitida en Facturador X%', inv.message;
  select count(*) into n from invoices where order_id = ord and provider = 'manual';
  assert n = 1, 'el cajero la ve';
  failed := false;
  begin perform record_manual_ecf(ord, '32', 'E320000000501', 'ABC123'); exception when others then failed := true; end;
  assert failed, 'no dos veces en la misma venta';

  -- El cajero no la quita; la dueña sí.
  failed := false;
  begin perform delete_manual_ecf(inv.id); exception when others then failed := true; end;
  assert failed, 'el cajero no la quita';
  perform set_config('request.jwt.claim.sub', A, false);
  perform delete_manual_ecf(inv.id);
  select count(*) into n from invoices where id = inv.id;
  assert n = 0, 'quitada';
  raise notice 'PRUEBAS FACTURA MANUAL OK';
end $$;
reset role;

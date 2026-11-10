-- Prueba de factura electrónica (después de combos_test.sql: el cajero B es miembro de "Yoli Comida").
set role authenticated;
do $$
declare
  A constant text := '00000000-0000-0000-0000-00000000000a'; -- dueña
  B constant text := '00000000-0000-0000-0000-00000000000b'; -- cajero
  biz uuid; n int; failed boolean;
begin
  perform set_config('request.jwt.claim.sub', A, false);
  select id into biz from businesses where name = 'Yoli Comida';
  perform set_einvoice_token(biz, 'llave-secreta');
  assert einvoice_token_saved(biz), 'llave guardada';
  insert into einvoice_settings (business_id, provider, enabled) values (biz, 'prueba', true);
  select count(*) into n from einvoice_secrets;
  assert n = 0, 'nadie lee la llave';

  perform set_config('request.jwt.claim.sub', B, false);
  assert einvoice_token_saved(biz), 'el cajero sabe que hay llave';
  failed := false;
  begin perform set_einvoice_token(biz, 'otra'); exception when others then failed := true; end;
  assert failed, 'el cajero no cambia la llave';
  failed := false;
  begin
    insert into invoices (business_id, order_id, ecf_type, encf, status)
      select biz, id, '32', 'E320000000099', 'aceptada' from orders where business_id = biz limit 1;
    get diagnostics n = row_count;
    failed := n = 0;
  exception when others then failed := true; end;
  assert failed, 'nadie inventa facturas desde la app';
  select count(*) into n from einvoice_settings where business_id = biz;
  assert n = 1, 'el cajero ve la configuración';
  raise notice 'PRUEBAS FACTURA OK';
end $$;
reset role;

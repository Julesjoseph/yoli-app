-- Prueba del límite de lecturas con IA (correr después de rls_test.sql).
reset role;
insert into platform_admins (user_id) values ('00000000-0000-0000-0000-00000000000a') on conflict do nothing;
set role authenticated;
do $$
declare biz uuid; u bigint; l int; failed boolean;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
  select id into biz from businesses where name = 'Yoli Comida';
  select used, monthly_limit into u, l from ai_scan_status(biz);
  assert u = 0 and l = 0, 'sin límite puesto: 0';
  perform admin_set_ai_scans(biz, 30);
  select monthly_limit into l from ai_scan_status(biz);
  assert l = 30, 'el admin pone 30';
  -- Un usuario normal no puede anotar lecturas ni cambiar el límite.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
  failed := false;
  begin insert into invoice_scans (business_id) values (biz); exception when others then failed := true; end;
  assert failed, 'cajero no anota lecturas';
  failed := false;
  begin perform admin_set_ai_scans(biz, 999); exception when others then failed := true; end;
  assert failed, 'cajero no cambia el límite';
  -- Otro negocio no ve el estado.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
  failed := false;
  begin perform * from ai_scan_status(biz); exception when others then failed := true; end;
  assert failed, 'otro negocio no ve';
  raise notice 'PRUEBAS LECTURA FACTURAS OK';
end $$;
reset role;
insert into invoice_scans (business_id) select id from businesses where name = 'Yoli Comida';
set role authenticated;
do $$
declare u bigint;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
  select used into u from ai_scan_status((select id from businesses where name = 'Yoli Comida'));
  assert u = 1, 'cuenta la lectura del mes';
end $$;
reset role;

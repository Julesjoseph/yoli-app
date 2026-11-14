-- Prueba de suscripciones y del panel de administrador (correr después de rls_test.sql).
reset role;
do $$
declare
  admin uuid := gen_random_uuid(); owner uuid := gen_random_uuid(); b uuid; l uuid; n int; ok boolean;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (admin, 'admin@yoli.test', '{"name":"Admin"}'), (owner, 'cliente@yoli.test', '{"name":"Cliente"}');
  insert into platform_admins values (admin);

  -- Un cliente nuevo crea su negocio: queda en prueba gratis.
  perform set_config('request.jwt.claim.sub', owner::text, true);
  b := create_business('Cafetería Nueva', '', 'Centro', 'cafeteria', '809-555-0000');
  assert business_access(b) = 'prueba', 'prueba';
  assert (select kind from businesses where id = b) = 'cafeteria', 'tipo';
  select id into l from locations where business_id = b;
  assert not is_platform_admin(), 'el cliente no es admin';
  begin
    perform admin_businesses(); ok := false;
  exception when others then ok := true; end;
  assert ok, 'el cliente no ve la lista de clientes';
  begin
    perform admin_set_subscription(b, 'activo'); ok := false;
  exception when others then ok := true; end;
  assert ok, 'el cliente no se puede activar solo';

  -- Prueba vencida: no deja vender.
  update subscriptions set trial_ends_at = now() - interval '1 day' where business_id = b;
  assert business_access(b) = 'vencido', 'vencido';
  begin
    insert into orders (id, business_id, location_id, channel, subtotal, itbis, total, net_income)
      values (gen_random_uuid(), b, l, 'local', 100, 18, 118, 118);
    ok := false;
  exception when others then ok := true; end;
  assert ok, 'bloquea ventas vencido';

  -- El admin lo activa por un mes.
  perform set_config('request.jwt.claim.sub', admin::text, true);
  assert is_platform_admin(), 'admin';
  select count(*) into n from admin_businesses() where id = b and owner_email = 'cliente@yoli.test';
  assert n = 1, 'lista de clientes';
  perform admin_set_subscription(b, 'activo', current_date + 30, 'Pagó por transferencia');
  assert business_access(b) = 'activo', 'activo';
  insert into orders (id, business_id, location_id, channel, subtotal, itbis, total, net_income)
    values (gen_random_uuid(), b, l, 'local', 100, 18, 118, 118);
  perform admin_set_subscription(b, 'suspendido');
  assert business_access(b) = 'suspendido', 'suspendido';

  raise notice 'PRUEBAS SUSCRIPCIONES OK';
end $$;

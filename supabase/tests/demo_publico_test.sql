-- Prueba del interruptor del demo público (correr después de las demás).
reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000de', 'demo@yoli.app', '{"name":"Demo"}');
set role anon;
do $$ begin assert demo_available(), 'sin negocio demo: se muestra'; end $$;
set role authenticated;
do $$
declare biz uuid;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000de', false);
  biz := create_business('Negocio demo', '', 'Demo');
end $$;
reset role;
set role anon;
do $$ begin assert demo_available(), 'demo en prueba: se muestra'; end $$;
reset role;
update subscriptions set status = 'suspendido'
 where business_id = (select business_id from members where user_id = '00000000-0000-0000-0000-0000000000de');
set role anon;
do $$ begin assert not demo_available(), 'demo desactivado: se esconde'; raise notice 'PRUEBAS DEMO OK'; end $$;
reset role;

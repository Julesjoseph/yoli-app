-- YOLI SOFT · Secuencias e-NCF y datos para el proveedor de factura electrónica (Alanube).
-- La DGII autoriza a cada negocio un rango de e-NCF por tipo (Oficina Virtual ›
-- Solicitud de secuencias). Aquí se guarda el próximo número a usar y su vencimiento.
-- Se puede correr más de una vez sin problema (después de 0012).

alter table einvoice_settings add column if not exists seq32_next bigint;   -- próximo número de E32 (sin la E32)
alter table einvoice_settings add column if not exists seq32_due date;      -- vencimiento de la secuencia E32
alter table einvoice_settings add column if not exists seq31_next bigint;
alter table einvoice_settings add column if not exists seq31_due date;
alter table einvoice_settings add column if not exists provider_company_id text; -- id de la compañía en el proveedor (si es asociada)

-- Toma el siguiente e-NCF del negocio (sin repetir aunque dos cajas facturen a la vez).
-- Solo la función del servidor la usa.
create or replace function take_encf(p_business uuid, p_type text)
returns table (encf text, due date)
language plpgsql security definer set search_path = public as $$
declare
  v_next bigint;
  v_due date;
begin
  if p_type = '31' then
    update einvoice_settings set seq31_next = seq31_next + 1
     where business_id = p_business and seq31_next is not null
     returning seq31_next - 1, seq31_due into v_next, v_due;
  elsif p_type = '32' then
    update einvoice_settings set seq32_next = seq32_next + 1
     where business_id = p_business and seq32_next is not null
     returning seq32_next - 1, seq32_due into v_next, v_due;
  end if;
  if v_next is null then
    raise exception 'No hay secuencia e-NCF tipo % configurada', p_type;
  end if;
  return query select 'E' || p_type || lpad(v_next::text, 10, '0'), v_due;
end $$;

-- Si el proveedor no aceptó el envío (error de datos, sin conexión), se devuelve el
-- número para no dejar huecos en la secuencia, siempre que sea el último que se tomó.
create or replace function release_encf(p_business uuid, p_type text, p_encf text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_num bigint := nullif(regexp_replace(p_encf, '^E\d\d', ''), '')::bigint;
begin
  if p_type = '31' then
    update einvoice_settings set seq31_next = seq31_next - 1 where business_id = p_business and seq31_next = v_num + 1;
  elsif p_type = '32' then
    update einvoice_settings set seq32_next = seq32_next - 1 where business_id = p_business and seq32_next = v_num + 1;
  end if;
end $$;

revoke all on function take_encf(uuid, text) from public;
revoke all on function release_encf(uuid, text, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function take_encf(uuid, text) from anon, authenticated;
    revoke all on function release_encf(uuid, text, text) from anon, authenticated;
  end if;
end $$;

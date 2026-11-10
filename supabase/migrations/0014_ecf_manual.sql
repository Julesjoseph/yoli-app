-- YOLI SOFT · Factura electrónica con cualquier proveedor certificado (registro manual).
-- El negocio emite el e-CF en el sistema de su proveedor y en la venta escribe el
-- e-NCF y el código de seguridad. YOLI lo guarda y lo imprime en el ticket con el QR.
-- Se puede correr más de una vez sin problema (después de 0012 y 0013).

alter table einvoice_settings add column if not exists provider_name text; -- nombre del proveedor (registro manual)

-- Guarda la factura que el negocio ya emitió en su proveedor.
create or replace function record_manual_ecf(
  p_order uuid,
  p_type text,
  p_encf text,
  p_security_code text,
  p_customer_rnc text default null,
  p_customer_name text default null
) returns invoices
language plpgsql security definer set search_path = public as $$
declare
  v_order orders;
  v_set einvoice_settings;
  v_encf text := upper(regexp_replace(coalesce(p_encf, ''), '\s', '', 'g'));
  v_code text := upper(regexp_replace(coalesce(p_security_code, ''), '\s', '', 'g'));
  v_rnc text := nullif(regexp_replace(coalesce(p_customer_rnc, ''), '\D', '', 'g'), '');
  v_name text := nullif(trim(coalesce(p_customer_name, '')), '');
  v_inv invoices;
begin
  select * into v_order from orders where id = p_order;
  if v_order.id is null then
    raise exception 'La venta todavía no ha subido a la nube. Espera un momento y vuelve a intentar.';
  end if;
  if not is_member(v_order.business_id) then
    raise exception 'No perteneces a este negocio.';
  end if;
  if v_order.status <> 'pagada' then
    raise exception 'Esta venta está anulada.';
  end if;
  select * into v_set from einvoice_settings where business_id = v_order.business_id;
  if v_set.business_id is null or not v_set.enabled or v_set.provider <> 'manual' then
    raise exception 'Activa "Otro proveedor (manual)" en Perfil › Factura electrónica.';
  end if;
  if p_type not in ('31', '32') then
    raise exception 'Tipo de factura no válido.';
  end if;
  if v_encf !~ ('^E' || p_type || '\d{10}$') then
    raise exception 'El e-NCF va así: E%0000000001 (E%, y 10 números).', p_type, p_type;
  end if;
  if v_code !~ '^[0-9A-Z]{6}$' then
    raise exception 'El código de seguridad tiene 6 letras o números.';
  end if;
  if p_type = '31' and (v_rnc is null or length(v_rnc) not in (9, 11) or v_name is null) then
    raise exception 'Para crédito fiscal escribe el RNC (9 dígitos) o cédula (11) y el nombre del cliente.';
  end if;
  if exists (select 1 from invoices where order_id = p_order and ecf_type = p_type and status in ('enviada', 'aceptada')) then
    raise exception 'Esta venta ya tiene esa factura.';
  end if;
  if exists (select 1 from invoices where business_id = v_order.business_id and encf = v_encf and status in ('enviada', 'aceptada')) then
    raise exception 'El e-NCF % ya está en otra venta.', v_encf;
  end if;

  insert into invoices (business_id, order_id, ecf_type, encf, customer_rnc, customer_name, provider, status,
                        security_code, total, environment, message)
  values (v_order.business_id, p_order, p_type, v_encf, v_rnc, v_name, 'manual', 'aceptada',
          v_code, v_order.total, 'produccion',
          'Emitida en ' || coalesce(nullif(trim(v_set.provider_name), ''), 'el proveedor del negocio') || ' (registrada a mano)')
  returning * into v_inv;
  return v_inv;
end $$;

-- Si se escribió mal, el dueño o gerente la quita para volver a ponerla.
create or replace function delete_manual_ecf(p_invoice uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_inv invoices;
begin
  select * into v_inv from invoices where id = p_invoice;
  if v_inv.id is null or not is_manager(v_inv.business_id) then
    raise exception 'Solo el dueño o el gerente puede quitarla.';
  end if;
  if v_inv.provider <> 'manual' then
    raise exception 'Solo se quitan las facturas registradas a mano.';
  end if;
  delete from invoices where id = p_invoice;
end $$;

revoke all on function record_manual_ecf(uuid, text, text, text, text, text) from public;
revoke all on function delete_manual_ecf(uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function record_manual_ecf(uuid, text, text, text, text, text) to authenticated;
    grant execute on function delete_manual_ecf(uuid) to authenticated;
  end if;
end $$;

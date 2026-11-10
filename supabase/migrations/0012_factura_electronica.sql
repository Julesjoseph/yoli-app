-- YOLI APP · Factura electrónica (e-CF) con un proveedor autorizado por la DGII.
-- Cada negocio configura su proveedor. La llave (token) del proveedor se guarda
-- en una tabla que NADIE puede leer desde la app: solo la función del servidor
-- "emitir-ecf" la usa. Los comprobantes solo los crea esa función.
-- Se puede correr más de una vez sin problema.

-- Configuración visible para el negocio (sin la llave).
create table if not exists einvoice_settings (
  business_id uuid primary key references businesses(id) on delete cascade,
  provider text not null default 'prueba',               -- 'prueba' o el proveedor elegido
  environment text not null default 'prueba' check (environment in ('prueba', 'produccion')),
  enabled boolean not null default false,
  default_type text not null default '32' check (default_type in ('31', '32')),
  updated_at timestamptz not null default now()
);
alter table einvoice_settings enable row level security;
drop policy if exists "ver factura electronica" on einvoice_settings;
create policy "ver factura electronica" on einvoice_settings for select using (is_member(business_id));
drop policy if exists "configurar factura electronica" on einvoice_settings;
create policy "configurar factura electronica" on einvoice_settings for all
  using (is_owner(business_id)) with check (is_owner(business_id));

-- Llave del proveedor: sin políticas = ningún usuario la puede leer ni escribir directo.
create table if not exists einvoice_secrets (
  business_id uuid primary key references businesses(id) on delete cascade,
  api_token text not null,
  updated_at timestamptz not null default now()
);
alter table einvoice_secrets enable row level security;

-- El dueño guarda (o borra, con texto vacío) la llave. Nunca se puede volver a leer.
create or replace function set_einvoice_token(p_business uuid, p_token text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner(p_business) then
    raise exception 'Solo el dueño del negocio';
  end if;
  if coalesce(trim(p_token), '') = '' then
    delete from einvoice_secrets where business_id = p_business;
  else
    insert into einvoice_secrets (business_id, api_token) values (p_business, trim(p_token))
    on conflict (business_id) do update set api_token = excluded.api_token, updated_at = now();
  end if;
end $$;

-- ¿Ya tiene llave guardada? (sí/no, sin mostrarla)
create or replace function einvoice_token_saved(p_business uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_member(p_business) and exists (select 1 from einvoice_secrets where business_id = p_business);
$$;

-- Comprobantes: más datos de lo que devuelve el proveedor.
alter table invoices add column if not exists security_code text;
alter table invoices add column if not exists qr_url text;
alter table invoices add column if not exists total numeric(12,2);
alter table invoices add column if not exists environment text;
alter table invoices add column if not exists message text;
-- Una sola factura válida por venta y tipo.
create unique index if not exists invoices_una_por_venta on invoices (order_id, ecf_type) where status in ('enviada', 'aceptada');

-- Los usuarios solo ven sus comprobantes; los crea la función del servidor.
drop policy if exists "operar" on invoices;
drop policy if exists "ver facturas" on invoices;
create policy "ver facturas" on invoices for select using (is_member(business_id));

grant execute on function set_einvoice_token(uuid, text) to authenticated;
grant execute on function einvoice_token_saved(uuid) to authenticated;

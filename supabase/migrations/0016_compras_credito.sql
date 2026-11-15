-- YOLI SOFT · Lista de compras del negocio y ventas a crédito (fiao).
--   * shopping_items: lo que hay que comprar, por local. Todo el equipo lo ve y lo marca.
--   * customers: clientes a los que se les vende a crédito.
--   * orders.customer_id + forma de pago 'credito'.
--   * customer_payments: abonos que hace el cliente a lo que debe.
-- Lo que debe un cliente = ventas a crédito (no anuladas) − abonos (no anulados).
-- Se puede correr más de una vez sin problema.

-- ---------------------------------------------------------------------------
-- Lista de compras
-- ---------------------------------------------------------------------------
create table if not exists shopping_items (
  id uuid primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  location_id uuid references locations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  quantity text,                          -- "10 libras", "2 cajas" (texto libre)
  note text,
  done boolean not null default false,    -- ya se compró
  deleted boolean not null default false, -- borrado de la lista (se sube como cambio)
  done_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists shopping_items_location on shopping_items (location_id, created_at);

alter table shopping_items enable row level security;
drop policy if exists "operar" on shopping_items;
create policy "operar" on shopping_items for all using (is_member(business_id)) with check (is_member(business_id));

-- ---------------------------------------------------------------------------
-- Clientes a crédito
-- ---------------------------------------------------------------------------
create table if not exists customers (
  id uuid primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  phone text,
  rnc text,
  note text,
  credit_limit numeric(12,2) check (credit_limit is null or credit_limit >= 0), -- null = sin límite
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists customers_business on customers (business_id, name);

alter table customers enable row level security;
drop policy if exists "operar" on customers;
create policy "operar" on customers for all using (is_member(business_id)) with check (is_member(business_id));

-- Venta a crédito: la orden guarda a quién se le fió.
alter table orders add column if not exists customer_id uuid references customers(id) on delete set null;
alter table orders drop constraint if exists orders_payment_method_check;
alter table orders add constraint orders_payment_method_check
  check (payment_method in ('efectivo', 'tarjeta', 'transferencia', 'plataforma', 'credito'));
alter table orders drop constraint if exists orders_credito_cliente;
alter table orders add constraint orders_credito_cliente
  check (payment_method is distinct from 'credito' or customer_id is not null);
create index if not exists orders_customer on orders (customer_id) where customer_id is not null;

-- ---------------------------------------------------------------------------
-- Abonos (pagos del cliente a su cuenta)
-- ---------------------------------------------------------------------------
create table if not exists customer_payments (
  id uuid primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  customer_id uuid not null references customers(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  method text not null check (method in ('efectivo', 'tarjeta', 'transferencia')),
  note text,
  voided boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists customer_payments_customer on customer_payments (customer_id, created_at);

alter table customer_payments enable row level security;
drop policy if exists "operar" on customer_payments;
create policy "operar" on customer_payments for all using (is_member(business_id)) with check (is_member(business_id));

-- El abono es del mismo negocio que el cliente.
create or replace function customer_same_business() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.customer_id is not null
     and not exists (select 1 from customers c where c.id = new.customer_id and c.business_id = new.business_id) then
    raise exception 'El cliente no es de este negocio.';
  end if;
  return new;
end $$;
drop trigger if exists customer_payments_business on customer_payments;
create trigger customer_payments_business before insert or update on customer_payments
  for each row execute function customer_same_business();
drop trigger if exists orders_customer_business on orders;
create trigger orders_customer_business before insert or update of customer_id on orders
  for each row execute function customer_same_business();

-- Con la suscripción vencida no se registran abonos nuevos (igual que ventas y gastos).
drop trigger if exists customer_payments_active on customer_payments;
create trigger customer_payments_active before insert on customer_payments
  for each row execute function require_active_business();

-- Lo que debe cada cliente (para el panel web y reportes).
create or replace view customer_balances with (security_invoker = true) as
  select c.id as customer_id, c.business_id, c.name,
    coalesce((select sum(o.total) from orders o
              where o.customer_id = c.id and o.payment_method = 'credito' and o.status <> 'anulada'), 0)
    - coalesce((select sum(p.amount) from customer_payments p where p.customer_id = c.id and not p.voided), 0) as balance
  from customers c;

-- Que llegue al instante a los otros equipos.
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['shopping_items', 'customers', 'customer_payments'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

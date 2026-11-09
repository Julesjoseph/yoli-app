-- YOLI APP: esquema inicial en Supabase (Postgres)
-- Multi-negocio y multi-local. Cada fila lleva business_id para aislar datos con RLS.
-- Los IDs son UUID generados en el teléfono, para poder crear ventas sin internet
-- y sincronizarlas después sin choques.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Negocio, locales y personal
-- ---------------------------------------------------------------------------
create table businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rnc text,                         -- RNC ante la DGII (República Dominicana)
  created_at timestamptz not null default now()
);

create table locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  address text,
  kind text not null default 'comida_rapida'
    check (kind in ('comida_rapida', 'comedor', 'cafeteria', 'mixto')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Un usuario (auth.users) puede pertenecer a un negocio con un rol.
-- location_id nulo = acceso a todos los locales.
create table members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid references locations(id) on delete cascade,
  role text not null check (role in ('dueno', 'gerente', 'cajero', 'cocina')),
  display_name text,
  created_at timestamptz not null default now(),
  unique (business_id, user_id, location_id)
);

-- ---------------------------------------------------------------------------
-- Menú
-- ---------------------------------------------------------------------------
create table categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  sort_order int not null default 0
);

create table products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  name text not null,
  price numeric(12,2) not null check (price >= 0),        -- precio con ITBIS incluido
  itbis_rate numeric(5,4) not null default 0.18,          -- 18% general en RD
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Inventario
-- ---------------------------------------------------------------------------
create table ingredients (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  unit text not null,                       -- 'g', 'ml', 'unidad', 'lb'...
  cost_per_unit numeric(12,4) not null default 0,
  min_stock numeric(12,3) not null default 0,
  updated_at timestamptz not null default now()
);

-- Receta: cuánto de cada ingrediente lleva un producto
create table recipe_items (
  product_id uuid not null references products(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  quantity numeric(12,3) not null check (quantity > 0),
  primary key (product_id, ingredient_id)
);

-- Libro de movimientos: el stock de un local es la suma de sus movimientos.
create table inventory_movements (
  id uuid primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  quantity numeric(12,3) not null,          -- positivo entra, negativo sale
  reason text not null check (reason in ('compra', 'venta', 'merma', 'ajuste', 'traslado')),
  order_id uuid,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create view stock_by_location as
  select business_id, location_id, ingredient_id, sum(quantity) as quantity
  from inventory_movements
  group by business_id, location_id, ingredient_id;

-- ---------------------------------------------------------------------------
-- Ventas (POS + PedidosYa + Uber Eats)
-- ---------------------------------------------------------------------------
create table delivery_platforms (
  id text primary key,                      -- 'pedidosya', 'ubereats'
  name text not null
);
insert into delivery_platforms (id, name) values
  ('pedidosya', 'PedidosYa'),
  ('ubereats', 'Uber Eats');

-- Comisión que cobra cada plataforma a cada negocio (se negocia por contrato)
create table platform_commissions (
  business_id uuid not null references businesses(id) on delete cascade,
  platform_id text not null references delivery_platforms(id),
  commission_rate numeric(5,4) not null,    -- ej. 0.25 = 25%
  primary key (business_id, platform_id)
);

create table orders (
  id uuid primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  channel text not null check (channel in ('local', 'para_llevar', 'pedidosya', 'ubereats')),
  external_ref text,                        -- número de pedido de la plataforma
  status text not null default 'pagada' check (status in ('abierta', 'pagada', 'anulada')),
  subtotal numeric(12,2) not null,          -- sin ITBIS
  itbis numeric(12,2) not null,
  tip_law numeric(12,2) not null default 0, -- 10% ley de propina (consumo en local)
  total numeric(12,2) not null,
  platform_commission numeric(12,2) not null default 0,
  net_income numeric(12,2) not null,        -- lo que realmente le queda al negocio
  payment_method text check (payment_method in ('efectivo', 'tarjeta', 'transferencia', 'plataforma')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index orders_by_location_date on orders (location_id, created_at);

create table order_items (
  id uuid primary key,
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  name text not null,                       -- copia del nombre al momento de vender
  unit_price numeric(12,2) not null,
  quantity int not null check (quantity > 0)
);

-- ---------------------------------------------------------------------------
-- Gastos
-- ---------------------------------------------------------------------------
create table expenses (
  id uuid primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  category text not null check (category in
    ('insumos', 'alquiler', 'nomina', 'servicios', 'gas', 'mantenimiento', 'marketing', 'impuestos', 'otros')),
  description text,
  amount numeric(12,2) not null check (amount > 0),
  supplier_rnc text,                        -- para el reporte 606 de la DGII
  ncf text,                                 -- comprobante fiscal del proveedor
  receipt_url text,
  spent_at date not null default current_date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Facturación electrónica (e-CF DGII) - lista para un proveedor certificado
-- ---------------------------------------------------------------------------
create table invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  ecf_type text not null check (ecf_type in ('31', '32', '34')),  -- crédito fiscal, consumo, nota de crédito
  encf text,                                -- número e-NCF asignado
  customer_rnc text,
  customer_name text,
  provider text,                            -- proveedor usado
  status text not null default 'pendiente' check (status in ('pendiente', 'enviada', 'aceptada', 'rechazada')),
  provider_response jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Seguridad: cada usuario solo ve los negocios donde es miembro
-- ---------------------------------------------------------------------------
create or replace function is_member(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where business_id = b and user_id = auth.uid());
$$;

create or replace function is_manager(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members
                 where business_id = b and user_id = auth.uid() and role in ('dueno', 'gerente'));
$$;

alter table businesses enable row level security;
alter table locations enable row level security;
alter table members enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table ingredients enable row level security;
alter table recipe_items enable row level security;
alter table inventory_movements enable row level security;
alter table platform_commissions enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table expenses enable row level security;
alter table invoices enable row level security;

create policy "ver negocio" on businesses for select using (is_member(id));
create policy "editar negocio" on businesses for update using (is_manager(id));

create policy "ver miembros" on members for select using (is_member(business_id));
create policy "gestionar miembros" on members for all using (is_manager(business_id));

-- Catálogo: todos lo ven, solo dueño/gerente lo cambia
create policy "ver" on locations for select using (is_member(business_id));
create policy "gestionar" on locations for all using (is_manager(business_id));
create policy "ver" on categories for select using (is_member(business_id));
create policy "gestionar" on categories for all using (is_manager(business_id));
create policy "ver" on products for select using (is_member(business_id));
create policy "gestionar" on products for all using (is_manager(business_id));
create policy "ver" on ingredients for select using (is_member(business_id));
create policy "gestionar" on ingredients for all using (is_manager(business_id));
create policy "ver" on platform_commissions for select using (is_member(business_id));
create policy "gestionar" on platform_commissions for all using (is_manager(business_id));
create policy "ver" on recipe_items for select
  using (exists (select 1 from products p where p.id = product_id and is_member(p.business_id)));
create policy "gestionar" on recipe_items for all
  using (exists (select 1 from products p where p.id = product_id and is_manager(p.business_id)));

-- Operación diaria: cualquier miembro registra ventas, gastos y movimientos
create policy "operar" on orders for all using (is_member(business_id)) with check (is_member(business_id));
create policy "operar" on order_items for all
  using (exists (select 1 from orders o where o.id = order_id and is_member(o.business_id)));
create policy "operar" on inventory_movements for all using (is_member(business_id)) with check (is_member(business_id));
create policy "operar" on expenses for all using (is_member(business_id)) with check (is_member(business_id));
create policy "operar" on invoices for all using (is_member(business_id)) with check (is_member(business_id));

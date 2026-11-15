-- YOLI SOFT · Contabilidad básica y auditoría.
--  * Anular ventas y gastos que se entraron por error: no se borran, quedan marcados
--    (motivo, quién y cuándo) y se guarda una copia en audit_log.
--  * Nadie puede borrar ventas ni gastos desde la app (solo anularlos).
--  * Gastos a crédito (cuentas por pagar): proveedor, fecha de vencimiento y si ya se pagó.
-- Se puede correr más de una vez sin problema.

alter table orders add column if not exists void_reason text;
alter table orders add column if not exists voided_at timestamptz;
alter table orders add column if not exists voided_by uuid references auth.users(id) on delete set null;

alter table expenses add column if not exists voided boolean not null default false;
alter table expenses add column if not exists void_reason text;
alter table expenses add column if not exists voided_at timestamptz;
alter table expenses add column if not exists voided_by uuid references auth.users(id) on delete set null;
alter table expenses add column if not exists supplier_name text;
alter table expenses add column if not exists paid boolean not null default true;
alter table expenses add column if not exists due_date date;
alter table expenses add column if not exists paid_at timestamptz;
create index if not exists expenses_por_pagar on expenses (business_id) where not paid and not voided;

-- Registro de auditoría: solo se agrega (nadie lo cambia ni lo borra desde la app).
create table if not exists audit_log (
  id bigserial primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  location_id uuid,
  table_name text not null,
  record_id uuid not null,
  action text not null,
  reason text,
  amount numeric(12,2),
  snapshot jsonb not null,
  user_id uuid references auth.users(id) on delete set null,
  user_name text,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_business on audit_log (business_id, created_at desc);
alter table audit_log enable row level security;
drop policy if exists "ver auditoria" on audit_log;
create policy "ver auditoria" on audit_log for select using (is_manager(business_id));

-- Ventas y gastos: ver, crear y cambiar sí; borrar no.
drop policy if exists "operar" on orders;
drop policy if exists "ver" on orders;
drop policy if exists "crear" on orders;
drop policy if exists "cambiar" on orders;
create policy "ver" on orders for select using (is_member(business_id));
create policy "crear" on orders for insert with check (is_member(business_id));
create policy "cambiar" on orders for update using (is_member(business_id)) with check (is_member(business_id));

drop policy if exists "operar" on expenses;
drop policy if exists "ver" on expenses;
drop policy if exists "crear" on expenses;
drop policy if exists "cambiar" on expenses;
create policy "ver" on expenses for select using (is_member(business_id));
create policy "crear" on expenses for insert with check (is_member(business_id));
create policy "cambiar" on expenses for update using (is_member(business_id)) with check (is_member(business_id));

create or replace function audit_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(u.raw_user_meta_data->>'name', u.email) from auth.users u where u.id = auth.uid();
$$;

-- Anular una venta: solo dueño o gerente, una vez anulada no vuelve atrás y queda en auditoría.
create or replace function guard_order_void() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'anulada' and new.status is distinct from 'anulada' then
    -- Un equipo que todavía la tenía como pagada no la revive: se queda anulada.
    new.status := 'anulada';
    new.void_reason := old.void_reason;
    new.voided_at := old.voided_at;
    new.voided_by := old.voided_by;
    return new;
  end if;
  if new.status = 'anulada' and old.status is distinct from 'anulada' then
    if auth.uid() is not null and not is_manager(new.business_id) then
      raise exception 'Solo el dueño o un gerente pueden anular ventas.';
    end if;
    if coalesce(trim(new.void_reason), '') = '' then
      raise exception 'Escribe el motivo de la anulación.';
    end if;
    new.voided_at := now();
    new.voided_by := auth.uid();
    insert into audit_log (business_id, location_id, table_name, record_id, action, reason, amount, snapshot, user_id, user_name)
    values (new.business_id, new.location_id, 'orders', new.id, 'anular', new.void_reason, new.total,
            to_jsonb(old) || jsonb_build_object('items', (select coalesce(jsonb_agg(to_jsonb(i)), '[]') from order_items i where i.order_id = new.id)),
            auth.uid(), audit_name());
    -- Lo que la venta sacó del inventario vuelve a entrar.
    insert into inventory_movements (id, business_id, location_id, ingredient_id, quantity, reason, order_id, note, created_by)
    select gen_random_uuid(), m.business_id, m.location_id, m.ingredient_id, -m.quantity, 'ajuste', m.order_id, 'Anulación de venta', auth.uid()
      from inventory_movements m where m.order_id = new.id and m.reason = 'venta';
  end if;
  return new;
end $$;
drop trigger if exists orders_void on orders;
create trigger orders_void before update on orders for each row execute function guard_order_void();

create or replace function guard_expense_void() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.voided and not new.voided then
    new.voided := true;
    new.void_reason := old.void_reason;
    new.voided_at := old.voided_at;
    new.voided_by := old.voided_by;
    return new;
  end if;
  if new.voided and not old.voided then
    if auth.uid() is not null and not is_manager(new.business_id) then
      raise exception 'Solo el dueño o un gerente pueden anular gastos.';
    end if;
    if coalesce(trim(new.void_reason), '') = '' then
      raise exception 'Escribe el motivo de la anulación.';
    end if;
    new.voided_at := now();
    new.voided_by := auth.uid();
    insert into audit_log (business_id, location_id, table_name, record_id, action, reason, amount, snapshot, user_id, user_name)
    values (new.business_id, new.location_id, 'expenses', new.id, 'anular', new.void_reason, new.amount, to_jsonb(old), auth.uid(), audit_name());
    -- Lo que entró al inventario con esta factura (escaneada) y sigue ahí vuelve a salir
    -- (lo que ya se quitó a mano no se vuelve a sacar).
    insert into inventory_movements (id, business_id, location_id, ingredient_id, quantity, reason, note, created_by)
    select gen_random_uuid(), new.business_id, m.location_id, m.ingredient_id, -sum(m.quantity), 'ajuste', 'Anulación de gasto ' || left(new.id::text, 8), auth.uid()
      from inventory_movements m
     where m.business_id = new.business_id and m.note like '%gasto ' || left(new.id::text, 8)
     group by m.location_id, m.ingredient_id
    having sum(m.quantity) <> 0;
  end if;
  -- Pagar una cuenta por pagar también queda anotado.
  if new.paid and not old.paid and not new.voided then
    new.paid_at := coalesce(new.paid_at, now());
    insert into audit_log (business_id, location_id, table_name, record_id, action, reason, amount, snapshot, user_id, user_name)
    values (new.business_id, new.location_id, 'expenses', new.id, 'pagar', null, new.amount, to_jsonb(old), auth.uid(), audit_name());
  end if;
  return new;
end $$;
drop trigger if exists expenses_void on expenses;
create trigger expenses_void before update on expenses for each row execute function guard_expense_void();

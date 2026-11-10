-- YOLI APP · Vender YOLI a otros negocios: tipo de negocio, suscripciones y
-- panel del dueño de YOLI (administrador de la plataforma).
-- Cada negocio nuevo empieza con 14 días de prueba gratis. El administrador de la
-- plataforma activa (pagado hasta una fecha) o suspende a cada cliente.
-- Se puede correr más de una vez sin problema.

alter table businesses add column if not exists kind text not null default 'mixto';
alter table businesses add column if not exists phone text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'businesses_kind_check') then
    alter table businesses add constraint businesses_kind_check
      check (kind in ('comida_rapida', 'comedor', 'cafeteria', 'mixto'));
  end if;
end $$;

-- Suscripción de cada negocio (tabla aparte: el dueño del negocio NO la puede cambiar).
create table if not exists subscriptions (
  business_id uuid primary key references businesses(id) on delete cascade,
  status text not null default 'prueba' check (status in ('prueba', 'activo', 'suspendido')),
  trial_ends_at timestamptz not null default now() + interval '14 days',
  paid_until date,                          -- nulo con status 'activo' = sin vencimiento
  note text,
  updated_at timestamptz not null default now()
);
alter table subscriptions enable row level security;
drop policy if exists "ver suscripcion" on subscriptions;
create policy "ver suscripcion" on subscriptions for select using (is_member(business_id));

-- Los negocios que ya existían quedan activos sin vencimiento.
insert into subscriptions (business_id, status)
  select id, 'activo' from businesses
  on conflict (business_id) do nothing;

-- Todo negocio nuevo recibe su prueba gratis.
create or replace function new_business_subscription() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into subscriptions (business_id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists business_subscription on businesses;
create trigger business_subscription after insert on businesses
  for each row execute function new_business_subscription();

-- 'activo', 'prueba', 'vencido' o 'suspendido'.
create or replace function business_access(b uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when s.business_id is null then 'activo'
    when s.status = 'suspendido' then 'suspendido'
    when s.status = 'activo' and (s.paid_until is null or s.paid_until >= current_date) then 'activo'
    when s.status = 'prueba' and s.trial_ends_at >= now() then 'prueba'
    else 'vencido'
  end
  from (select b as id) x left join subscriptions s on s.business_id = x.id;
$$;

-- Con la suscripción vencida o suspendida no se registran ventas ni gastos nuevos
-- (lo que se hizo sin internet queda guardado en el equipo y sube al renovar).
create or replace function require_active_business() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if business_access(new.business_id) in ('vencido', 'suspendido') then
    raise exception 'La suscripción de este negocio está vencida. Renueva para seguir registrando.';
  end if;
  return new;
end $$;
drop trigger if exists orders_active on orders;
create trigger orders_active before insert on orders for each row execute function require_active_business();
drop trigger if exists expenses_active on expenses;
create trigger expenses_active before insert on expenses for each row execute function require_active_business();

-- create_business ahora guarda el tipo de negocio y el teléfono.
drop function if exists create_business(text, text, text);
create or replace function create_business(p_name text, p_rnc text, p_location_name text, p_kind text default 'mixto', p_phone text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_business uuid;
  v_kind text := case when p_kind in ('comida_rapida', 'comedor', 'cafeteria', 'mixto') then p_kind else 'mixto' end;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión';
  end if;
  insert into businesses (name, rnc, kind, phone)
    values (p_name, nullif(p_rnc, ''), v_kind, nullif(p_phone, '')) returning id into v_business;
  insert into locations (business_id, name, kind)
    values (v_business, coalesce(nullif(p_location_name, ''), 'Local principal'), v_kind);
  insert into members (business_id, user_id, location_id, role, display_name)
    values (v_business, auth.uid(), null, 'dueno',
            (select coalesce(raw_user_meta_data->>'name', email) from auth.users where id = auth.uid()));
  insert into platform_commissions (business_id, platform_id, commission_rate) values
    (v_business, 'pedidosya', 0.25), (v_business, 'ubereats', 0.30);
  return v_business;
end;
$$;
grant execute on function create_business(text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Administrador de la plataforma (el dueño de YOLI)
-- ---------------------------------------------------------------------------
create table if not exists platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table platform_admins enable row level security; -- nadie la lee directo

create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

-- Lista de clientes con su suscripción y actividad de los últimos 30 días.
create or replace function admin_businesses()
returns table (
  id uuid, name text, kind text, phone text, created_at timestamptz,
  owner_name text, owner_email text,
  status text, access text, trial_ends_at timestamptz, paid_until date, note text,
  locations bigint, users bigint, orders_30d bigint, sales_30d numeric, last_sale timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then
    raise exception 'Solo el administrador de YOLI';
  end if;
  return query
  select b.id, b.name, b.kind, b.phone, b.created_at,
         o.display_name, u.email::text,
         coalesce(s.status, 'activo'), business_access(b.id), s.trial_ends_at, s.paid_until, s.note,
         (select count(*) from locations l where l.business_id = b.id),
         (select count(distinct m.user_id) from members m where m.business_id = b.id),
         (select count(*) from orders x where x.business_id = b.id and x.status = 'pagada' and x.created_at >= now() - interval '30 days'),
         (select coalesce(sum(x.total), 0) from orders x where x.business_id = b.id and x.status = 'pagada' and x.created_at >= now() - interval '30 days'),
         (select max(x.created_at) from orders x where x.business_id = b.id)
  from businesses b
  left join subscriptions s on s.business_id = b.id
  left join lateral (
    select m.user_id, m.display_name from members m
     where m.business_id = b.id and m.role = 'dueno' order by m.created_at limit 1
  ) o on true
  left join auth.users u on u.id = o.user_id
  order by b.created_at desc;
end $$;

-- Activar (pagado hasta una fecha), poner en prueba o suspender a un cliente.
create or replace function admin_set_subscription(p_business uuid, p_status text, p_paid_until date default null, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then
    raise exception 'Solo el administrador de YOLI';
  end if;
  if p_status not in ('prueba', 'activo', 'suspendido') then
    raise exception 'Estado no válido';
  end if;
  insert into subscriptions (business_id, status, paid_until, note, updated_at)
    values (p_business, p_status, p_paid_until, p_note, now())
  on conflict (business_id) do update
    set status = excluded.status,
        paid_until = excluded.paid_until,
        note = coalesce(excluded.note, subscriptions.note),
        updated_at = now();
end $$;

grant execute on function business_access(uuid) to authenticated;
grant execute on function is_platform_admin() to authenticated;
grant execute on function admin_businesses() to authenticated;
grant execute on function admin_set_subscription(uuid, text, date, text) to authenticated;

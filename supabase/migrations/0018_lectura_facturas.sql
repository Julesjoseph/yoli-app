-- YOLI SOFT · Lectura de facturas con IA (función leer-factura): límite al mes por negocio.
-- La llave de Anthropic es una sola (la del dueño de YOLI, en los Secrets de Supabase).
-- El administrador pone cuántas facturas con IA puede leer cada negocio al mes
-- (0 = solo la lectura gratis del celular) y ve cuántas usó.
-- Se puede correr más de una vez sin problema.

alter table subscriptions add column if not exists ai_scans_month int not null default 0
  check (ai_scans_month >= 0);

create table if not exists invoice_scans (
  id bigserial primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists invoice_scans_business on invoice_scans (business_id, created_at);
alter table invoice_scans enable row level security;
drop policy if exists "ver lecturas" on invoice_scans;
create policy "ver lecturas" on invoice_scans for select using (is_member(business_id));
-- Solo la función del servidor (service role) anota lecturas.

-- Inicio del mes en hora de República Dominicana.
create or replace function rd_month_start() returns timestamptz
language sql stable as $$
  select (date_trunc('month', now() at time zone 'America/Santo_Domingo')) at time zone 'America/Santo_Domingo';
$$;

-- Cuántas lecturas con IA usó este mes el negocio y cuántas tiene.
create or replace function ai_scan_status(b uuid)
returns table (used bigint, monthly_limit int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_member(b) or is_platform_admin()) then
    raise exception 'No eres parte de este negocio.';
  end if;
  return query
  select (select count(*) from invoice_scans s where s.business_id = b and s.created_at >= rd_month_start()),
         coalesce((select x.ai_scans_month from subscriptions x where x.business_id = b), 0);
end $$;

-- Para el administrador: uso y límite de todos los negocios.
create or replace function admin_ai_scans()
returns table (business_id uuid, used bigint, monthly_limit int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then
    raise exception 'Solo el administrador de YOLI';
  end if;
  return query
  select b.id,
         (select count(*) from invoice_scans s where s.business_id = b.id and s.created_at >= rd_month_start()),
         coalesce(x.ai_scans_month, 0)
  from businesses b left join subscriptions x on x.business_id = b.id;
end $$;

create or replace function admin_set_ai_scans(p_business uuid, p_limit int)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then
    raise exception 'Solo el administrador de YOLI';
  end if;
  if p_limit is null or p_limit < 0 then
    raise exception 'Límite no válido';
  end if;
  insert into subscriptions (business_id, status, ai_scans_month, updated_at)
    values (p_business, 'activo', p_limit, now())
  on conflict (business_id) do update set ai_scans_month = excluded.ai_scans_month, updated_at = now();
end $$;

grant execute on function ai_scan_status(uuid) to authenticated;
grant execute on function admin_ai_scans() to authenticated;
grant execute on function admin_set_ai_scans(uuid, int) to authenticated;

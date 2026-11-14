-- Funciones para que la app cree negocios, locales y personal de forma segura.
-- Corren como "security definer" porque las tablas tienen RLS y un usuario nuevo
-- todavía no es miembro de nada.

-- El dueño crea su negocio y su primer local; queda como 'dueno' con acceso a todo.
create or replace function create_business(p_name text, p_rnc text, p_location_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_business uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión';
  end if;
  insert into businesses (name, rnc) values (p_name, nullif(p_rnc, '')) returning id into v_business;
  insert into locations (business_id, name) values (v_business, coalesce(nullif(p_location_name, ''), 'Local principal'));
  insert into members (business_id, user_id, location_id, role, display_name)
    values (v_business, auth.uid(), null, 'dueno',
            (select coalesce(raw_user_meta_data->>'name', email) from auth.users where id = auth.uid()));
  insert into platform_commissions (business_id, platform_id, commission_rate) values
    (v_business, 'pedidosya', 0.25), (v_business, 'ubereats', 0.30);
  return v_business;
end;
$$;

-- Dueño o gerente agrega a una persona que ya creó su cuenta en la app.
-- p_location nulo = trabaja en todos los locales.
create or replace function add_member(p_business uuid, p_email text, p_role text, p_location uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_id uuid;
begin
  if not is_manager(p_business) then
    raise exception 'Solo el dueño o un gerente puede agregar personal';
  end if;
  if p_role = 'dueno' and not is_owner(p_business) then
    raise exception 'Solo el dueño puede agregar otro dueño';
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'No existe una cuenta con ese correo. Pídele que se registre primero en la app.';
  end if;
  insert into members (business_id, user_id, location_id, role, display_name)
    values (p_business, v_user, p_location, p_role,
            (select coalesce(raw_user_meta_data->>'name', email) from auth.users where id = v_user))
    returning id into v_id;
  return v_id;
end;
$$;

-- Un gerente no puede cambiar ni quitar a un dueño, ni volverse dueño.
create or replace function is_owner(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where business_id = b and user_id = auth.uid() and role = 'dueno');
$$;

drop policy if exists "gestionar miembros" on members;
create policy "gestionar miembros" on members for update
  using (is_manager(business_id) and (role <> 'dueno' or is_owner(business_id)))
  with check (is_manager(business_id) and (role <> 'dueno' or is_owner(business_id)));
create policy "quitar miembros" on members for delete
  using (is_manager(business_id) and (role <> 'dueno' or is_owner(business_id)) and user_id <> auth.uid());

-- La vista de stock debe respetar el RLS de quien consulta (si no, se verían otros negocios).
alter view stock_by_location set (security_invoker = true);

grant execute on function create_business(text, text, text) to authenticated;
grant execute on function add_member(uuid, text, text, uuid) to authenticated;

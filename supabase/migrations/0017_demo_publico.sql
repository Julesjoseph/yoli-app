-- YOLI SOFT · ¿Se muestra el botón "Probar demo" en la pantalla de entrada?
-- El administrador activa o desactiva el demo en Perfil › Clientes de YOLI (suspende el
-- negocio de la cuenta demo@yoli.app). Esta función lo dice sin iniciar sesión.
-- Sin cuenta demo en la nube devuelve true (la app usa el demo de este equipo).
-- Se puede correr más de una vez sin problema.

create or replace function demo_available() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select business_access(m.business_id) in ('activo', 'prueba')
      from members m
      join auth.users u on u.id = m.user_id
     where lower(u.email) = 'demo@yoli.app' and m.role = 'dueno'
     order by m.created_at
     limit 1
  ), true);
$$;

grant execute on function demo_available() to anon, authenticated;

-- Imitación mínima de Supabase (esquema auth y rol authenticated) para probar en Postgres local.
drop schema if exists public cascade; create schema public;
drop schema if exists auth cascade; create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
grant usage on schema public, auth to authenticated;
alter default privileges in schema public grant all on tables to authenticated;
alter default privileges in schema public grant execute on functions to authenticated;

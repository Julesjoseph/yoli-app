-- YOLI APP · Perfil del negocio: logo y datos de contacto/fiscales.
-- "name" es el nombre comercial; "rnc" y "phone" ya existían. Todo es opcional.
-- Lo puede editar el dueño o el gerente (política "editar negocio" de 0001).
-- Se puede correr más de una vez sin problema.

alter table businesses add column if not exists legal_name text;   -- razón social
alter table businesses add column if not exists email text;
alter table businesses add column if not exists address text;
alter table businesses add column if not exists logo_url text;
alter table businesses add column if not exists rnc text;
alter table businesses add column if not exists phone text;

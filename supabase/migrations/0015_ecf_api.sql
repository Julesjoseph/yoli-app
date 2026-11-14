-- YOLI APP · Factura electrónica con CUALQUIER proveedor que tenga API.
-- Conector genérico: YOLI manda la factura (formato estándar "yoli-ecf-1" o igual que
-- Alanube) a la dirección del proveedor y lee de la respuesta el e-NCF, el código de
-- seguridad, el QR y el estado. La llave sigue guardada en einvoice_secrets (nadie la ve).
-- Se puede correr más de una vez sin problema.

alter table einvoice_settings add column if not exists api_url text;              -- https://… para emitir (POST)
alter table einvoice_settings add column if not exists api_status_url text;       -- opcional: consultar (GET), con {id} o {encf}
alter table einvoice_settings add column if not exists api_auth_header text;      -- por defecto Authorization
alter table einvoice_settings add column if not exists api_auth_prefix text;      -- por defecto "Bearer "
alter table einvoice_settings add column if not exists api_format text;           -- 'yoli' (estándar) o 'alanube'
alter table einvoice_settings add column if not exists api_numbering text;        -- 'yoli' (YOLI lleva la secuencia) o 'proveedor'
alter table einvoice_settings add column if not exists api_response_map jsonb;    -- dónde está cada dato en la respuesta

alter table einvoice_settings drop constraint if exists einvoice_api_format_ok;
alter table einvoice_settings add constraint einvoice_api_format_ok
  check (api_format is null or api_format in ('yoli', 'alanube'));
alter table einvoice_settings drop constraint if exists einvoice_api_numbering_ok;
alter table einvoice_settings add constraint einvoice_api_numbering_ok
  check (api_numbering is null or api_numbering in ('yoli', 'proveedor'));
alter table einvoice_settings drop constraint if exists einvoice_api_url_https;
alter table einvoice_settings add constraint einvoice_api_url_https
  check ((api_url is null or api_url ~* '^https://') and (api_status_url is null or api_status_url ~* '^https://'));

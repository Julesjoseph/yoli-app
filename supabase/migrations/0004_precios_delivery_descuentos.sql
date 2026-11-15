-- Precio distinto para PedidosYa / Uber Eats (vacío = mismo precio del local)
alter table products add column if not exists price_pedidosya numeric(12,2);
alter table products add column if not exists price_ubereats numeric(12,2);

-- Descuento aplicado a la orden (RD$, con ITBIS)
alter table orders add column if not exists discount numeric(12,2) not null default 0;

-- Efectivo que entregó el cliente y la devuelta (para el ticket)
alter table orders add column if not exists cash_received numeric(12,2);
alter table orders add column if not exists change_given numeric(12,2);

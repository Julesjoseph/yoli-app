-- YOLI APP · Dejar la cuenta real en cero
-- Borra ventas, gastos, inventario, facturas y el menú (productos, insumos,
-- categorías y recetas) de TODOS tus negocios.
-- Se conservan: tu usuario, el negocio, los locales, el personal y las comisiones.
-- OJO: no se puede deshacer.

begin;
delete from invoices;
delete from order_items;
delete from orders;
delete from inventory_movements;
delete from expenses;
delete from recipe_items;
delete from products;
delete from categories;
delete from ingredients;
commit;

-- Fotos de productos (opcional): Storage › productos › seleccionar todo › Delete.

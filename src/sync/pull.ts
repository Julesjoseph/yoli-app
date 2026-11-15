import type { SQLiteDatabase } from 'expo-sqlite';

import { supabase } from './supabase';

type Row = Record<string, unknown>;

async function fetchAll(table: string, build: (q: any) => any): Promise<Row[]> {
  if (!supabase) return [];
  const { data, error } = await build(supabase.from(table).select('*'));
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []) as Row[];
}

async function insertRows(db: SQLiteDatabase, table: string, rows: Row[], columns: string[]) {
  if (rows.length === 0) return;
  const sql = `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
  for (const r of rows) {
    await db.runAsync(
      sql,
      columns.map((c) => {
        const v = r[c];
        if (typeof v === 'boolean') return v ? 1 : 0;
        return (v ?? null) as string | number | null;
      }),
    );
  }
}

/**
 * Descarga el menú, insumos, recetas, comisiones y locales del negocio.
 * Reemplaza el catálogo local (solo el dueño/gerente lo cambia en la nube).
 */
export async function pullCatalog(db: SQLiteDatabase, businessId: string) {
  const byBusiness = (q: any) => q.eq('business_id', businessId);
  const [locations, categories, products, ingredients, commissions] = await Promise.all([
    fetchAll('locations', (q) => byBusiness(q).eq('active', true)),
    fetchAll('categories', byBusiness),
    fetchAll('products', byBusiness),
    fetchAll('ingredients', byBusiness),
    fetchAll('platform_commissions', byBusiness),
  ]);
  const productIds = products.map((p) => p.id as string);
  const recipes = productIds.length ? await fetchAll('recipe_items', (q) => q.in('product_id', productIds)) : [];
  // Combos (migración 0010). Si la nube aún no la tiene, se sigue sin combos.
  const combos = await fetchAll('combo_items', byBusiness).catch(() => null);

  await db.withTransactionAsync(async () => {
    if (combos) await db.runAsync('DELETE FROM combo_items');
    for (const t of ['recipe_items', 'products', 'categories', 'ingredients', 'platform_commissions', 'locations']) {
      await db.runAsync(`DELETE FROM ${t}`);
    }
    await insertRows(db, 'locations', locations, ['id', 'business_id', 'name', 'kind']);
    await insertRows(db, 'categories', categories, ['id', 'business_id', 'name', 'sort_order']);
    await insertRows(db, 'products', products, ['id', 'business_id', 'category_id', 'name', 'price', 'itbis_rate', 'active', 'image_url', 'price_pedidosya', 'price_ubereats', 'delivery_itbis_exempt']);
    await insertRows(db, 'ingredients', ingredients, ['id', 'business_id', 'name', 'unit', 'cost_per_unit', 'min_stock']);
    await insertRows(db, 'recipe_items', recipes, ['product_id', 'ingredient_id', 'quantity']);
    if (combos) {
      await insertRows(db, 'combo_items', combos, ['id', 'business_id', 'product_id', 'item_product_id', 'group_name', 'extra_price', 'sort_order']);
    }
    await insertRows(db, 'platform_commissions', commissions, ['business_id', 'platform_id', 'commission_rate']);
  });
  return { locations: locations.length, products: products.length };
}

const ORDER_COLUMNS = [
  'id', 'business_id', 'location_id', 'channel', 'external_ref', 'status', 'subtotal', 'itbis', 'tip_law', 'total',
  'platform_commission', 'net_income', 'payment_method', 'created_at', 'discount', 'cash_received', 'change_given', 'customer_id',
  'void_reason', 'voided_at',
];

export const EXPENSE_COLUMNS = [
  'id', 'business_id', 'location_id', 'category', 'description', 'amount', 'supplier_rnc', 'ncf', 'spent_at', 'created_at',
  'voided', 'void_reason', 'voided_at', 'supplier_name', 'paid', 'due_date', 'paid_at',
];

/** Gastos de la nube con valores por defecto (por si aún no se corrió 0019). */
export const withExpenseDefaults = (e: Row) => ({ ...e, voided: e.voided ?? false, paid: e.paid ?? true });

/**
 * Trae lo que se vendió/gastó en este local desde otros equipos (últimos 35 días,
 * suficiente para los reportes del mes) y el stock actual calculado en la nube.
 * Lo que este equipo aún no ha subido se conserva.
 */
export async function pullLocationActivity(db: SQLiteDatabase, businessId: string, locationId: string) {
  const since = new Date(Date.now() - 35 * 24 * 3600 * 1000);
  const [orders, expenses, stock] = await Promise.all([
    fetchAll('orders', (q) => q.eq('location_id', locationId).gte('created_at', since.toISOString())),
    fetchAll('expenses', (q) => q.eq('location_id', locationId).gte('created_at', since.toISOString())),
    fetchAll('stock_by_location', (q) => q.eq('location_id', locationId)),
  ]);
  const orderIds = orders.map((o) => o.id as string);
  const items: Row[] = [];
  for (let i = 0; i < orderIds.length; i += 200) {
    items.push(...(await fetchAll('order_items', (q) => q.in('order_id', orderIds.slice(i, i + 200)))));
  }

  const pending = `(SELECT json_extract(payload, '$.id') FROM outbox WHERE table_name = ?)`;
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE location_id = ? AND id NOT IN ${pending})`,
      [locationId, 'orders'],
    );
    await db.runAsync(`DELETE FROM orders WHERE location_id = ? AND id NOT IN ${pending}`, [locationId, 'orders']);
    await db.runAsync(`DELETE FROM expenses WHERE location_id = ? AND id NOT IN ${pending}`, [locationId, 'expenses']);
    await db.runAsync(`DELETE FROM inventory_movements WHERE location_id = ? AND id NOT IN ${pending}`, [
      locationId,
      'inventory_movements',
    ]);

    await insertRows(db, 'orders', orders.map((o) => ({ ...o, discount: o.discount ?? 0 })), ORDER_COLUMNS);
    await insertRows(db, 'order_items', items, ['id', 'order_id', 'product_id', 'name', 'unit_price', 'quantity']);
    await insertRows(db, 'expenses', expenses.map(withExpenseDefaults), EXPENSE_COLUMNS);
    // El stock de la nube entra como un solo movimiento por insumo (no se vuelve a subir).
    const now = new Date().toISOString();
    for (const s of stock) {
      await db.runAsync(
        `INSERT OR REPLACE INTO inventory_movements (id, business_id, location_id, ingredient_id, quantity, reason, note, created_at)
         VALUES (?, ?, ?, ?, ?, 'ajuste', 'Saldo en la nube', ?)`,
        [`saldo-${locationId}-${s.ingredient_id}`, businessId, locationId, s.ingredient_id as string, Number(s.quantity), now],
      );
    }
  });
  await pullCreditAndShopping(db, businessId, locationId).catch(() => undefined);
}

/**
 * Clientes a crédito, sus abonos y todas sus ventas a crédito (de cualquier fecha y local,
 * para que lo que debe cada cliente cuadre), y la lista de compras de este local.
 * Si la nube aún no tiene la migración 0016, no hace nada.
 */
export async function pullCreditAndShopping(db: SQLiteDatabase, businessId: string, locationId: string) {
  const byBusiness = (q: any) => q.eq('business_id', businessId);
  const [customers, payments, shopping] = await Promise.all([
    fetchAll('customers', byBusiness),
    fetchAll('customer_payments', byBusiness),
    fetchAll('shopping_items', (q) => q.eq('location_id', locationId).eq('deleted', false)),
  ]);
  const creditOrders = await fetchAll('orders', (q) => byBusiness(q).eq('payment_method', 'credito'));
  const ids = creditOrders.map((o) => o.id as string);
  const items: Row[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    items.push(...(await fetchAll('order_items', (q) => q.in('order_id', ids.slice(i, i + 200)))));
  }

  const pending = `(SELECT json_extract(payload, '$.id') FROM outbox WHERE table_name = ?)`;
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM customers WHERE id NOT IN ${pending}`, ['customers']);
    await db.runAsync(`DELETE FROM customer_payments WHERE id NOT IN ${pending}`, ['customer_payments']);
    await db.runAsync(`DELETE FROM shopping_items WHERE (location_id = ? OR location_id IS NULL) AND id NOT IN ${pending}`, [
      locationId,
      'shopping_items',
    ]);
    await insertRows(db, 'customers', customers, ['id', 'business_id', 'name', 'phone', 'rnc', 'note', 'credit_limit', 'active', 'created_at']);
    await insertRows(db, 'customer_payments', payments, [
      'id', 'business_id', 'location_id', 'customer_id', 'amount', 'method', 'note', 'voided', 'created_at',
    ]);
    await insertRows(db, 'shopping_items', shopping, [
      'id', 'business_id', 'location_id', 'name', 'quantity', 'note', 'done', 'deleted', 'done_at', 'created_at',
    ]);
    // Las ventas a crédito que aún no subió este equipo no se pisan.
    const local = new Set(
      (await db.getAllAsync<{ id: string }>(`SELECT json_extract(payload, '$.id') AS id FROM outbox WHERE table_name = 'orders'`)).map((r) => r.id),
    );
    const fresh = creditOrders.filter((o) => !local.has(o.id as string));
    await insertRows(db, 'orders', fresh.map((o) => ({ ...o, discount: o.discount ?? 0 })), ORDER_COLUMNS);
    const freshIds = new Set(fresh.map((o) => o.id as string));
    await insertRows(db, 'order_items', items.filter((i) => freshIds.has(i.order_id as string)), [
      'id', 'order_id', 'product_id', 'name', 'unit_price', 'quantity',
    ]);
  });
}

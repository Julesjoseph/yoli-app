import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Base de datos local (SQLite) en el teléfono/tablet.
 * Las columnas tienen los mismos nombres que en Supabase para que la
 * sincronización envíe las filas tal cual.
 */
const SCHEMA_VERSION = 1;

export async function migrate(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current >= SCHEMA_VERSION) return;

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'comida_rapida'
    );
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, category_id TEXT, name TEXT NOT NULL,
      price REAL NOT NULL, itbis_rate REAL NOT NULL DEFAULT 0.18, active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS ingredients (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, name TEXT NOT NULL, unit TEXT NOT NULL,
      cost_per_unit REAL NOT NULL DEFAULT 0, min_stock REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS recipe_items (
      product_id TEXT NOT NULL, ingredient_id TEXT NOT NULL, quantity REAL NOT NULL,
      PRIMARY KEY (product_id, ingredient_id)
    );
    CREATE TABLE IF NOT EXISTS platform_commissions (
      business_id TEXT NOT NULL, platform_id TEXT NOT NULL, commission_rate REAL NOT NULL,
      PRIMARY KEY (business_id, platform_id)
    );
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, location_id TEXT NOT NULL, ingredient_id TEXT NOT NULL,
      quantity REAL NOT NULL, reason TEXT NOT NULL, order_id TEXT, note TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, location_id TEXT NOT NULL, channel TEXT NOT NULL,
      external_ref TEXT, status TEXT NOT NULL DEFAULT 'pagada', subtotal REAL NOT NULL, itbis REAL NOT NULL,
      tip_law REAL NOT NULL DEFAULT 0, total REAL NOT NULL, platform_commission REAL NOT NULL DEFAULT 0,
      net_income REAL NOT NULL, payment_method TEXT, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS orders_by_date ON orders (location_id, created_at);
    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL, product_id TEXT, name TEXT NOT NULL,
      unit_price REAL NOT NULL, quantity INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, location_id TEXT, category TEXT NOT NULL,
      description TEXT, amount REAL NOT NULL, supplier_rnc TEXT, ncf TEXT, spent_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- Cola de cambios pendientes de subir a Supabase (funciona sin internet)
    CREATE TABLE IF NOT EXISTS outbox (
      seq INTEGER PRIMARY KEY AUTOINCREMENT, table_name TEXT NOT NULL, payload TEXT NOT NULL,
      created_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT
    );
  `);

  await seedDemoData(db);
  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

/** Datos de ejemplo para probar la app el primer día. */
async function seedDemoData(db: SQLiteDatabase) {
  const existing = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM locations');
  if (existing && existing.n > 0) return;

  const businessId = randomUUID();
  const locationId = randomUUID();
  await db.runAsync('INSERT INTO app_settings (key, value) VALUES (?, ?), (?, ?)', [
    'business_id', businessId, 'location_id', locationId,
  ]);
  await db.runAsync('INSERT INTO locations (id, business_id, name, kind) VALUES (?, ?, ?, ?)', [
    locationId, businessId, 'Local principal', 'mixto',
  ]);
  await db.runAsync(
    'INSERT INTO platform_commissions (business_id, platform_id, commission_rate) VALUES (?, ?, ?), (?, ?, ?)',
    [businessId, 'pedidosya', 0.25, businessId, 'ubereats', 0.3],
  );

  const cat = (name: string, order: number) => ({ id: randomUUID(), name, order });
  const cats = [cat('Comida rápida', 1), cat('Comedor', 2), cat('Cafetería', 3), cat('Bebidas', 4)];
  for (const c of cats) {
    await db.runAsync('INSERT INTO categories (id, business_id, name, sort_order) VALUES (?, ?, ?, ?)', [
      c.id, businessId, c.name, c.order,
    ]);
  }

  const ing = (name: string, unit: string, cost: number, min: number, initial: number) => ({
    id: randomUUID(), name, unit, cost, min, initial,
  });
  const ingredients = {
    pan: ing('Pan de hamburguesa', 'unidad', 15, 20, 60),
    carne: ing('Carne molida', 'g', 0.45, 2000, 6000),
    queso: ing('Queso', 'lonja', 8, 30, 80),
    papas: ing('Papas', 'g', 0.08, 3000, 10000),
    arroz: ing('Arroz', 'g', 0.06, 5000, 15000),
    pollo: ing('Pollo', 'g', 0.25, 3000, 8000),
    habichuelas: ing('Habichuelas', 'g', 0.1, 2000, 5000),
    cafe: ing('Café molido', 'g', 1.2, 500, 1500),
    leche: ing('Leche', 'ml', 0.07, 2000, 6000),
    refresco: ing('Refresco lata', 'unidad', 35, 24, 48),
  };
  for (const i of Object.values(ingredients)) {
    await db.runAsync(
      'INSERT INTO ingredients (id, business_id, name, unit, cost_per_unit, min_stock) VALUES (?, ?, ?, ?, ?, ?)',
      [i.id, businessId, i.name, i.unit, i.cost, i.min],
    );
    await db.runAsync(
      `INSERT INTO inventory_movements (id, business_id, location_id, ingredient_id, quantity, reason, note, created_at)
       VALUES (?, ?, ?, ?, ?, 'ajuste', 'Inventario inicial', ?)`,
      [randomUUID(), businessId, locationId, i.id, i.initial, new Date().toISOString()],
    );
  }

  const products: { name: string; price: number; cat: number; recipe: [keyof typeof ingredients, number][] }[] = [
    { name: 'Hamburguesa clásica', price: 295, cat: 0, recipe: [['pan', 1], ['carne', 150], ['queso', 1]] },
    { name: 'Papas fritas', price: 150, cat: 0, recipe: [['papas', 250]] },
    { name: 'Combo hamburguesa', price: 425, cat: 0, recipe: [['pan', 1], ['carne', 150], ['queso', 1], ['papas', 200], ['refresco', 1]] },
    { name: 'La bandera (arroz, habichuelas y pollo)', price: 275, cat: 1, recipe: [['arroz', 200], ['habichuelas', 150], ['pollo', 180]] },
    { name: 'Pollo guisado con arroz', price: 250, cat: 1, recipe: [['arroz', 200], ['pollo', 200]] },
    { name: 'Café', price: 75, cat: 2, recipe: [['cafe', 12]] },
    { name: 'Café con leche', price: 110, cat: 2, recipe: [['cafe', 12], ['leche', 150]] },
    { name: 'Refresco', price: 80, cat: 3, recipe: [['refresco', 1]] },
  ];
  for (const p of products) {
    const id = randomUUID();
    await db.runAsync(
      'INSERT INTO products (id, business_id, category_id, name, price, itbis_rate) VALUES (?, ?, ?, ?, ?, 0.18)',
      [id, businessId, cats[p.cat].id, p.name, p.price],
    );
    for (const [key, qty] of p.recipe) {
      await db.runAsync('INSERT INTO recipe_items (product_id, ingredient_id, quantity) VALUES (?, ?, ?)', [
        id, ingredients[key].id, qty,
      ]);
    }
  }
}

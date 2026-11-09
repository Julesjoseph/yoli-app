import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { loadSampleCatalog } from './catalog';
import { loadDemoActivity } from './demo';

/**
 * Base de datos local (SQLite) en el teléfono/tablet.
 * Las columnas tienen los mismos nombres que en Supabase para que la
 * sincronización envíe las filas tal cual.
 */
const SCHEMA_VERSION = 4;

export async function migrate(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current >= SCHEMA_VERSION) return;
  if (current >= 1) {
    // v2: foto de producto
    if (current < 2) await db.execAsync(`ALTER TABLE products ADD COLUMN image_url TEXT;`);
    // v3: precios para PedidosYa / Uber Eats y descuento en la orden
    if (current < 3) {
      await db.execAsync(`
        ALTER TABLE products ADD COLUMN price_pedidosya REAL;
        ALTER TABLE products ADD COLUMN price_ubereats REAL;
        ALTER TABLE orders ADD COLUMN discount REAL NOT NULL DEFAULT 0;
      `);
    }
    // v4: efectivo recibido y devuelta
    if (current < 4) {
      await db.execAsync(`
        ALTER TABLE orders ADD COLUMN cash_received REAL;
        ALTER TABLE orders ADD COLUMN change_given REAL;
      `);
    }
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    return;
  }

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
      price REAL NOT NULL, itbis_rate REAL NOT NULL DEFAULT 0.18, active INTEGER NOT NULL DEFAULT 1,
      image_url TEXT, price_pedidosya REAL, price_ubereats REAL
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
      net_income REAL NOT NULL, payment_method TEXT, created_at TEXT NOT NULL,
      discount REAL NOT NULL DEFAULT 0, cash_received REAL, change_given REAL
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

  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

const DATA_TABLES = [
  'order_items', 'orders', 'inventory_movements', 'expenses', 'recipe_items', 'products',
  'categories', 'ingredients', 'platform_commissions', 'locations', 'outbox', 'app_settings',
];

/** Borra todo lo guardado en el equipo (al cambiar de negocio o salir del modo demo). */
export async function resetLocalData(db: SQLiteDatabase) {
  await db.withTransactionAsync(async () => {
    for (const t of DATA_TABLES) {
      // Los ajustes de la impresora son del equipo, no del negocio: se conservan.
      await db.runAsync(t === 'app_settings' ? "DELETE FROM app_settings WHERE key NOT LIKE 'ticket_%'" : `DELETE FROM ${t}`);
    }
  });
}

export async function getSetting(db: SQLiteDatabase, key: string) {
  const r = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [key]);
  return r?.value ?? null;
}

export async function setSettings(db: SQLiteDatabase, values: Record<string, string | null>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === null) await db.runAsync('DELETE FROM app_settings WHERE key = ?', [key]);
    else await db.runAsync('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [key, value]);
  }
}

/** Datos de ejemplo para probar la app sin conexión a la nube (modo demo). */
const DEMO_DATA_VERSION = '2';

export async function ensureDemoData(db: SQLiteDatabase) {
  // Se vuelve a crear si el demo es de una versión anterior (sin ventas de prueba).
  if ((await getSetting(db, 'mode')) === 'demo' && (await getSetting(db, 'demo_data')) === DEMO_DATA_VERSION) return;
  await resetLocalData(db);

  const businessId = randomUUID();
  const locationId = randomUUID();
  await setSettings(db, {
    mode: 'demo',
    user_id: 'demo',
    business_id: businessId,
    business_name: 'Mi negocio (demo)',
    location_id: locationId,
    location_name: 'Local principal',
    role: 'dueno',
  });
  await db.runAsync('INSERT INTO locations (id, business_id, name, kind) VALUES (?, ?, ?, ?)', [
    locationId, businessId, 'Local principal', 'mixto',
  ]);
  await db.runAsync(
    'INSERT INTO platform_commissions (business_id, platform_id, commission_rate) VALUES (?, ?, ?), (?, ?, ?)',
    [businessId, 'pedidosya', 0.25, businessId, 'ubereats', 0.3],
  );

  const ctx = {
    demo: true,
    userId: 'demo',
    role: 'dueno' as const,
    businessId,
    businessName: 'Mi negocio (demo)',
    locationId,
    locationName: 'Local principal',
  };
  await loadSampleCatalog(db, ctx);
  await loadDemoActivity(db, ctx);
  await setSettings(db, { demo_data: DEMO_DATA_VERSION });
  await db.runAsync('DELETE FROM outbox'); // en demo no hay nube a la que subir
}

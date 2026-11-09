import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  buildProfitReport,
  computeOrderTotals,
  ingredientUsage,
  type Channel,
  type OrderForReport,
  type RecipeItem,
} from '@/lib/calc';

export interface Product {
  id: string;
  category_id: string | null;
  name: string;
  price: number;
  itbis_rate: number;
}
export interface Category {
  id: string;
  name: string;
}
export interface StockRow {
  id: string;
  name: string;
  unit: string;
  min_stock: number;
  cost_per_unit: number;
  quantity: number;
}
export interface Expense {
  id: string;
  category: string;
  description: string | null;
  amount: number;
  spent_at: string;
}
export type PaymentMethod = 'efectivo' | 'tarjeta' | 'transferencia' | 'plataforma';

/** Fecha local (AAAA-MM-DD), no UTC: en RD son 4 horas de diferencia. */
export const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export type Role = 'dueno' | 'gerente' | 'cajero' | 'cocina';

export const ROLE_LABELS: Record<Role, string> = {
  dueno: 'Dueño',
  gerente: 'Gerente',
  cajero: 'Cajero',
  cocina: 'Cocina',
};

export interface Context {
  demo: boolean;
  userId: string;
  role: Role;
  businessId: string;
  businessName: string;
  locationId: string;
  locationName: string;
}

/** Lee el negocio/local/rol activo. Devuelve null si falta elegir algo. */
export async function getContext(db: SQLiteDatabase): Promise<Context | null> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM app_settings');
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  if (!m.business_id || !m.location_id || !m.role || !m.user_id) return null;
  return {
    demo: m.mode === 'demo',
    userId: m.user_id,
    role: m.role as Role,
    businessId: m.business_id,
    businessName: m.business_name ?? '',
    locationId: m.location_id,
    locationName: m.location_name ?? '',
  };
}

// Tablas de la nube que guardan quién hizo el registro
const HAS_CREATED_BY = new Set(['orders', 'inventory_movements', 'expenses']);

async function enqueue(db: SQLiteDatabase, table: string, payload: object, ctx?: Context) {
  const body = ctx && !ctx.demo && HAS_CREATED_BY.has(table) ? { ...payload, created_by: ctx.userId } : payload;
  await db.runAsync('INSERT INTO outbox (table_name, payload, created_at) VALUES (?, ?, ?)', [
    table,
    JSON.stringify(body),
    new Date().toISOString(),
  ]);
}

export const listCategories = (db: SQLiteDatabase) =>
  db.getAllAsync<Category>('SELECT id, name FROM categories ORDER BY sort_order');

export const listProducts = (db: SQLiteDatabase) =>
  db.getAllAsync<Product>(
    'SELECT id, category_id, name, price, itbis_rate FROM products WHERE active = 1 ORDER BY name',
  );

export async function getCommissionRates(db: SQLiteDatabase, businessId: string) {
  const rows = await db.getAllAsync<{ platform_id: string; commission_rate: number }>(
    'SELECT platform_id, commission_rate FROM platform_commissions WHERE business_id = ?',
    [businessId],
  );
  return Object.fromEntries(rows.map((r) => [r.platform_id, r.commission_rate])) as Record<string, number>;
}

/**
 * Registra una venta: orden + líneas + descuento de inventario según receta,
 * todo en una transacción y en la cola de sincronización.
 */
export async function recordSale(
  db: SQLiteDatabase,
  ctx: Context,
  input: {
    channel: Channel;
    lines: { product: Product; quantity: number }[];
    paymentMethod: PaymentMethod;
    externalRef?: string;
    applyTipLaw?: boolean;
  },
) {
  const rates = await getCommissionRates(db, ctx.businessId);
  const totals = computeOrderTotals(
    input.lines.map((l) => ({ unitPrice: l.product.price, quantity: l.quantity, itbisRate: l.product.itbis_rate })),
    input.channel,
    { commissionRate: rates[input.channel] ?? 0, applyTipLaw: input.applyTipLaw },
  );
  const productIds = input.lines.map((l) => l.product.id);
  const recipes = await db.getAllAsync<{ product_id: string; ingredient_id: string; quantity: number }>(
    `SELECT product_id, ingredient_id, quantity FROM recipe_items
     WHERE product_id IN (${productIds.map(() => '?').join(',')})`,
    productIds,
  );
  const usage = ingredientUsage(
    input.lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
    recipes.map<RecipeItem>((r) => ({ productId: r.product_id, ingredientId: r.ingredient_id, quantity: r.quantity })),
  );

  const now = new Date().toISOString();
  const order = {
    id: randomUUID(),
    business_id: ctx.businessId,
    location_id: ctx.locationId,
    channel: input.channel,
    external_ref: input.externalRef || null,
    status: 'pagada',
    subtotal: totals.subtotal,
    itbis: totals.itbis,
    tip_law: totals.tipLaw,
    total: totals.total,
    platform_commission: totals.platformCommission,
    net_income: totals.netIncome,
    payment_method: input.paymentMethod,
    created_at: now,
  };

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO orders (id, business_id, location_id, channel, external_ref, status, subtotal, itbis, tip_law,
        total, platform_commission, net_income, payment_method, created_at)
       VALUES ($id, $business_id, $location_id, $channel, $external_ref, $status, $subtotal, $itbis, $tip_law,
        $total, $platform_commission, $net_income, $payment_method, $created_at)`,
      Object.fromEntries(Object.entries(order).map(([k, v]) => ['$' + k, v])),
    );
    await enqueue(db, 'orders', order, ctx);

    for (const l of input.lines) {
      const item = {
        id: randomUUID(),
        order_id: order.id,
        product_id: l.product.id,
        name: l.product.name,
        unit_price: l.product.price,
        quantity: l.quantity,
      };
      await db.runAsync(
        'INSERT INTO order_items (id, order_id, product_id, name, unit_price, quantity) VALUES (?, ?, ?, ?, ?, ?)',
        [item.id, item.order_id, item.product_id, item.name, item.unit_price, item.quantity],
      );
      await enqueue(db, 'order_items', item);
    }

    for (const [ingredientId, qty] of usage) {
      await insertMovement(db, ctx, ingredientId, -qty, 'venta', { orderId: order.id, createdAt: now });
    }
  });

  return { order, totals };
}

async function insertMovement(
  db: SQLiteDatabase,
  ctx: Context,
  ingredientId: string,
  quantity: number,
  reason: 'compra' | 'venta' | 'merma' | 'ajuste',
  extra: { orderId?: string; note?: string; createdAt?: string } = {},
) {
  const mv = {
    id: randomUUID(),
    business_id: ctx.businessId,
    location_id: ctx.locationId,
    ingredient_id: ingredientId,
    quantity,
    reason,
    order_id: extra.orderId ?? null,
    note: extra.note ?? null,
    created_at: extra.createdAt ?? new Date().toISOString(),
  };
  await db.runAsync(
    `INSERT INTO inventory_movements (id, business_id, location_id, ingredient_id, quantity, reason, order_id, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [mv.id, mv.business_id, mv.location_id, mv.ingredient_id, mv.quantity, mv.reason, mv.order_id, mv.note, mv.created_at],
  );
  await enqueue(db, 'inventory_movements', mv, ctx);
}

export async function addStock(
  db: SQLiteDatabase,
  ctx: Context,
  ingredientId: string,
  quantity: number,
  reason: 'compra' | 'merma' | 'ajuste',
) {
  await db.withTransactionAsync(() => insertMovement(db, ctx, ingredientId, quantity, reason));
}

export const listStock = (db: SQLiteDatabase, ctx: Context) =>
  db.getAllAsync<StockRow>(
    `SELECT i.id, i.name, i.unit, i.min_stock, i.cost_per_unit, COALESCE(SUM(m.quantity), 0) AS quantity
     FROM ingredients i
     LEFT JOIN inventory_movements m ON m.ingredient_id = i.id AND m.location_id = ?
     WHERE i.business_id = ?
     GROUP BY i.id ORDER BY i.name`,
    [ctx.locationId, ctx.businessId],
  );

export async function addExpense(
  db: SQLiteDatabase,
  ctx: Context,
  input: { category: string; description?: string; amount: number; ncf?: string; supplierRnc?: string },
) {
  const now = new Date();
  const exp = {
    id: randomUUID(),
    business_id: ctx.businessId,
    location_id: ctx.locationId,
    category: input.category,
    description: input.description || null,
    amount: input.amount,
    supplier_rnc: input.supplierRnc || null,
    ncf: input.ncf || null,
    spent_at: localDate(now),
    created_at: now.toISOString(),
  };
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO expenses (id, business_id, location_id, category, description, amount, supplier_rnc, ncf, spent_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [exp.id, exp.business_id, exp.location_id, exp.category, exp.description, exp.amount, exp.supplier_rnc, exp.ncf,
        exp.spent_at, exp.created_at],
    );
    await enqueue(db, 'expenses', exp, ctx);
  });
}

export const listExpenses = (db: SQLiteDatabase, ctx: Context, limit = 50) =>
  db.getAllAsync<Expense>(
    'SELECT id, category, description, amount, spent_at FROM expenses WHERE location_id = ? ORDER BY created_at DESC LIMIT ?',
    [ctx.locationId, limit],
  );

export type Period = 'hoy' | 'semana' | 'mes';

export function periodStart(period: Period, now = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'semana') d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // desde el lunes
  if (period === 'mes') d.setDate(1);
  return d;
}

export async function getReport(db: SQLiteDatabase, ctx: Context, period: Period) {
  const start = periodStart(period);
  const orders = await db.getAllAsync<{
    channel: Channel;
    total: number;
    tip_law: number;
    itbis: number;
    platform_commission: number;
    net_income: number;
  }>(
    `SELECT channel, total, tip_law, itbis, platform_commission, net_income FROM orders
     WHERE location_id = ? AND status = 'pagada' AND created_at >= ?`,
    [ctx.locationId, start.toISOString()],
  );
  const exp = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE location_id = ? AND spent_at >= ?',
    [ctx.locationId, localDate(start)],
  );
  const topProducts = await db.getAllAsync<{ name: string; qty: number; amount: number }>(
    `SELECT oi.name, SUM(oi.quantity) AS qty, SUM(oi.quantity * oi.unit_price) AS amount
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.location_id = ? AND o.status = 'pagada' AND o.created_at >= ?
     GROUP BY oi.name ORDER BY qty DESC LIMIT 5`,
    [ctx.locationId, start.toISOString()],
  );
  const report = buildProfitReport(
    orders.map<OrderForReport>((o) => ({
      channel: o.channel,
      total: o.total,
      tipLaw: o.tip_law,
      itbis: o.itbis,
      platformCommission: o.platform_commission,
      netIncome: o.net_income,
    })),
    exp?.total ?? 0,
  );
  return { report, topProducts };
}

export async function pendingSyncCount(db: SQLiteDatabase) {
  const r = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM outbox');
  return r?.n ?? 0;
}

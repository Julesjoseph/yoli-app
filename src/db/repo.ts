import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { notifyLocalChange } from '@/sync/sync';

import {
  buildProfitReport,
  computeOrderTotals,
  ingredientUsage,
  itbisFor,
  priceFor,
  round2,
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
  image_url: string | null;
  price_pedidosya: number | null;
  price_ubereats: number | null;
  /** 1 = no se cobra ITBIS en PedidosYa / Uber Eats (aunque en el local sí). */
  delivery_itbis_exempt?: number | null;
  /** Cuántas opciones para elegir tiene (si es combo con acompañantes). */
  choices?: number;
  /** En un combo ya armado: el producto real y los productos que eligió el cliente. */
  base_id?: string;
  chosen?: string[];
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
  /** Logo del negocio (URL), vacío si no tiene. */
  businessLogo: string;
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
    businessLogo: m.business_logo ?? '',
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
  // Se sube enseguida (un momento después, para juntar todo lo de la misma venta).
  if (!ctx?.demo) notifyLocalChange();
}

export const listCategories = (db: SQLiteDatabase) =>
  db.getAllAsync<Category>('SELECT id, name FROM categories ORDER BY sort_order');

export const listProducts = (db: SQLiteDatabase) =>
  db.getAllAsync<Product>(
    `SELECT id, category_id, name, price, itbis_rate, image_url, price_pedidosya, price_ubereats, delivery_itbis_exempt,
       (SELECT COUNT(*) FROM combo_items c WHERE c.product_id = products.id AND c.group_name <> '') AS choices
     FROM products WHERE active = 1 ORDER BY name`,
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
    /** Descuento en RD$ (con ITBIS). */
    discount?: number;
    /** Efectivo que entregó el cliente (para calcular la devuelta). */
    cashReceived?: number | null;
  },
) {
  const rates = await getCommissionRates(db, ctx.businessId);
  const totals = computeOrderTotals(
    input.lines.map((l) => ({ unitPrice: priceFor(l.product, input.channel), quantity: l.quantity, itbisRate: itbisFor(l.product, input.channel) })),
    input.channel,
    { commissionRate: rates[input.channel] ?? 0, applyTipLaw: input.applyTipLaw, discount: input.discount },
  );
  // Lo que se descuenta del inventario: el producto, lo que trae siempre (combo) y lo que eligió el cliente.
  const baseIds = [...new Set(input.lines.map((l) => l.product.base_id ?? l.product.id))];
  const fixed = await db.getAllAsync<{ product_id: string; item_product_id: string }>(
    `SELECT product_id, item_product_id FROM combo_items
     WHERE group_name = '' AND product_id IN (${baseIds.map(() => '?').join(',')})`,
    baseIds,
  );
  const sold = input.lines.flatMap((l) => {
    const base = l.product.base_id ?? l.product.id;
    return [
      { productId: base, quantity: l.quantity },
      ...fixed.filter((f) => f.product_id === base).map((f) => ({ productId: f.item_product_id, quantity: l.quantity })),
      ...(l.product.chosen ?? []).map((id) => ({ productId: id, quantity: l.quantity })),
    ];
  });
  const productIds = [...new Set(sold.map((s) => s.productId))];
  const recipes = await db.getAllAsync<{ product_id: string; ingredient_id: string; quantity: number }>(
    `SELECT product_id, ingredient_id, quantity FROM recipe_items
     WHERE product_id IN (${productIds.map(() => '?').join(',')})`,
    productIds,
  );
  const usage = ingredientUsage(
    sold,
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
    discount: totals.discount,
    cash_received: input.cashReceived ? round2(input.cashReceived) : null,
    change_given: input.cashReceived ? round2(Math.max(0, input.cashReceived - totals.total)) : null,
  };
  if (order.cash_received !== null && order.cash_received < totals.total) {
    throw new Error('El efectivo recibido es menor que el total.');
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO orders (id, business_id, location_id, channel, external_ref, status, subtotal, itbis, tip_law,
        total, platform_commission, net_income, payment_method, created_at, discount, cash_received, change_given)
       VALUES ($id, $business_id, $location_id, $channel, $external_ref, $status, $subtotal, $itbis, $tip_law,
        $total, $platform_commission, $net_income, $payment_method, $created_at, $discount, $cash_received, $change_given)`,
      Object.fromEntries(Object.entries(order).map(([k, v]) => ['$' + k, v])),
    );
    // El descuento solo se sube si hay uno (así sigue funcionando aunque la nube aún no tenga esa columna).
    // Las columnas nuevas solo se suben si tienen valor (así funciona aunque la nube aún no las tenga).
    const cloudOrder: Record<string, unknown> = { ...order };
    if (!order.discount) delete cloudOrder.discount;
    if (order.cash_received === null) {
      delete cloudOrder.cash_received;
      delete cloudOrder.change_given;
    }
    await enqueue(db, 'orders', cloudOrder, ctx);

    for (const l of input.lines) {
      const item = {
        id: randomUUID(),
        order_id: order.id,
        product_id: l.product.base_id ?? l.product.id,
        name: l.product.name,
        unit_price: priceFor(l.product, input.channel),
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

export interface RecentOrder {
  id: string;
  channel: Channel;
  total: number;
  created_at: string;
  items: number;
}

export const listRecentOrders = (db: SQLiteDatabase, ctx: Context, limit = 5) =>
  db.getAllAsync<RecentOrder>(
    `SELECT o.id, o.channel, o.total, o.created_at, COALESCE(SUM(oi.quantity), 0) AS items
     FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.location_id = ? AND o.status = 'pagada'
     GROUP BY o.id ORDER BY o.created_at DESC LIMIT ?`,
    [ctx.locationId, limit],
  );

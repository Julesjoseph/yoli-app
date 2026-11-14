import type { SQLiteDatabase } from 'expo-sqlite';

import { buildDashboard, dashStart, type DashExpense, type DashItem, type DashOrder, type DashPeriod } from '@/lib/dashboard';
import { supabase } from '@/sync/supabase';

import { listStock, localDate, type Context } from './repo';

const ORDER_COLS = 'id, location_id, channel, total, tip_law, itbis, platform_commission, net_income, created_at';

/** Ventas de todos los locales desde la nube (dueño o gerente con internet). */
async function fromCloud(ctx: Context, since: Date) {
  if (!supabase) throw new Error('sin nube');
  const [orders, expenses, locations] = await Promise.all([
    supabase.from('orders').select(ORDER_COLS).eq('business_id', ctx.businessId).eq('status', 'pagada').gte('created_at', since.toISOString()),
    supabase.from('expenses').select('location_id, amount, spent_at').eq('business_id', ctx.businessId).gte('spent_at', localDate(since)),
    supabase.from('locations').select('id, name').eq('business_id', ctx.businessId).eq('active', true),
  ]);
  for (const r of [orders, expenses, locations]) if (r.error) throw new Error(r.error.message);
  const ids = (orders.data ?? []).map((o) => o.id as string);
  const items: DashItem[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const r = await supabase.from('order_items').select('order_id, name, quantity, unit_price').in('order_id', ids.slice(i, i + 200));
    if (r.error) throw new Error(r.error.message);
    items.push(...((r.data ?? []) as DashItem[]));
  }
  return {
    orders: (orders.data ?? []).map((o) => ({ ...o, total: Number(o.total), tip_law: Number(o.tip_law), itbis: Number(o.itbis), platform_commission: Number(o.platform_commission), net_income: Number(o.net_income) })) as DashOrder[],
    expenses: (expenses.data ?? []).map((e) => ({ ...e, amount: Number(e.amount) })) as DashExpense[],
    items: items.map((i) => ({ ...i, quantity: Number(i.quantity), unit_price: Number(i.unit_price) })),
    locations: (locations.data ?? []) as { id: string; name: string }[],
  };
}

/** Lo guardado en este equipo (modo demo o sin internet): solo el local actual. */
async function fromDevice(db: SQLiteDatabase, ctx: Context, since: Date) {
  const orders = await db.getAllAsync<DashOrder>(
    `SELECT ${ORDER_COLS} FROM orders WHERE business_id = ? AND status = 'pagada' AND created_at >= ?`,
    [ctx.businessId, since.toISOString()],
  );
  const expenses = await db.getAllAsync<DashExpense>(
    'SELECT location_id, amount, spent_at FROM expenses WHERE business_id = ? AND spent_at >= ?',
    [ctx.businessId, localDate(since)],
  );
  const items = await db.getAllAsync<DashItem>(
    `SELECT oi.order_id, oi.name, oi.quantity, oi.unit_price FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.business_id = ? AND o.created_at >= ?`,
    [ctx.businessId, since.toISOString()],
  );
  const locations = await db.getAllAsync<{ id: string; name: string }>('SELECT id, name FROM locations WHERE business_id = ?', [ctx.businessId]);
  if (!locations.some((l) => l.id === ctx.locationId)) locations.push({ id: ctx.locationId, name: ctx.locationName });
  return { orders, expenses, items, locations };
}

export async function loadDashboard(db: SQLiteDatabase, ctx: Context, period: DashPeriod) {
  const since = dashStart(period);
  let source: 'nube' | 'equipo' = 'equipo';
  let raw;
  if (!ctx.demo && supabase) {
    try {
      raw = await fromCloud(ctx, since);
      source = 'nube';
    } catch {
      raw = await fromDevice(db, ctx, since);
    }
  } else {
    raw = await fromDevice(db, ctx, since);
  }
  const names = new Map(raw.locations.map((l) => [l.id, l.name]));
  const recent = [...raw.orders]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 8)
    .map((o) => ({ ...o, locationName: names.get(o.location_id) ?? '' }));
  const stock = await listStock(db, ctx);
  return {
    source,
    dash: buildDashboard(raw, period),
    recent,
    lowStock: stock.filter((s) => s.quantity <= s.min_stock),
  };
}

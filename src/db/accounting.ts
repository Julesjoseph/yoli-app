import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  buildPayables,
  buildStatement,
  periodRange,
  type AccExpense,
  type AccOrder,
  type AccPayment,
  type AccPeriod,
} from '@/lib/accounting';
import { listCustomers } from './credit';
import { EXPENSE_SELECT, localDate, type Context, type Expense } from './repo';
import { supabase } from '@/sync/supabase';
import { pushOutbox } from '@/sync/sync';
import { enqueue } from './repo';

const ORDER_COLS =
  'id, location_id, channel, status, total, tip_law, itbis, platform_commission, net_income, payment_method, created_at, external_ref, void_reason';

const num = (v: unknown) => Number(v ?? 0);

async function pageAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

/** Ventas, gastos y abonos del período desde la nube: todos los locales y cualquier fecha. */
async function fromCloud(ctx: Context, fromIso: string, toIso: string, fromKey: string, toKey: string) {
  if (!supabase) throw new Error('sin nube');
  const sb = supabase;
  const [orders, expenses, payments, payables] = await Promise.all([
    pageAll<AccOrder>((a, b) =>
      sb.from('orders').select('*').eq('business_id', ctx.businessId).gte('created_at', fromIso).lt('created_at', toIso).order('created_at').range(a, b),
    ),
    pageAll<AccExpense>((a, b) =>
      sb.from('expenses').select('*').eq('business_id', ctx.businessId).gte('spent_at', fromKey).lt('spent_at', toKey).order('spent_at').range(a, b),
    ),
    pageAll<AccPayment>((a, b) =>
      sb.from('customer_payments').select('amount, method, voided, created_at').eq('business_id', ctx.businessId).gte('created_at', fromIso).lt('created_at', toIso).range(a, b),
    ).catch(() => [] as AccPayment[]),
    // Cuentas por pagar: de cualquier fecha (si la nube aún no tiene 0019, no hay).
    pageAll<AccExpense>((a, b) => sb.from('expenses').select('*').eq('business_id', ctx.businessId).eq('paid', false).eq('voided', false).range(a, b)).catch(
      () => [] as AccExpense[],
    ),
  ]);
  const locations = await sb.from('locations').select('id, name').eq('business_id', ctx.businessId);
  return {
    orders: orders.map((o) => ({ ...o, total: num(o.total), tip_law: num(o.tip_law), itbis: num(o.itbis), platform_commission: num(o.platform_commission), net_income: num(o.net_income) })),
    expenses: expenses.map((e) => ({ ...e, amount: num(e.amount) })),
    payments: payments.map((p) => ({ ...p, amount: num(p.amount) })),
    payables: payables.map((e) => ({ ...e, amount: num(e.amount) })),
    locations: (locations.data ?? []) as { id: string; name: string }[],
  };
}

/** Lo guardado en este equipo (sin internet o demo): este local y los últimos 35 días. */
async function fromDevice(db: SQLiteDatabase, ctx: Context, fromIso: string, toIso: string, fromKey: string, toKey: string) {
  const [orders, expenses, payments, payables] = await Promise.all([
    db.getAllAsync<AccOrder>(`SELECT ${ORDER_COLS} FROM orders WHERE location_id = ? AND created_at >= ? AND created_at < ? ORDER BY created_at`, [
      ctx.locationId, fromIso, toIso,
    ]),
    db.getAllAsync<AccExpense>(`SELECT ${EXPENSE_SELECT}, location_id FROM expenses WHERE location_id = ? AND spent_at >= ? AND spent_at < ? ORDER BY spent_at`, [
      ctx.locationId, fromKey, toKey,
    ]),
    db.getAllAsync<AccPayment>('SELECT amount, method, voided, created_at FROM customer_payments WHERE created_at >= ? AND created_at < ?', [fromIso, toIso]),
    db.getAllAsync<AccExpense>(`SELECT ${EXPENSE_SELECT}, location_id FROM expenses WHERE location_id = ? AND paid = 0 AND voided = 0`, [ctx.locationId]),
  ]);
  return { orders, expenses, payments, payables, locations: [{ id: ctx.locationId, name: ctx.locationName }] };
}

export async function loadAccounting(db: SQLiteDatabase, ctx: Context, period: AccPeriod) {
  const range = periodRange(period);
  const args = [range.from.toISOString(), range.to.toISOString(), range.fromKey, range.toKey] as const;
  let source: 'nube' | 'equipo' = 'equipo';
  let raw;
  if (!ctx.demo && supabase) {
    try {
      // Lo que falta por subir, primero (para que la nube tenga todo).
      await pushOutbox(db).catch(() => undefined);
      raw = await fromCloud(ctx, ...args);
      source = 'nube';
    } catch {
      raw = await fromDevice(db, ctx, ...args);
    }
  } else {
    raw = await fromDevice(db, ctx, ...args);
  }
  const customers = await listCustomers(db, ctx).catch(() => []);
  const receivables = customers.filter((c) => c.balance > 0.009).sort((a, b) => b.balance - a.balance);
  return {
    source,
    range,
    ...raw,
    statement: buildStatement(raw),
    payables: buildPayables(raw.payables, localDate(new Date())),
    receivables: {
      items: receivables,
      total: Math.round(receivables.reduce((s, c) => s + c.balance, 0) * 100) / 100,
    },
  };
}

export type Accounting = Awaited<ReturnType<typeof loadAccounting>>;

// ---------------------------------------------------------------------------
// Gastos: detalle, pagar y anular
// ---------------------------------------------------------------------------

export const expenseRef = (id: string) => `gasto ${id.slice(0, 8)}`;

export interface InvoiceStockLine {
  ingredient_id: string;
  location_id: string;
  name: string;
  unit: string;
  /** Lo que entró con la factura. */
  bought: number;
  /** Lo que se quitó a mano (no era de la producción). */
  removed: number;
}

type MoveRow = { ingredient_id: string; location_id: string; quantity: number; reason: string; note: string | null };

/** Movimientos de inventario de una factura escaneada: de la nube si hay internet (el equipo solo guarda saldos). */
async function invoiceMoves(db: SQLiteDatabase, ctx: Context, id: string): Promise<MoveRow[]> {
  const like = `%${expenseRef(id)}`;
  const local = await db.getAllAsync<MoveRow>(
    'SELECT ingredient_id, location_id, quantity, reason, note FROM inventory_movements WHERE note LIKE ?',
    [like],
  );
  if (ctx.demo || !supabase) return local;
  const { data, error } = await supabase
    .from('inventory_movements')
    .select('id, ingredient_id, location_id, quantity, reason, note')
    .eq('business_id', ctx.businessId)
    .like('note', like);
  if (error) return local;
  // Lo de la nube más lo que este equipo todavía no ha subido.
  const pending = await db.getAllAsync<{ payload: string }>("SELECT payload FROM outbox WHERE table_name = 'inventory_movements'");
  const cloudIds = new Set((data ?? []).map((m) => m.id as string));
  const extra = pending
    .map((p) => JSON.parse(p.payload) as MoveRow & { id: string })
    .filter((m) => (m.note ?? '').endsWith(expenseRef(id)) && !cloudIds.has(m.id));
  return [...(data ?? []).map((m) => ({ ...(m as MoveRow), quantity: Number(m.quantity) })), ...extra];
}

export async function getInvoiceStock(db: SQLiteDatabase, ctx: Context, id: string): Promise<InvoiceStockLine[]> {
  const moves = await invoiceMoves(db, ctx, id);
  const names = new Map(
    (await db.getAllAsync<{ id: string; name: string; unit: string }>('SELECT id, name, unit FROM ingredients')).map((i) => [i.id, i]),
  );
  const lines = new Map<string, InvoiceStockLine>();
  for (const m of moves) {
    const key = `${m.ingredient_id}|${m.location_id}`;
    const ing = names.get(m.ingredient_id);
    if (!ing) continue; // insumo eliminado
    const l = lines.get(key) ?? { ingredient_id: m.ingredient_id, location_id: m.location_id, name: ing.name, unit: ing.unit, bought: 0, removed: 0 };
    if (m.reason === 'compra') l.bought += m.quantity;
    else if ((m.note ?? '').startsWith('Quitado')) l.removed += -m.quantity;
    lines.set(key, l);
  }
  return [...lines.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getExpense(db: SQLiteDatabase, ctx: Context, id: string) {
  const e = await db.getFirstAsync<Expense & { location_id: string | null }>(`SELECT ${EXPENSE_SELECT}, location_id FROM expenses WHERE id = ?`, [id]);
  if (!e) return null;
  // Lo que entró al inventario con esta factura (si se escaneó).
  const stock = await getInvoiceStock(db, ctx, id);
  const pending = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM outbox WHERE table_name = 'expenses' AND json_extract(payload, '$.id') = ?",
    [id],
  );
  return { ...e, stock, synced: !pending?.n };
}

/**
 * Quita del inventario un producto que entró con una factura pero no es de la producción
 * (por ejemplo, detergente o algo personal). El gasto no cambia: ese dinero sí se gastó.
 */
export async function removeInvoiceLine(db: SQLiteDatabase, ctx: Context, expenseId: string, line: InvoiceStockLine) {
  const left = Math.round((line.bought - line.removed) * 10000) / 10000;
  if (left <= 0) return;
  const now = new Date().toISOString();
  const mv = {
    id: randomUUID(),
    business_id: ctx.businessId,
    location_id: line.location_id,
    ingredient_id: line.ingredient_id,
    quantity: -left,
    reason: 'ajuste',
    order_id: null,
    note: `Quitado de ${expenseRef(expenseId)}`,
    created_at: now,
  };
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO inventory_movements (id, business_id, location_id, ingredient_id, quantity, reason, order_id, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [mv.id, mv.business_id, mv.location_id, mv.ingredient_id, mv.quantity, mv.reason, mv.order_id, mv.note, mv.created_at],
    );
    await enqueue(db, 'inventory_movements', mv, ctx);
  });
  if (!ctx.demo) await pushOutbox(db).catch(() => undefined);
}

async function expenseRow(db: SQLiteDatabase, id: string) {
  const e = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT id, business_id, location_id, category, description, amount, supplier_rnc, ncf, spent_at, created_at FROM expenses WHERE id = ?',
    [id],
  );
  if (!e) throw new Error('No se encontró el gasto.');
  return e;
}

/** Anula un gasto (no se borra: queda con el motivo en la auditoría). Necesita internet. */
export async function voidExpense(db: SQLiteDatabase, ctx: Context, id: string, reason: string) {
  const why = reason.trim();
  if (why.length < 3) throw new Error('Escribe el motivo (por ejemplo: "Se registró dos veces").');
  const row = await expenseRow(db, id);
  if (!ctx.demo) await requireSynced(db, 'expenses', id);
  const stock = await getInvoiceStock(db, ctx, id);
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE expenses SET voided = 1, void_reason = ?, voided_at = ? WHERE id = ?', [why, now, id]);
    // Lo que entró al inventario con esta factura sale (en la nube lo hace la base de datos;
    // aquí solo se muestra hasta la próxima sincronización).
    for (const m of stock) {
      const left = m.bought - m.removed;
      if (Math.abs(left) < 0.0001) continue;
      await db.runAsync(
        `INSERT OR REPLACE INTO inventory_movements (id, business_id, location_id, ingredient_id, quantity, reason, note, created_at)
         VALUES (?, ?, ?, ?, ?, 'ajuste', ?, ?)`,
        [`anula-${id}-${m.ingredient_id}`, ctx.businessId, m.location_id, m.ingredient_id, -left, `Anulación de ${expenseRef(id)}`, now],
      );
    }
    // Sin "created_by": así no cambia quién lo registró.
    await enqueue(db, 'expenses', { ...row, voided: true, void_reason: why });
  });
  if (!ctx.demo) await confirmPushed(db, 'expenses', id);
}

/** Marca como pagada una cuenta por pagar. */
export async function markExpensePaid(db: SQLiteDatabase, ctx: Context, id: string) {
  const row = await expenseRow(db, id);
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE expenses SET paid = 1, paid_at = ? WHERE id = ?', [now, id]);
    await enqueue(db, 'expenses', { ...row, paid: true, paid_at: now });
  });
  if (!ctx.demo) await pushOutbox(db).catch(() => undefined);
}

/** Marca como pagada una cuenta por pagar que solo está en la nube (de otro local o más vieja). */
export async function markCloudExpensePaid(db: SQLiteDatabase, ctx: Context, id: string) {
  const local = await db.getFirstAsync<{ id: string }>('SELECT id FROM expenses WHERE id = ?', [id]);
  if (local || ctx.demo || !supabase) return markExpensePaid(db, ctx, id);
  const { error } = await supabase.from('expenses').update({ paid: true, paid_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Ventas: anular
// ---------------------------------------------------------------------------

async function requireSynced(db: SQLiteDatabase, table: string, id: string) {
  await pushOutbox(db).catch(() => undefined);
  const pending = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM outbox WHERE table_name = ? AND json_extract(payload, '$.id') = ?",
    [table, id],
  );
  if (pending?.n) {
    throw new Error('Este registro todavía no está en la nube. Conéctate a internet, toca Sincronizar en Perfil y vuelve a intentar.');
  }
}

/** Sube el cambio y avisa si la nube no lo aceptó (por ejemplo, si falta correr 0019). */
async function confirmPushed(db: SQLiteDatabase, table: string, id: string) {
  await pushOutbox(db).catch(() => undefined);
  const row = await db.getFirstAsync<{ last_error: string | null }>(
    "SELECT last_error FROM outbox WHERE table_name = ? AND json_extract(payload, '$.id') = ? ORDER BY seq DESC LIMIT 1",
    [table, id],
  );
  if (!row) return;
  const err = row.last_error ?? '';
  if (/void_reason|voided|column/i.test(err)) {
    throw new Error('Quedó anulado en este equipo, pero falta correr 0019_contabilidad_auditoria.sql en Supabase para que se guarde en la nube.');
  }
  if (err) throw new Error(`Quedó anulado en este equipo, pero la nube respondió: ${err}`);
}

/** Anula una venta: deja de contar, el inventario vuelve y queda en la auditoría. Necesita internet. */
export async function voidSale(db: SQLiteDatabase, ctx: Context, orderId: string, reason: string) {
  const why = reason.trim();
  if (why.length < 3) throw new Error('Escribe el motivo (por ejemplo: "Se cobró dos veces").');
  const o = await db.getFirstAsync<Record<string, unknown> & { status: string }>(
    `SELECT id, business_id, location_id, channel, external_ref, status, subtotal, itbis, tip_law, total,
            platform_commission, net_income, payment_method, created_at FROM orders WHERE id = ?`,
    [orderId],
  );
  if (!o) throw new Error('No se encontró la venta.');
  if (o.status === 'anulada') return;
  if (!ctx.demo) await requireSynced(db, 'orders', orderId);
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync("UPDATE orders SET status = 'anulada', void_reason = ?, voided_at = ? WHERE id = ?", [why, now, orderId]);
    const moves = await db.getAllAsync<{ ingredient_id: string; quantity: number; location_id: string }>(
      "SELECT ingredient_id, quantity, location_id FROM inventory_movements WHERE order_id = ? AND reason = 'venta'",
      [orderId],
    );
    for (const m of moves) {
      await db.runAsync(
        `INSERT OR REPLACE INTO inventory_movements (id, business_id, location_id, ingredient_id, quantity, reason, order_id, note, created_at)
         VALUES (?, ?, ?, ?, ?, 'ajuste', ?, 'Anulación de venta', ?)`,
        [`anula-${orderId}-${m.ingredient_id}`, ctx.businessId, m.location_id, m.ingredient_id, -m.quantity, orderId, now],
      );
    }
    await enqueue(db, 'orders', { ...o, status: 'anulada', void_reason: why });
  });
  if (!ctx.demo) await confirmPushed(db, 'orders', orderId);
}

// ---------------------------------------------------------------------------
// Auditoría
// ---------------------------------------------------------------------------

export interface AuditEntry {
  key: string;
  kind: 'venta' | 'gasto';
  action: 'anular' | 'pagar';
  id: string;
  amount: number;
  reason: string | null;
  who: string | null;
  at: string;
  detail: string;
}

/** Ventas y gastos anulados (y pagos de cuentas por pagar): de la nube si hay internet, si no del equipo. */
export async function listAudit(db: SQLiteDatabase, ctx: Context): Promise<{ source: 'nube' | 'equipo'; items: AuditEntry[] }> {
  if (!ctx.demo && supabase) {
    const { data, error } = await supabase
      .from('audit_log')
      .select('id, table_name, record_id, action, reason, amount, snapshot, user_name, created_at')
      .eq('business_id', ctx.businessId)
      .order('created_at', { ascending: false })
      .limit(300);
    if (!error) {
      return {
        source: 'nube',
        items: (data ?? []).map((r) => {
          const s = (r.snapshot ?? {}) as Record<string, unknown>;
          const kind = r.table_name === 'orders' ? 'venta' : 'gasto';
          const detail =
            kind === 'venta'
              ? ((s.items as { quantity: number; name: string }[] | undefined) ?? []).map((i) => `${i.quantity}× ${i.name}`).join(', ')
              : [s.supplier_name, s.description, s.ncf].filter(Boolean).join(' · ');
          return {
            key: `n${r.id}`,
            kind,
            action: r.action === 'pagar' ? 'pagar' : 'anular',
            id: r.record_id as string,
            amount: num(r.amount),
            reason: (r.reason as string | null) ?? null,
            who: (r.user_name as string | null) ?? null,
            at: r.created_at as string,
            detail: String(detail || ''),
          } satisfies AuditEntry;
        }),
      };
    }
  }
  const [orders, expenses] = await Promise.all([
    db.getAllAsync<{ id: string; total: number; void_reason: string | null; voided_at: string | null; created_at: string; items: string | null }>(
      `SELECT o.id, o.total, o.void_reason, o.voided_at, o.created_at, GROUP_CONCAT(oi.quantity || '× ' || oi.name, ', ') AS items
         FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.status = 'anulada' GROUP BY o.id`,
    ),
    db.getAllAsync<{ id: string; amount: number; void_reason: string | null; voided_at: string | null; created_at: string; description: string | null; supplier_name: string | null }>(
      'SELECT id, amount, void_reason, voided_at, created_at, description, supplier_name FROM expenses WHERE voided = 1',
    ),
  ]);
  const items: AuditEntry[] = [
    ...orders.map((o) => ({ key: `o${o.id}`, kind: 'venta' as const, action: 'anular' as const, id: o.id, amount: o.total, reason: o.void_reason, who: null, at: o.voided_at ?? o.created_at, detail: o.items ?? '' })),
    ...expenses.map((e) => ({ key: `e${e.id}`, kind: 'gasto' as const, action: 'anular' as const, id: e.id, amount: e.amount, reason: e.void_reason, who: null, at: e.voided_at ?? e.created_at, detail: [e.supplier_name, e.description].filter(Boolean).join(' · ') })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return { source: 'equipo', items };
}

import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { round2 } from '@/lib/calc';
import { supabase } from '@/sync/supabase';

import { enqueue, type Context } from './repo';

/** Ventas a crédito (fiao): clientes, lo que deben y sus abonos. */

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  rnc: string | null;
  note: string | null;
  credit_limit: number | null;
  active: number;
  created_at: string;
}

export interface CustomerWithBalance extends Customer {
  /** Lo que ha comprado a crédito (sin anuladas). */
  charged: number;
  /** Lo que ha abonado. */
  paid: number;
  /** Lo que debe ahora. */
  balance: number;
  /** Última venta a crédito o abono. */
  last_at: string | null;
}

export type CreditPayMethod = 'efectivo' | 'tarjeta' | 'transferencia';

export interface CreditMovement {
  kind: 'venta' | 'abono';
  id: string;
  amount: number;
  created_at: string;
  /** Venta: lo que llevó. Abono: forma de pago y nota. */
  detail: string | null;
  method?: string | null;
}

const BALANCE_SQL = `
  SELECT c.*,
    COALESCE((SELECT SUM(o.total) FROM orders o WHERE o.customer_id = c.id AND o.payment_method = 'credito' AND o.status <> 'anulada'), 0) AS charged,
    COALESCE((SELECT SUM(p.amount) FROM customer_payments p WHERE p.customer_id = c.id AND p.voided = 0), 0) AS paid,
    MAX(
      COALESCE((SELECT MAX(o.created_at) FROM orders o WHERE o.customer_id = c.id AND o.payment_method = 'credito'), ''),
      COALESCE((SELECT MAX(p.created_at) FROM customer_payments p WHERE p.customer_id = c.id AND p.voided = 0), '')
    ) AS last_at
  FROM customers c`;

const withBalance = (r: Omit<CustomerWithBalance, 'balance'>): CustomerWithBalance => ({
  ...r,
  charged: round2(r.charged),
  paid: round2(r.paid),
  balance: round2(r.charged - r.paid),
  last_at: r.last_at || null,
});

/** Todos los clientes con lo que deben, los que más deben primero. */
export async function listCustomers(db: SQLiteDatabase, ctx: Context) {
  const rows = await db.getAllAsync<Omit<CustomerWithBalance, 'balance'>>(
    `${BALANCE_SQL} WHERE c.business_id = ? AND c.active = 1 ORDER BY c.name COLLATE NOCASE`,
    [ctx.businessId],
  );
  return rows.map(withBalance).sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
}

export async function getCustomer(db: SQLiteDatabase, id: string) {
  const r = await db.getFirstAsync<Omit<CustomerWithBalance, 'balance'>>(`${BALANCE_SQL} WHERE c.id = ?`, [id]);
  return r ? withBalance(r) : null;
}

/** Ventas a crédito y abonos de un cliente, lo más nuevo primero. */
export async function listCustomerMovements(db: SQLiteDatabase, customerId: string): Promise<CreditMovement[]> {
  const sales = await db.getAllAsync<{ id: string; total: number; created_at: string; items: string | null }>(
    `SELECT o.id, o.total, o.created_at, GROUP_CONCAT(oi.quantity || '× ' || oi.name, ', ') AS items
       FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.customer_id = ? AND o.payment_method = 'credito' AND o.status <> 'anulada'
      GROUP BY o.id`,
    [customerId],
  );
  const pays = await db.getAllAsync<{ id: string; amount: number; created_at: string; method: string; note: string | null }>(
    'SELECT id, amount, created_at, method, note FROM customer_payments WHERE customer_id = ? AND voided = 0',
    [customerId],
  );
  return [
    ...sales.map((s) => ({ kind: 'venta' as const, id: s.id, amount: s.total, created_at: s.created_at, detail: s.items })),
    ...pays.map((p) => ({ kind: 'abono' as const, id: p.id, amount: p.amount, created_at: p.created_at, detail: p.note, method: p.method })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

const cloudCustomer = (c: Customer & { business_id: string }) => ({ ...c, active: !!c.active });

/** Crea o cambia un cliente. Devuelve su id. */
export async function saveCustomer(
  db: SQLiteDatabase,
  ctx: Context,
  input: { id?: string; name: string; phone?: string; rnc?: string; note?: string; creditLimit?: number | null },
) {
  const name = input.name.trim();
  if (!name) throw new Error('Escribe el nombre del cliente.');
  const old = input.id ? await db.getFirstAsync<Customer>('SELECT * FROM customers WHERE id = ?', [input.id]) : null;
  const row = {
    id: old?.id ?? randomUUID(),
    business_id: ctx.businessId,
    name,
    phone: input.phone?.trim() || null,
    rnc: input.rnc?.replace(/\D/g, '') || null,
    note: input.note?.trim() || null,
    credit_limit: input.creditLimit && input.creditLimit > 0 ? round2(input.creditLimit) : null,
    active: 1,
    created_at: old?.created_at ?? new Date().toISOString(),
  };
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT OR REPLACE INTO customers (id, business_id, name, phone, rnc, note, credit_limit, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.id, row.business_id, row.name, row.phone, row.rnc, row.note, row.credit_limit, row.active, row.created_at],
    );
    await enqueue(db, 'customers', cloudCustomer(row), ctx);
  });
  return row.id;
}

/** Quita el cliente de la lista (solo si no debe nada). */
export async function archiveCustomer(db: SQLiteDatabase, ctx: Context, id: string) {
  const c = await getCustomer(db, id);
  if (!c) return;
  if (c.balance > 0.009) throw new Error(`No se puede quitar: todavía debe ${c.balance.toFixed(2)}.`);
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE customers SET active = 0 WHERE id = ?', [id]);
    const { charged, paid, balance, last_at, ...rest } = c;
    await enqueue(db, 'customers', cloudCustomer({ ...rest, active: 0, business_id: ctx.businessId }), ctx);
  });
}

/** Registra un abono. No deja abonar más de lo que debe. */
export async function addCustomerPayment(
  db: SQLiteDatabase,
  ctx: Context,
  input: { customerId: string; amount: number; method: CreditPayMethod; note?: string },
) {
  const c = await getCustomer(db, input.customerId);
  if (!c) throw new Error('No se encontró el cliente.');
  const amount = round2(input.amount);
  if (!(amount > 0)) throw new Error('Escribe un monto válido.');
  if (amount > c.balance + 0.009) throw new Error('El abono es mayor que lo que debe.');
  const row = {
    id: randomUUID(),
    business_id: ctx.businessId,
    location_id: ctx.locationId,
    customer_id: c.id,
    amount,
    method: input.method,
    note: input.note?.trim() || null,
    voided: 0,
    created_at: new Date().toISOString(),
  };
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO customer_payments (id, business_id, location_id, customer_id, amount, method, note, voided, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.id, row.business_id, row.location_id, row.customer_id, row.amount, row.method, row.note, row.voided, row.created_at],
    );
    await enqueue(db, 'customer_payments', { ...row, voided: false }, ctx);
  });
  return { ...row, balance: round2(c.balance - amount) };
}

/** Anula un abono hecho por error. */
export async function voidCustomerPayment(db: SQLiteDatabase, ctx: Context, id: string) {
  const p = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM customer_payments WHERE id = ?', [id]);
  if (!p) return;
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE customer_payments SET voided = 1 WHERE id = ?', [id]);
    await enqueue(db, 'customer_payments', { ...p, voided: true }, ctx);
  });
}

/** Total por cobrar y abonos recibidos hoy en este local. */
export async function creditSummary(db: SQLiteDatabase, ctx: Context, since: string) {
  const customers = await listCustomers(db, ctx);
  const today = await db.getFirstAsync<{ n: number }>(
    'SELECT COALESCE(SUM(amount), 0) AS n FROM customer_payments WHERE location_id = ? AND voided = 0 AND created_at >= ?',
    [ctx.locationId, since],
  );
  const owing = customers.filter((c) => c.balance > 0.009);
  return {
    receivable: round2(owing.reduce((n, c) => n + c.balance, 0)),
    owingCount: owing.length,
    paidToday: round2(today?.n ?? 0),
  };
}

/** Mensaje de WhatsApp para recordarle al cliente lo que debe. */
export function whatsappReminder(c: { name: string; phone: string | null; balance: number }, businessName: string) {
  const digits = (c.phone ?? '').replace(/\D/g, '');
  if (!digits) return null;
  // Números de RD de 10 dígitos (809/829/849) llevan el 1 delante.
  const intl = digits.length === 10 ? `1${digits}` : digits;
  const amount = `RD$ ${c.balance.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = `Hola ${c.name.split(' ')[0]}, te saluda ${businessName}. Te recordamos que tienes un balance pendiente de ${amount}. ¡Gracias!`;
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
}

let cloudReady: boolean | null = null;
/**
 * ¿La nube ya tiene la migración 0016 (clientes y crédito)? En demo siempre sí.
 * Sin internet se deja usar (se sube cuando vuelva).
 */
export async function creditCloudReady(ctx: Context) {
  if (ctx.demo || !supabase || cloudReady) return true;
  const { error } = await supabase.from('customers').select('id', { head: true, count: 'exact' }).limit(1);
  if (!error) return (cloudReady = true);
  return !/customers|relation|schema cache|does not exist/i.test(error.message);
}

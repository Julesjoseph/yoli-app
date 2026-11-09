import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { computeOrderTotals, ingredientUsage, priceFor, type Channel } from '@/lib/calc';

import { addExpense, addStock, getCommissionRates, listProducts, listStock, type Context, type PaymentMethod } from './repo';

/** Generador de números al azar con semilla: el demo se ve igual cada vez. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const DAYS = 30;

/**
 * Llena el modo demo con un mes de actividad de prueba: ventas en todos los
 * canales, gastos y compras de inventario. Solo se usa en el modo demo.
 */
export async function loadDemoActivity(db: SQLiteDatabase, ctx: Context, now = new Date()) {
  const rand = rng(20261109);
  const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)];
  const products = await listProducts(db);
  if (!products.length) return;
  // Lo más vendido sale más seguido.
  const weighted = products.flatMap((p) =>
    Array(/hamburguesa|bandera|café con leche/i.test(p.name) ? 3 : /combo|pollo|refresco/i.test(p.name) ? 2 : 1).fill(p),
  );

  const rates = await getCommissionRates(db, ctx.businessId);
  const recipes = (
    await db.getAllAsync<{ product_id: string; ingredient_id: string; quantity: number }>(
      'SELECT product_id, ingredient_id, quantity FROM recipe_items',
    )
  ).map((r) => ({ productId: r.product_id, ingredientId: r.ingredient_id, quantity: r.quantity }));

  // Todas las ventas en una sola transacción (mucho más rápido, sobre todo en la PC).
  await db.withTransactionAsync(async () => {
    for (let daysAgo = DAYS - 1; daysAgo >= 0; daysAgo--) {
      const day = new Date(now);
      day.setDate(day.getDate() - daysAgo);
      const weekend = day.getDay() === 0 || day.getDay() === 5 || day.getDay() === 6;
      let count = Math.round((weekend ? 11 : 7) + rand() * 4);
      // Hoy solo las ventas que ya pasaron.
      const lastHour = daysAgo === 0 ? now.getHours() - 1 : 21;
      if (lastHour < 7) count = 0;

      for (let n = 0; n < count; n++) {
        const at = new Date(day);
        at.setHours(7 + Math.floor(rand() * (lastHour - 6)), Math.floor(rand() * 60), Math.floor(rand() * 60), 0);
        const iso = at.toISOString();
        const r = rand();
        const channel: Channel = r < 0.45 ? 'local' : r < 0.65 ? 'para_llevar' : r < 0.85 ? 'pedidosya' : 'ubereats';
        const delivery = channel === 'pedidosya' || channel === 'ubereats';
        const lines = new Map<string, { product: (typeof products)[number]; quantity: number }>();
        const items = 1 + Math.floor(rand() * 3);
        for (let i = 0; i < items; i++) {
          const p = pick(weighted);
          const line = lines.get(p.id);
          if (line) line.quantity++;
          else lines.set(p.id, { product: p, quantity: 1 });
        }
        const pay: PaymentMethod = delivery ? 'plataforma' : pick<PaymentMethod>(['efectivo', 'efectivo', 'tarjeta', 'transferencia']);
        const totals = computeOrderTotals(
          [...lines.values()].map((l) => ({
            unitPrice: priceFor(l.product, channel),
            quantity: l.quantity,
            itbisRate: l.product.itbis_rate,
          })),
          channel,
          { commissionRate: rates[channel] ?? 0, applyTipLaw: channel === 'local', discount: channel === 'local' && rand() < 0.1 ? 50 : 0 },
        );
        // Efectivo: el cliente paga con un billete y se le da la devuelta.
        const cash = pay === 'efectivo' ? ([500, 1000, 2000].find((b) => b >= totals.total) ?? Math.ceil(totals.total / 100) * 100) : null;
        const orderId = randomUUID();
        await db.runAsync(
          `INSERT INTO orders (id, business_id, location_id, channel, external_ref, status, subtotal, itbis, tip_law, total,
            platform_commission, net_income, payment_method, created_at, discount, cash_received, change_given)
           VALUES (?, ?, ?, ?, ?, 'pagada', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            orderId, ctx.businessId, ctx.locationId, channel,
            delivery ? `${channel === 'pedidosya' ? 'PY' : 'UE'}-${100000 + Math.floor(rand() * 899999)}` : null,
            totals.subtotal, totals.itbis, totals.tipLaw, totals.total, totals.platformCommission, totals.netIncome,
            pay, iso, totals.discount, cash, cash === null ? null : Math.round((cash - totals.total) * 100) / 100,
          ],
        );
        for (const l of lines.values()) {
          await db.runAsync('INSERT INTO order_items (id, order_id, product_id, name, unit_price, quantity) VALUES (?, ?, ?, ?, ?, ?)', [
            randomUUID(), orderId, l.product.id, l.product.name, priceFor(l.product, channel), l.quantity,
          ]);
        }
        const usage = ingredientUsage([...lines.values()].map((l) => ({ productId: l.product.id, quantity: l.quantity })), recipes);
        for (const [ingredientId, qty] of usage) {
          await db.runAsync(
            `INSERT INTO inventory_movements (id, business_id, location_id, ingredient_id, quantity, reason, order_id, created_at)
             VALUES (?, ?, ?, ?, ?, 'venta', ?, ?)`,
            [randomUUID(), ctx.businessId, ctx.locationId, ingredientId, -qty, orderId, iso],
          );
        }
      }
    }
  });

  // Gastos del mes.
  const expenses: { daysAgo: number; category: string; description: string; amount: number; ncf?: string }[] = [
    { daysAgo: 28, category: 'alquiler', description: 'Alquiler del local', amount: 15000, ncf: 'B0100000123' },
    { daysAgo: 25, category: 'servicios', description: 'Luz (Edesur)', amount: 4650, ncf: 'B0100004567' },
    { daysAgo: 24, category: 'servicios', description: 'Internet y teléfono', amount: 1990, ncf: 'B0100007788' },
    { daysAgo: 15, category: 'nomina', description: 'Quincena empleados', amount: 12000 },
    { daysAgo: 0, category: 'nomina', description: 'Quincena empleados', amount: 12000 },
    { daysAgo: 20, category: 'marketing', description: 'Anuncio en Instagram', amount: 1500 },
    { daysAgo: 12, category: 'mantenimiento', description: 'Arreglo de la nevera', amount: 2200 },
  ];
  for (let d = DAYS - 2; d >= 0; d -= 7) {
    expenses.push({ daysAgo: d, category: 'insumos', description: 'Compra en el supermercado', amount: 3500 + Math.round(rand() * 1500) });
    expenses.push({ daysAgo: Math.max(0, d - 3), category: 'gas', description: 'Tanque de gas', amount: 1350 });
  }
  for (const e of expenses) {
    await addExpense(db, ctx, e);
    const day = new Date(now);
    day.setDate(day.getDate() - e.daysAgo);
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    day.setHours(10, 0, 0, 0);
    await db.runAsync(
      'UPDATE expenses SET spent_at = ?, created_at = ? WHERE id = (SELECT id FROM expenses ORDER BY rowid DESC LIMIT 1)',
      [date, day.toISOString()],
    );
  }

  // Compras de inventario: todo queda con existencia, y dos insumos bajos para ver la alerta.
  for (const s of await listStock(db, ctx)) {
    const low = /refresco|queso/i.test(s.name);
    const target = low ? s.min_stock * 0.6 : s.min_stock * (2 + rand());
    const qty = Math.round(target - s.quantity);
    if (qty > 0) await addStock(db, ctx, s.id, qty, 'compra');
  }
}

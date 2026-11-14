import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboard } from '../src/lib/dashboard.ts';

const now = new Date(2026, 10, 9, 15, 0);
const at = (daysAgo: number, hour = 12) => new Date(2026, 10, 9 - daysAgo, hour).toISOString();
const order = (id: string, loc: string, channel: any, total: number, daysAgo: number) => ({
  id, location_id: loc, channel, total, tip_law: 0, itbis: total * 0.18 / 1.18, platform_commission: channel === 'pedidosya' ? 25 : 0,
  net_income: channel === 'pedidosya' ? total - 25 : total, created_at: at(daysAgo),
});

const input = {
  orders: [order('a', 'L1', 'local', 118, 0), order('b', 'L2', 'pedidosya', 236, 0), order('c', 'L1', 'local', 118, 10)],
  expenses: [{ location_id: 'L1', amount: 50, spent_at: '2026-11-09' }],
  items: [{ order_id: 'a', name: 'Café', quantity: 2, unit_price: 59 }, { order_id: 'c', name: 'Viejo', quantity: 9, unit_price: 1 }],
  locations: [{ id: 'L1', name: 'Centro' }, { id: 'L2', name: 'Norte' }],
};

test('panel: hoy suma todos los locales y filtra por fecha', () => {
  const d = buildDashboard(input, 'hoy', now);
  assert.equal(d.orders, 2);
  assert.equal(d.gross, 354);
  assert.equal(d.avgTicket, 177);
  assert.equal(d.channels.pedidosya.commission, 25);
  assert.equal(d.expenses, 50);
  assert.deepEqual(d.locations.map((l) => l.name), ['Norte', 'Centro']);
  assert.deepEqual(d.topProducts.map((p) => p.name), ['Café']);
  assert.equal(d.series.find((s) => s.key === '12')?.orders, 2);
});

test('panel: 30 días incluye órdenes viejas y una barra por día', () => {
  const d = buildDashboard(input, '30d', now);
  assert.equal(d.orders, 3);
  assert.equal(d.series.length, 30);
});

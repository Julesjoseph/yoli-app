import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPayables, buildStatement, periodRange } from '../src/lib/accounting.ts';

const order = (o: Partial<Parameters<typeof buildStatement>[0]['orders'][number]>) => ({
  id: 'x', channel: 'local', status: 'pagada', total: 0, tip_law: 0, itbis: 0, platform_commission: 0, net_income: 0,
  payment_method: 'efectivo', created_at: '2026-11-15T12:00:00Z', ...o,
});

test('estado de resultados: ITBIS, comisión, propina, anuladas y gastos', () => {
  const s = buildStatement({
    orders: [
      // Comedor: 100 + 18 ITBIS + 10 propina, en efectivo
      order({ total: 128, tip_law: 10, itbis: 18, net_income: 118 }),
      // PedidosYa: 236 con ITBIS, 25 % de comisión
      order({ channel: 'pedidosya', total: 236, itbis: 36, platform_commission: 59, net_income: 177, payment_method: 'plataforma' }),
      // A crédito
      order({ total: 118, itbis: 18, net_income: 118, payment_method: 'credito' }),
      // Anulada: no cuenta
      order({ status: 'anulada', total: 500, itbis: 76.27, net_income: 500 }),
    ],
    expenses: [
      { id: 'a', category: 'insumos', description: null, amount: 100, spent_at: '2026-11-15' },
      { id: 'b', category: 'gas', description: null, amount: 50, spent_at: '2026-11-15', paid: 0 },
      { id: 'c', category: 'gas', description: null, amount: 999, spent_at: '2026-11-15', voided: 1 },
    ],
    payments: [{ amount: 50, method: 'efectivo', created_at: '', voided: 0 }, { amount: 70, method: 'efectivo', created_at: '', voided: true }],
  });
  assert.equal(s.orders, 3);
  assert.equal(s.grossSales, 472); // 118 + 236 + 118
  assert.equal(s.itbis, 72);
  assert.equal(s.netSales, 400);
  assert.equal(s.commissions, 59);
  assert.equal(s.income, 341); // 400 - 59
  assert.equal(s.tipLaw, 10);
  assert.equal(s.expenses, 150);
  assert.equal(s.expensesPending, 50);
  assert.equal(s.profit, 191);
  assert.equal(s.margin, 47.8);
  assert.equal(s.creditPayments, 50);
  assert.deepEqual(s.voidedOrders, { count: 1, amount: 500 });
  assert.deepEqual(s.voidedExpenses, { count: 1, amount: 999 });
  assert.deepEqual(s.byPayment.map((p) => [p.method, p.amount]), [['efectivo', 128], ['plataforma', 177], ['credito', 118]]);
  assert.deepEqual(s.byCategory.map((c) => [c.category, c.amount]), [['insumos', 100], ['gas', 50]]);
});

test('cuentas por pagar: vencidas primero', () => {
  const p = buildPayables(
    [
      { id: '1', category: 'insumos', description: 'Pollo', amount: 300, spent_at: '2026-11-01', paid: false, due_date: '2026-11-20', supplier_name: 'Pollos RD' },
      { id: '2', category: 'insumos', description: 'Pan', amount: 100, spent_at: '2026-11-02', paid: false, due_date: '2026-11-10' },
      { id: '3', category: 'insumos', description: 'Pagado', amount: 900, spent_at: '2026-11-02', paid: true },
      { id: '4', category: 'insumos', description: 'Anulado', amount: 900, spent_at: '2026-11-02', paid: false, voided: true },
    ],
    '2026-11-15',
  );
  assert.deepEqual(p.items.map((i) => i.id), ['2', '1']);
  assert.equal(p.items[0].overdue, true);
  assert.equal(p.items[0].days, -5);
  assert.equal(p.items[1].supplier, 'Pollos RD');
  assert.equal(p.total, 400);
  assert.equal(p.overdue, 100);
});

test('períodos', () => {
  const now = new Date(2026, 10, 15, 10);
  assert.equal(periodRange('mes', now).fromKey, '2026-11-01');
  assert.equal(periodRange('mes', now).toKey, '2026-11-16');
  assert.equal(periodRange('mes_pasado', now).fromKey, '2026-10-01');
  assert.equal(periodRange('mes_pasado', now).toKey, '2026-11-01');
  assert.equal(periodRange('semana', now).fromKey, '2026-11-09'); // lunes
  assert.equal(periodRange('anio', now).fromKey, '2026-01-01');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeOrderTotals, ingredientUsage, buildProfitReport } from '../src/lib/calc.ts';

test('comedor: ITBIS incluido y 10% de ley de propina', () => {
  const t = computeOrderTotals([{ unitPrice: 236, quantity: 1, itbisRate: 0.18 }], 'local');
  assert.equal(t.subtotal, 200);
  assert.equal(t.itbis, 36);
  assert.equal(t.tipLaw, 20);
  assert.equal(t.total, 256);
  assert.equal(t.netIncome, 236);
});

test('para llevar no cobra propina', () => {
  const t = computeOrderTotals([{ unitPrice: 118, quantity: 2, itbisRate: 0.18 }], 'para_llevar');
  assert.equal(t.tipLaw, 0);
  assert.equal(t.total, 236);
});

test('PedidosYa descuenta la comisión del ingreso neto', () => {
  const t = computeOrderTotals([{ unitPrice: 500, quantity: 2, itbisRate: 0.18 }], 'pedidosya', {
    commissionRate: 0.25,
  });
  assert.equal(t.total, 1000);
  assert.equal(t.platformCommission, 250);
  assert.equal(t.netIncome, 750);
});

test('la receta descuenta ingredientes por cantidad vendida', () => {
  const usage = ingredientUsage(
    [{ productId: 'burger', quantity: 3 }],
    [
      { productId: 'burger', ingredientId: 'pan', quantity: 1 },
      { productId: 'burger', ingredientId: 'carne', quantity: 120 },
      { productId: 'jugo', ingredientId: 'naranja', quantity: 3 },
    ],
  );
  assert.equal(usage.get('pan'), 3);
  assert.equal(usage.get('carne'), 360);
  assert.equal(usage.has('naranja'), false);
});

test('reporte de ganancia por canal', () => {
  const local = computeOrderTotals([{ unitPrice: 236, quantity: 1, itbisRate: 0.18 }], 'local');
  const pya = computeOrderTotals([{ unitPrice: 1180, quantity: 1, itbisRate: 0.18 }], 'pedidosya', {
    commissionRate: 0.25,
  });
  const r = buildProfitReport([{ channel: 'local', ...local }, { channel: 'pedidosya', ...pya }], 300);
  assert.equal(r.orders, 2);
  assert.equal(r.gross, 1416);
  assert.equal(r.itbis, 216);
  assert.equal(r.commissions, 295);
  assert.equal(r.byChannel.pedidosya.net, 885);
  assert.equal(r.profit, 1416 - 295 - 216 - 300);
});

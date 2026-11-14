import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeOrderTotals, ingredientUsage, buildProfitReport, priceFor } from '../src/lib/calc.ts';

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

test('descuento: baja ITBIS y propina en proporción', () => {
  const t = computeOrderTotals([{ unitPrice: 236, quantity: 1, itbisRate: 0.18 }], 'local', { discount: 23.6 });
  assert.equal(t.discount, 23.6);
  assert.equal(t.gross, 212.4);
  assert.equal(t.subtotal, 180);
  assert.equal(t.itbis, 32.4);
  assert.equal(t.tipLaw, 18);
  assert.equal(t.total, 230.4);
  assert.equal(t.netIncome, 212.4);
});

test('descuento no puede pasar del total', () => {
  const t = computeOrderTotals([{ unitPrice: 100, quantity: 1, itbisRate: 0.18 }], 'para_llevar', { discount: 500 });
  assert.equal(t.total, 0);
});

test('precio por canal: PedidosYa y Uber Eats usan su precio si lo tienen', () => {
  const p = { price: 100, price_pedidosya: 125, price_ubereats: null };
  assert.equal(priceFor(p, 'local'), 100);
  assert.equal(priceFor(p, 'pedidosya'), 125);
  assert.equal(priceFor(p, 'ubereats'), 100);
});

test('ITBIS exento solo en delivery', async () => {
  const { itbisFor } = await import('../src/lib/calc.ts');
  const p = { itbis_rate: 0.18, delivery_itbis_exempt: 1 };
  assert.equal(itbisFor(p, 'local'), 0.18);
  assert.equal(itbisFor(p, 'para_llevar'), 0.18);
  assert.equal(itbisFor(p, 'pedidosya'), 0);
  assert.equal(itbisFor(p, 'ubereats'), 0);
  assert.equal(itbisFor({ itbis_rate: 0.18 }, 'pedidosya'), 0.18);
  const t = computeOrderTotals([{ unitPrice: 300, quantity: 1, itbisRate: itbisFor(p, 'pedidosya') }], 'pedidosya', { commissionRate: 0.25 });
  assert.equal(t.itbis, 0);
  assert.equal(t.subtotal, 300);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeName, orderIdFromRef, parseAmount, parseItems, parsePedidosYaReport, rdDateToIso, splitPrices } from '../src/lib/pedidosya-report.ts';

const HEADER =
  'Nombre del local,Nro de pedido,ID de tienda,Tipo de entrega,Forma de pago,Estado del pedido,Fecha del pedido,Total parcial,Descuento financiado por usted,Vale financiado por usted,Comisión,Ingreso estimado,Artículos del pedido';

test('reporte PedidosYa: montos, artículos y fechas', () => {
  assert.equal(parseAmount('1.020,00'), 1020);
  assert.equal(parseAmount('-208,42'), -208.42);
  assert.equal(parseAmount(''), 0);
  assert.deepEqual(parseItems('1 Yuca hervida 1 huevos fritos,, 1 Mangu maduro huevo frito'), [
    { quantity: 1, name: 'Yuca hervida 1 huevos fritos' },
    { quantity: 1, name: 'Mangu maduro huevo frito' },
  ]);
  assert.deepEqual(parseItems('2 Coca Cola, 1 Kola Real [1 Rojo, 2 Azul]'), [
    { quantity: 2, name: 'Coca Cola' },
    { quantity: 1, name: 'Kola Real [1 Rojo, 2 Azul]' },
  ]);
  assert.equal(normalizeName('Kola Real [1 Rojo]'), 'kola real');
  assert.equal(normalizeName('Puré  de Papa'), 'pure de papa');
  assert.equal(rdDateToIso('2026-11-07 21:54'), '2026-11-08T01:54:00.000Z');
});

test('reporte PedidosYa: pedidos entregados y cancelados', () => {
  const csv = [
    HEADER,
    `Mi local,2362029511,574131,Delivery,Pago online,Entregado,2026-11-07 21:54,"250,00","50,00","0,00","52,00","146,56",1 Mangu de platano`,
    `Mi local,2362192444,574131,Delivery,,Cancelado,2026-11-08 07:31,"350,00","0,00","0,00","0,00","129,50","1 China avena, 1 Frito con salami"`,
  ].join('\r\n');
  const { orders, error } = parsePedidosYaReport(csv);
  assert.equal(error, undefined);
  assert.equal(orders.length, 2);
  assert.deepEqual(
    { ref: orders[0].ref, status: orders[0].status, subtotal: orders[0].subtotal, discount: orders[0].discount, net: orders[0].net },
    { ref: '2362029511', status: 'entregado', subtotal: 250, discount: 50, net: 146.56 },
  );
  assert.equal(orders[1].status, 'cancelado');
  assert.equal(orders[1].items.length, 2);
  assert.match(parsePedidosYaReport('Fecha,Pedidos,Ventas\n2026-11-06,10,"4.880,00"').error ?? '', /Detalle de pedidos/);
});

test('reporte PedidosYa: reparte el total y el id no cambia', () => {
  const p = splitPrices(725, [{ quantity: 1, knownPrice: 250 }, { quantity: 1, knownPrice: 475 }]);
  assert.deepEqual(p, [250, 475]);
  const q = splitPrices(100, [{ quantity: 3, knownPrice: null }]);
  assert.ok(Math.abs(q[0] * 3 - 100) < 0.02);
  assert.equal(orderIdFromRef('2362029511'), orderIdFromRef('2362029511'));
  assert.notEqual(orderIdFromRef('2362029511'), orderIdFromRef('2362029512'));
  assert.match(orderIdFromRef('x'), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('reporte PedidosYa: estima precios para crear productos', async () => {
  const { estimatePrices, cleanProductName } = await import('../src/lib/pedidosya-report.ts');
  const o = (subtotal: number, items: [number, string][]) => ({
    ref: String(subtotal), storeId: '', status: 'entregado' as const, statusText: '', createdAt: '', cash: false,
    subtotal, discount: 0, net: 0, items: items.map(([quantity, name]) => ({ quantity, name })),
  });
  const est = estimatePrices([o(250, [[1, 'Mangu de platano']]), o(500, [[2, 'Mangu de platano']]), o(340, [[1, 'Mangu de platano'], [1, 'Jugo de chinola']]), o(610, [[2, 'Coca Cola'], [2, 'Mangu de platano']])]);
  assert.equal(est['mangu de platano'], 250);
  assert.equal(est['jugo de chinola'], 90);
  assert.equal(est['coca cola'], 55);
  assert.equal(cleanProductName('Kola Real [1 Rojo]'), 'Kola Real');
  assert.equal(cleanProductName('tostada de  Jamon y queso'), 'Tostada de Jamon y queso');
});

test('pedidos sin "Ingreso estimado" (–): se estima con la mediana de los otros', async () => {
  const { fillMissingNet } = await import('../src/lib/pedidosya-report.ts');
  const base = { storeId: '1', statusText: 'Entregado', createdAt: '2026-11-13T00:00:00Z', cash: false, discount: 0, items: [] };
  const orders = [
    { ...base, ref: 'a', status: 'entregado' as const, subtotal: 100, net: 70, netKnown: true },
    { ...base, ref: 'b', status: 'entregado' as const, subtotal: 200, net: 150, netKnown: true },
    { ...base, ref: 'c', status: 'entregado' as const, subtotal: 300, net: 216, netKnown: true },
    { ...base, ref: 'd', status: 'entregado' as const, subtotal: 1000, net: 0, netKnown: false },
  ];
  const out = fillMissingNet(orders, 0.25);
  assert.equal(out[3].net, 720); // mediana 0.72
  assert.equal(out[0].net, 70);
  // Sin otros pedidos con dato: usa la comisión configurada.
  assert.equal(fillMissingNet([orders[3]], 0.25)[0].net, 750);
});

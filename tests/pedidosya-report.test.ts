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

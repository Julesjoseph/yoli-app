import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReceiptHtml, ticketNumber } from '../src/printing/receipt-html.ts';

const order = {
  id: '11111111-2222-3333-4444-5555abcdef12',
  channel: 'local',
  external_ref: null,
  subtotal: 250,
  itbis: 45,
  tip_law: 25,
  total: 320,
  payment_method: 'efectivo',
  created_at: '2026-11-09T15:00:00.000Z',
  items: [{ name: 'Café <con> leche', unit_price: 110, quantity: 2 }],
};
const settings = { rnc: '131234567', address: '', phone: '', footer: 'Gracias', width: '58' as const, autoPrint: false };

test('ticket: datos, totales y texto escapado', () => {
  const html = buildReceiptHtml(order, { businessName: 'Yoli', locationName: 'Centro', channelLabel: 'Comedor' }, settings);
  assert.match(html, /RNC: 131234567/);
  assert.match(html, /RD\$ 320\.00/);
  assert.match(html, /Propina legal 10%/);
  assert.match(html, /Café &lt;con&gt; leche/);
  assert.match(html, /size: 58mm /);
  assert.equal(ticketNumber(order.id), 'ABCDEF12'.slice(-6));
});

test('ticket: sin propina no muestra la línea', () => {
  const html = buildReceiptHtml({ ...order, tip_law: 0 }, { businessName: 'Yoli', locationName: 'Centro' }, settings);
  assert.doesNotMatch(html, /Propina/);
});

test('ticket: muestra efectivo recibido y devuelta', () => {
  const html = buildReceiptHtml({ ...order, cash_received: 500, change_given: 180 }, { businessName: 'Yoli', locationName: 'Centro' }, settings);
  assert.match(html, /Recibido<\/td><td class="r">RD\$ 500\.00/);
  assert.match(html, /Devuelta<\/td><td class="r b">RD\$ 180\.00/);
});

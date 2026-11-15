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

test('ticket con factura electrónica', async () => {
  const { buildReceiptHtml } = await import('../src/printing/receipt-html.ts');
  const html = buildReceiptHtml(
    {
      id: 'abc', channel: 'local', external_ref: null, subtotal: 100, itbis: 18, tip_law: 10, total: 128,
      payment_method: 'efectivo', created_at: new Date().toISOString(), items: [{ name: 'Café', unit_price: 118, quantity: 1 }],
      invoice: { ecf_type: '31', encf: 'E310000000001', customer_rnc: '131234567', customer_name: 'Empresa SRL', security_code: 'AB12CD', environment: 'prueba' },
    },
    { businessName: 'Yoli', locationName: 'Centro' },
    { rnc: '101', address: '', phone: '', footer: '', width: '80', autoPrint: false },
  );
  for (const x of ['FACTURA DE CRÉDITO FISCAL ELECTRÓNICA', 'E310000000001', '131234567', 'Empresa SRL', 'AB12CD', 'MODO PRUEBA']) {
    assert.ok(html.includes(x), x);
  }
  assert.ok(!html.includes('no es un comprobante fiscal'));
});

test('factura carta: datos de la DGII y QR', async () => {
  const { buildInvoiceLetterHtml, ecfQrUrl } = await import('../src/printing/receipt-html.ts');
  const invoice = { ecf_type: '32', encf: 'E320000000001', customer_rnc: null, customer_name: null, security_code: '41D0A4', environment: 'prueba', created_at: '2026-11-10T16:48:00.000Z' };
  const html = buildInvoiceLetterHtml({ ...order, invoice }, { businessName: 'Yoli', locationName: 'Centro' }, { ...settings, legalName: 'Yoli SRL' });
  assert.match(html, /size: letter/);
  assert.match(html, /FACTURA DE CONSUMO ELECTRÓNICA/);
  assert.match(html, /E320000000001/);
  assert.match(html, /Consumidor final/);
  assert.match(html, /<svg/);
  assert.match(html, /MODO PRUEBA/);
  const url = ecfQrUrl(invoice, '131-234567', 320);
  assert.match(url, /^https:\/\/fc\.dgii\.gov\.do\/testecf\/ConsultaTimbreFC\?RncEmisor=131234567&ENCF=E320000000001&MontoTotal=320\.00&CodigoSeguridad=41D0A4$/);
  const e31 = ecfQrUrl({ ...invoice, ecf_type: '31', customer_rnc: '101000001', environment: 'produccion' }, '131234567', 320);
  assert.match(e31, /^https:\/\/ecf\.dgii\.gov\.do\/ecf\/ConsultaTimbre\?RncEmisor=131234567&RncComprador=101000001&ENCF=/);
  assert.equal(ecfQrUrl({ ...invoice, qr_url: 'https://x.test/qr' }, '1', 1), 'https://x.test/qr');
});

test('factura manual: sin fecha de firma y QR solo si se puede armar', async () => {
  const { buildReceiptHtml, ecfQrUrl } = await import('../src/printing/receipt-html.ts');
  const inv = { ecf_type: '32', encf: 'E320000000500', customer_rnc: null, customer_name: null, security_code: 'ABC123', environment: 'produccion', provider: 'manual' };
  const html = buildReceiptHtml({ ...order, invoice: inv }, { businessName: 'Yoli', locationName: 'Centro' }, settings);
  assert.doesNotMatch(html, /Fecha de firma/);
  assert.match(html, /<svg/);
  assert.equal(ecfQrUrl({ ...inv, ecf_type: '31', customer_rnc: '101000001' }, '131234567', 320), null);
});

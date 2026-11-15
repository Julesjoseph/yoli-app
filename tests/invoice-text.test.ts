import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDate, parseInvoiceText, parseMoney, suggestName } from '../src/lib/invoice-text.ts';

test('montos y fechas', () => {
  assert.equal(parseMoney('1,250.00'), 1250);
  assert.equal(parseMoney('RD$ 3,540.50'), 3540.5);
  assert.equal(parseMoney('950,00'), 950);
  assert.equal(parseDate('Fecha: 14/11/2026'), '2026-11-14');
  assert.equal(parseDate('2026-11-14 10:30'), '2026-11-14');
  assert.equal(parseDate('14-11-26'), '2026-11-14');
  assert.equal(suggestName('20 POLLO ENTERO FRESCO 1,900.00'), 'Pollo entero fresco');
});

test('factura de distribuidora (bloques como los da el celular)', () => {
  const blocks = [
    'DISTRIBUIDORA DEL CIBAO SRL\nAv. Estrella Sadhalá #45, Santiago\nTel. 809-555-1234',
    'RNC: 1-01-23456-7',
    'FACTURA DE CRÉDITO FISCAL\nNCF: B01 0000 0123\nFecha: 14/11/2026\nVence: 31/12/2027',
    'Cliente: D YOLANDA APERITIVOS\nRNC Cliente: 132-45678-9',
    'CANT DESCRIPCION IMPORTE',
    '20 POLLO ENTERO FRESCO LB 1,900.00\n2 ACEITE CRISOL 1GL 900.00\nSERVILLETAS 500U',
    'SUBTOTAL 3,000.00\nITBIS 18% 540.00\nTOTAL A PAGAR\nRD$ 3,540.00',
    'Gracias por su compra',
  ];
  const r = parseInvoiceText(blocks, '132456789');
  assert.equal(r.invoice.supplier_name, 'DISTRIBUIDORA DEL CIBAO SRL');
  assert.equal(r.invoice.supplier_rnc, '101234567');
  assert.equal(r.invoice.ncf, 'B0100000123');
  assert.equal(r.invoice.date, '2026-11-14');
  assert.equal(r.invoice.total, 3540);
  assert.equal(r.invoice.itbis, 540);
  assert.equal(r.invoice.subtotal, 3000);
  assert.ok(r.invoice.is_invoice);
  const names = r.candidates.map((c) => c.name);
  assert.ok(names.includes('Pollo entero fresco lb'), names.join(' | '));
  const pollo = r.candidates.find((c) => c.name.startsWith('Pollo'))!;
  assert.equal(pollo.quantity, 20);
  assert.equal(pollo.amount, 1900);
  assert.ok(names.some((n) => n.startsWith('Servilletas')));
  assert.ok(!names.some((n) => /gracias|cliente|distribuidora/i.test(n)), names.join(' | '));
});

test('recibo de colmado con e-NCF y sin RNC', () => {
  const r = parseInvoiceText(['Colmado La Esquina', 'E310000000045', '15-11-26', 'Total 1,150.00']);
  assert.equal(r.invoice.ncf, 'E310000000045');
  assert.equal(r.invoice.supplier_rnc, null);
  assert.equal(r.invoice.date, '2026-11-15');
  assert.equal(r.invoice.total, 1150);
});

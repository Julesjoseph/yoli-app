import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildAlanubePayload, readAlanubeResponse } from '../supabase/functions/emitir-ecf/alanube.ts';

const base = {
  encf: 'E320000000001',
  issuer: { rnc: '131000001', legalName: 'Negocio Demo SRL', tradeName: 'Negocio demo', address: 'Av. Duarte 25', phone: '809-555-1234', email: '' },
  paymentMethod: 'efectivo',
  issuedOn: '2026-11-10',
};

test('consumo 32: ITBIS 18%, propina como línea exenta, totales cuadran', () => {
  const p = buildAlanubePayload({
    ...base, type: '32', discount: 0, tipLaw: 20,
    lines: [{ description: 'Café', quantity: 2, unitPrice: 118, itbisRate: 0.18 }],
  }) as any;
  assert.equal(p.idDoc.encf, 'E320000000001');
  assert.equal(p.idDoc.sequenceDueDate, undefined);
  assert.equal(p.itemDetails[0].unitPriceItem, 100);
  assert.equal(p.itemDetails[0].itemAmount, 200);
  assert.equal(p.itemDetails[1].billingIndicator, 4);
  assert.deepEqual(p.totals, { totalAmount: 256, totalTaxedAmount: 200, itbisTotal: 36, i1AmountTaxed: 200, itbisS1: 18, itbis1Total: 36, exemptAmount: 20 });
  assert.equal(p.idDoc.paymentFormsTable[0].paymentAmount, 256);
  assert.deepEqual(p.sender.phoneNumber, ['809-555-1234']);
  assert.equal(p.buyer, undefined);
});

test('crédito fiscal 31: comprador, vencimiento de secuencia, descuento y producto exento en delivery', () => {
  const p = buildAlanubePayload({
    ...base, type: '31', encf: 'E310000000005', sequenceDue: '2027-12-31', discount: 59, tipLaw: 0, paymentMethod: 'plataforma',
    customer: { rnc: '101234567', name: 'Empresa ABC SRL' },
    companyId: '01ABC',
    lines: [
      { description: 'Hamburguesa', quantity: 1, unitPrice: 590, itbisRate: 0.18 },
      { description: 'Refresco', quantity: 1, unitPrice: 80, itbisRate: 0 },
    ],
  }) as any;
  assert.equal(p.idDoc.sequenceDueDate, '2027-12-31');
  assert.deepEqual(p.buyer, { rnc: '101234567', companyName: 'Empresa ABC SRL' });
  assert.deepEqual(p.company, { id: '01ABC' });
  assert.equal(p.idDoc.paymentFormsTable[0].paymentMethod, 8);
  // factor = (670-59)/670
  assert.equal(p.itemDetails[0].unitPriceItem, 500);
  assert.equal(p.itemDetails[1].billingIndicator, 4);
  const sumLines = p.itemDetails.reduce((n: number, d: any) => n + d.itemAmount, 0);
  assert.ok(Math.abs(p.totals.totalAmount - (sumLines + p.totals.itbisTotal)) < 0.011);
  assert.ok(Math.abs(p.totals.totalAmount - 611) < 0.05, String(p.totals.totalAmount));
});

test('lee la respuesta de Alanube', () => {
  const r = readAlanubeResponse({ id: '01HX', status: 'REGISTERED', legalStatus: 'ACCEPTED', encf: 'E320000000001', securityCode: 'ABC123', documentStampUrl: 'https://x' });
  assert.equal(r.status, 'aceptada');
  assert.equal(r.providerId, '01HX');
  assert.equal(r.securityCode, 'ABC123');
  assert.equal(readAlanubeResponse({ legalStatus: 'REJECTED' }).status, 'rechazada');
  assert.equal(readAlanubeResponse({ status: 'IN_PROCESS' }).status, 'enviada');
});

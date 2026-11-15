import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildYoliPayload,
  fillUrl,
  genericError,
  normalizeStatus,
  readGenericResponse,
  validApiUrl,
} from '../supabase/functions/emitir-ecf/generico.ts';

const base = {
  encf: 'E320000000007',
  issuer: { rnc: '131000001', legalName: 'Negocio Demo SRL', tradeName: 'Negocio demo', address: 'Av. Duarte 25', phone: '809-555-1234', email: '' },
  paymentMethod: 'tarjeta',
  issuedOn: '2026-11-13',
};

test('formato yoli-ecf-1: líneas sin ITBIS, propina exenta y totales que cuadran', () => {
  const p = buildYoliPayload(
    { ...base, type: '32', discount: 0, tipLaw: 20, lines: [{ description: 'Café', quantity: 2, unitPrice: 118, itbisRate: 0.18 }] },
    { saleId: 'venta-1', environment: 'prueba' },
  );
  assert.equal(p.formato, 'yoli-ecf-1');
  assert.equal(p.encf, 'E320000000007');
  assert.equal(p.items[0].precioUnitarioSinItbis, 100);
  assert.equal(p.items[0].montoSinItbis, 200);
  assert.equal(p.items[0].itbis, 36);
  assert.equal(p.items[1].indicadorFacturacion, 4);
  assert.deepEqual(p.totales, {
    montoGravado18: 200, montoGravado16: 0, montoGravadoTotal: 200, montoExento: 20,
    itbis18: 36, itbis16: 0, itbisTotal: 36, descuento: 0, propinaLegal: 20, total: 256,
  });
  assert.deepEqual(p.formaPago, { codigo: 3, nombre: 'Tarjeta de débito / crédito', monto: 256 });
  assert.equal(p.comprador, null);
  assert.equal(p.referencia.ventaId, 'venta-1');
});

test('formato yoli-ecf-1: crédito fiscal, descuento, exento y número del proveedor', () => {
  const p = buildYoliPayload(
    {
      ...base, encf: '', type: '31', discount: 100, tipLaw: 0, sequenceDue: '2027-12-31',
      customer: { rnc: '101000001', name: 'Cliente SRL' },
      lines: [
        { description: 'Plato', quantity: 1, unitPrice: 590, itbisRate: 0.18 },
        { description: 'Jugo', quantity: 1, unitPrice: 410, itbisRate: 0 },
      ],
    },
    { saleId: 'v2', environment: 'produccion' },
  );
  assert.equal(p.encf, null);
  assert.deepEqual(p.comprador, { rncCedula: '101000001', nombre: 'Cliente SRL' });
  assert.equal(p.items[0].descuento, 50);
  assert.equal(p.items[1].tasaItbis, 0);
  assert.equal(p.totales.total, 900);
});

test('lee respuestas con nombres distintos', () => {
  const a = readGenericResponse({ data: { encf: 'e320000000007', codigoSeguridad: 'AB12CD', urlQR: 'https://x/qr', estado: 'Aceptado', id: 99 } });
  assert.deepEqual(a, { status: 'aceptada', providerId: '99', encf: 'E320000000007', securityCode: 'AB12CD', qrUrl: 'https://x/qr', message: 'Estado: Aceptado' });
  const b = readGenericResponse({ result: { doc: { numero: 'E310000000001', sc: 'ZZ9911' } }, state: 'Procesando' }, { encf: 'result.doc.numero', securityCode: 'result.doc.sc', status: 'state' });
  assert.equal(b.encf, 'E310000000001');
  assert.equal(b.securityCode, 'ZZ9911');
  assert.equal(b.status, 'enviada');
  // Sin estado, pero con número y código: firmada.
  assert.equal(readGenericResponse({ encf: 'E320000000001', securityCode: 'ABC123' }).status, 'aceptada');
});

test('estados, errores y direcciones', () => {
  assert.equal(normalizeStatus('RECHAZADO'), 'rechazada');
  assert.equal(normalizeStatus('Aceptado Condicional'), 'aceptada');
  assert.equal(normalizeStatus('EnProceso'), 'enviada');
  assert.match(genericError(401, {}, 'Mi proveedor'), /no aceptó la llave/);
  assert.equal(genericError(422, { errors: [{ message: 'RNC inválido' }] }, 'X'), 'X respondió 422: RNC inválido');
  assert.equal(validApiUrl('https://api.proveedor.com.do/v1/ecf'), null);
  assert.match(validApiUrl('http://api.proveedor.com/ecf') ?? '', /https/);
  assert.match(validApiUrl('https://192.168.1.5/ecf') ?? '', /pública/);
  assert.match(validApiUrl('') ?? '', /Falta/);
  assert.equal(fillUrl('https://a.com/ecf/{id}?n={encf}', { id: '7', encf: 'E32' }), 'https://a.com/ecf/7?n=E32');
});

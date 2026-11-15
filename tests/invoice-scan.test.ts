import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanDate, cleanNcf, cleanRnc, invoiceTotal, toPurchaseLines, type ScannedInvoice } from '../src/lib/invoice-scan.ts';

const inv: ScannedInvoice = {
  is_invoice: true,
  supplier_name: 'Distribuidora del Cibao',
  supplier_rnc: '1-01-23456-7',
  ncf: 'b0100000123',
  date: '2026-11-14',
  subtotal: 3000,
  itbis: 540,
  total: null,
  notes: null,
  items: [
    { description: 'POLLO ENT FRESCO LB', name: 'Pollo entero', quantity: 20, unit: 'lb', unit_cost: 95, line_total: 1900, ingredient_id: 'ing-pollo', for_inventory: true },
    { description: 'ACEITE CRISOL 1GL', name: 'Aceite', quantity: 2, unit: 'galon', unit_cost: 450, line_total: null, ingredient_id: 'no-existe', for_inventory: true },
    { description: 'SERVILLETAS', name: 'Servilletas', quantity: 0, unit: 'otra', unit_cost: 200, line_total: null, ingredient_id: null, for_inventory: true },
    { description: 'ENVIO', name: 'Envío', quantity: 1, unit: 'unidad', unit_cost: 0, line_total: 0, ingredient_id: null, for_inventory: false },
  ],
};

test('limpia RNC, NCF y fecha', () => {
  assert.equal(cleanRnc('1-01-23456-7'), '101234567');
  assert.equal(cleanRnc('123'), null);
  assert.equal(cleanNcf('b01 0000 0123'), 'B0100000123');
  assert.equal(cleanNcf('e310000000045'), 'E310000000045');
  assert.equal(cleanDate('2026-11-14', new Date(2026, 10, 15)), '2026-11-14');
  assert.equal(cleanDate('2026-12-01', new Date(2026, 10, 15)), null, 'futuro');
  assert.equal(cleanDate('2026-02-30', new Date(2026, 10, 15)), null, 'no existe');
});

test('líneas: insumo existente, por nombre, nuevo y fuera de inventario', () => {
  const lines = toPurchaseLines(inv, [
    { id: 'ing-pollo', name: 'Pollo entero' },
    { id: 'ing-aceite', name: 'ACEITE' },
  ]);
  assert.equal(lines[0].target, 'ing-pollo');
  assert.equal(lines[0].cost, 1900);
  assert.equal(lines[1].target, 'ing-aceite', 'id inventado: se busca por nombre');
  assert.equal(lines[1].cost, 900);
  assert.equal(lines[2].target, 'nuevo');
  assert.equal(lines[2].quantity, 1);
  assert.equal(lines[2].unit, 'unidad');
  assert.equal(lines[3].target, 'no');
  assert.equal(invoiceTotal(inv, lines), 3540);
});

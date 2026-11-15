import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanDate, cleanNcf, cleanRnc, convertQty, invoiceTotal, matchIngredient, nameSimilarity, toPurchaseLines, type ScannedInvoice } from '../src/lib/invoice-scan.ts';

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

test('no duplica: reconoce el insumo que ya existe aunque la factura lo escriba distinto', () => {
  const ings = [
    { id: 'pollo', name: 'Pollo', unit: 'kg' },
    { id: 'aceite', name: 'Aceite vegetal', unit: 'litro' },
    { id: 'arroz', name: 'Arroz', unit: 'lb' },
    { id: 'salami', name: 'Salami', unit: 'lb' },
  ];
  assert.equal(matchIngredient('Pollo entero fresco', ings)?.id, 'pollo');
  assert.equal(matchIngredient('ACEITE VEGETAL 1GL', ings)?.id, 'aceite');
  assert.equal(matchIngredient('Arroz selecto 25 lb', ings)?.id, 'arroz');
  assert.equal(matchIngredient('Salamis', ings)?.id, 'salami');
  assert.equal(matchIngredient('Queso de freír', ings), null, 'producto distinto: insumo nuevo');
  assert.equal(matchIngredient('Salsa de tomate', [{ id: 't', name: 'Tomate' }]), null, 'no confunde salsa de tomate con tomate');
  assert.equal(nameSimilarity('Pollo', 'Pollo'), 1);

  const lines = toPurchaseLines(
    {
      ...inv,
      items: [
        { description: 'POLLO ENTERO LB', name: 'Pollo entero', quantity: 10, unit: 'lb', unit_cost: 95, line_total: 950, ingredient_id: null, for_inventory: true },
        { description: 'ACEITE VEG 1GL', name: 'Aceite vegetal', quantity: 1, unit: 'galon', unit_cost: 450, line_total: 450, ingredient_id: null, for_inventory: true },
      ],
    },
    ings,
  );
  assert.equal(lines[0].target, 'pollo');
  assert.equal(lines[0].name, 'Pollo', 'usa el nombre del inventario');
  assert.equal(lines[0].unit, 'kg');
  assert.equal(lines[0].quantity, 4.5359, '10 lb pasan a kilos');
  assert.equal(lines[0].cost, 950, 'el costo no cambia');
  assert.equal(lines[1].target, 'aceite');
  assert.equal(lines[1].quantity, 3.7854);
});

test('convierte unidades compatibles', () => {
  assert.equal(convertQty(2, 'kg', 'lb'), 4.4092);
  assert.equal(convertQty(500, 'ml', 'litro'), 0.5);
  assert.equal(convertQty(3, 'unidad', 'unidad'), 3);
  assert.equal(convertQty(3, 'unidad', 'kg'), null, 'unidades con peso no se convierten');
});

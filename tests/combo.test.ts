import assert from 'node:assert/strict';
import { test } from 'node:test';

import { withChoices } from '../src/lib/combo.ts';
import { unitName } from '../src/lib/units.ts';

const combo = {
  id: 'c1', category_id: null, name: 'Combo pica pollo', price: 375, itbis_rate: 0.18,
  image_url: null, price_pedidosya: 450, price_ubereats: null,
};

test('combo sin elegir queda igual', () => {
  assert.equal(withChoices(combo, []), combo);
});

test('combo con acompañante: nombre, precio extra y línea aparte', () => {
  const p = withChoices(combo, [
    { group: 'Acompañante', productId: 't1', name: 'Tostones', extra: 25 },
    { group: 'Bebida', productId: 'r1', name: 'Refresco', extra: 0 },
  ]);
  assert.equal(p.name, 'Combo pica pollo (Tostones, Refresco)');
  assert.equal(p.price, 400);
  assert.equal(p.price_pedidosya, 475);
  assert.equal(p.price_ubereats, null);
  assert.equal(p.base_id, 'c1');
  assert.deepEqual(p.chosen, ['t1', 'r1']);
  assert.equal(p.id, 'c1|t1|r1');
});

test('nombres de unidades', () => {
  assert.equal(unitName('pieza', 1), 'pieza');
  assert.equal(unitName('pieza', 3), 'piezas');
  assert.equal(unitName('lb'), 'libras');
  assert.equal(unitName('caja'), 'caja');
});

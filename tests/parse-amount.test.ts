import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount } from '../src/lib/calc.ts';

test('montos escritos de varias formas', () => {
  assert.equal(parseAmount('1,250'), 1250);
  assert.equal(parseAmount('1,250.50'), 1250.5);
  assert.equal(parseAmount('1.250,50'), 1250.5);
  assert.equal(parseAmount('1250,5'), 1250.5);
  assert.equal(parseAmount('12,5'), 12.5);
  assert.equal(parseAmount('RD$ 3,540.00'), 3540);
  assert.equal(parseAmount('300'), 300);
  assert.equal(parseAmount('0.75'), 0.75);
  assert.equal(parseAmount('1.000.000'), 1000000);
  assert.equal(parseAmount('25.'), 25);
  assert.ok(Number.isNaN(parseAmount('')));
  assert.ok(Number.isNaN(parseAmount('abc')));
  assert.ok(Number.isNaN(parseAmount('1,2,3')));
});

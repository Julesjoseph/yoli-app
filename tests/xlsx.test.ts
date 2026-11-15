import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildXlsx, crc32, toBase64 } from '../src/lib/xlsx.ts';

test('crc32 y base64', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(toBase64(new TextEncoder().encode('Hola!')), Buffer.from('Hola!').toString('base64'));
  assert.equal(toBase64(new Uint8Array([1, 2])), Buffer.from([1, 2]).toString('base64'));
});

test('xlsx con varias hojas es un zip válido', () => {
  const bytes = buildXlsx([
    { name: 'Resumen', rows: [['Concepto', 'Monto'], ['Ventas', 1234.5], ['Año & <más>', -10]] },
    { name: 'Gastos', rows: [['Fecha'], ['2026-11-15']] },
  ]);
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  const text = new TextDecoder().decode(bytes);
  assert.ok(text.includes('xl/worksheets/sheet2.xml'));
  assert.ok(text.includes('Año &amp; &lt;más&gt;'));
  assert.ok(text.includes('<v>1234.5</v>'));
});

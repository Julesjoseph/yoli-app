import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTime } from '../src/lib/hora.ts';

test('entiende la hora como la escribe la gente', () => {
  assert.deepEqual(parseTime('5pm'), { hour: 17, minute: 0 });
  assert.deepEqual(parseTime('5:30 pm'), { hour: 17, minute: 30 });
  assert.deepEqual(parseTime('8 a.m.'), { hour: 8, minute: 0 });
  assert.deepEqual(parseTime('12 am'), { hour: 0, minute: 0 });
  assert.deepEqual(parseTime('12pm'), { hour: 12, minute: 0 });
  assert.deepEqual(parseTime('17:45'), { hour: 17, minute: 45 });
  assert.deepEqual(parseTime('0930'), { hour: 9, minute: 30 });
  assert.equal(parseTime('25:00'), null);
  assert.equal(parseTime('13 pm'), null);
  assert.equal(parseTime('mañana'), null);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkEmail } from '../src/lib/email-check.ts';

test('correos válidos pasan sin aviso', () => {
  for (const e of ['juana@gmail.com', ' Pedro.Perez@Hotmail.com ', 'ventas@dyolanda.com.do', 'a+b@empresa.net']) {
    const r = checkEmail(e);
    assert.equal(r.error, undefined, e);
    assert.equal(r.suggestion, undefined, e);
  }
  assert.equal(checkEmail(' Pedro.Perez@Hotmail.com ').email, 'pedro.perez@hotmail.com');
});

test('correos mal escritos dan error', () => {
  for (const e of ['', 'juana', 'juana@', '@gmail.com', 'juana@gmail', 'juana@@gmail.com', 'ju ana@gmail..com', 'juana@gmail.c', 'juana@gmail.c0m', 'jua(na@gmail.com']) {
    assert.ok(checkEmail(e).error, `debería fallar: ${e}`);
  }
});

test('sugiere el dominio correcto', () => {
  assert.equal(checkEmail('juana@gmial.com').suggestion, 'juana@gmail.com');
  assert.equal(checkEmail('juana@gmal.com').suggestion, 'juana@gmail.com');
  assert.equal(checkEmail('juana@gmail.con').suggestion, 'juana@gmail.com');
  assert.equal(checkEmail('juana@gmail.co').suggestion, 'juana@gmail.com');
  assert.equal(checkEmail('juana@hotmial.com').suggestion, 'juana@hotmail.com');
  assert.equal(checkEmail('juana@yaho.com').suggestion, 'juana@yahoo.com');
  assert.equal(checkEmail('juana@outlok.com').suggestion, 'juana@outlook.com');
  assert.equal(checkEmail('juana@miempresa.con').suggestion, 'juana@miempresa.com');
  assert.equal(checkEmail('juana@miempresa.com').suggestion, undefined);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAnswer, duplicateKey } from '../src/game/normalize.ts';

test('normalizeAnswer: recorta y colapsa espacios', () => {
  assert.equal(normalizeAnswer('  Perro  '), 'perro');
  assert.equal(normalizeAnswer('  maca   rrones '), 'maca rrones');
});

test('normalizeAnswer: insensible a mayúsculas', () => {
  assert.equal(normalizeAnswer('PERRO'), 'perro');
  assert.equal(normalizeAnswer('Madrid'), 'madrid');
});

test('normalizeAnswer: conserva acentos', () => {
  assert.equal(normalizeAnswer('París'), 'parís');
});

test('duplicateKey: ignora acentos', () => {
  assert.equal(duplicateKey('parís'), duplicateKey('paris'));
  assert.equal(duplicateKey('Madrid'), duplicateKey('madrid'));
  assert.notEqual(duplicateKey('perro'), duplicateKey('gato'));
});

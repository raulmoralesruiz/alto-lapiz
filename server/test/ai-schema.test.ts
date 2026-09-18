import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIFormatError, parseAIResponse } from '../src/ai/schema.ts';

test('parsea JSON válido', () => {
  const out = parseAIResponse('{"valid": true, "confidence": 0.94, "reason": "Mono es un animal", "normalized_answer": "mono"}');
  assert.equal(out.valid, true);
  assert.equal(out.confidence, 0.94);
  assert.equal(out.normalizedAnswer, 'mono');
});

test('parsea JSON dentro de markdown', () => {
  const text = '```json\n{"valid": false, "confidence": 0.98, "reason": "Mesa no es animal", "normalized_answer": "mesa"}\n```';
  const out = parseAIResponse(text);
  assert.equal(out.valid, false);
  assert.equal(out.normalizedAnswer, 'mesa');
});

test('parsea JSON con texto alrededor', () => {
  const text = 'Claro, aquí tienes el resultado: {"valid": true, "confidence": 0.8, "reason": "ok", "normalized_answer": "ballena"} Espero que sirva.';
  const out = parseAIResponse(text);
  assert.equal(out.valid, true);
});

test('rechaza JSON sin claves requeridas', () => {
  assert.throws(() => parseAIResponse('{"valid": true}'), AIFormatError);
});

test('rechaza confidence fuera de rango', () => {
  assert.throws(
    () => parseAIResponse('{"valid": true, "confidence": 1.5, "reason": "r", "normalized_answer": "n"}'),
    AIFormatError,
  );
});

test('rechaza texto que no es JSON', () => {
  assert.throws(() => parseAIResponse('Sí, es válida'), AIFormatError);
});

test('rechaza contenido vacío', () => {
  assert.throws(() => parseAIResponse(''), AIFormatError);
});

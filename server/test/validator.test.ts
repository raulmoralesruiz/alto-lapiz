import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIValidator } from '../src/ai/validator.ts';
import type { ValidationItem } from '../src/ai/validator.ts';
import { FakeProvider, silentLogger } from './helpers.ts';

function item(id: string, over: Partial<ValidationItem> = {}): ValidationItem {
  return {
    id,
    letter: 'M',
    category: 'Animal',
    answer: 'Mono',
    normalized: 'mono',
    language: 'es',
    ...over,
  };
}

test('la IA valida respuestas correctas y incorrectas', async () => {
  const provider = new FakeProvider();
  const validator = new AIValidator(provider, { concurrency: 2, maxRetries: 1, confidenceThreshold: 0.7, log: silentLogger });
  const results = await validator.validateMany([
    item('a1', { answer: 'Mono', normalized: 'mono' }),
    item('a2', { answer: 'Mesa', normalized: 'mesa' }),
  ]);
  assert.equal(results.length, 2);
  assert.ok(results.every((r) => r.ok));
  assert.equal(provider.calls.length, 2);
});

test('la caché evita llamadas duplicadas al modelo', async () => {
  const provider = new FakeProvider();
  const validator = new AIValidator(provider, { concurrency: 2, maxRetries: 1, confidenceThreshold: 0.7, log: silentLogger });
  const results = await validator.validateMany([
    item('a1', { answer: 'Madrid', normalized: 'madrid', category: 'Ciudad' }),
    item('a2', { answer: 'Madrid', normalized: 'madrid', category: 'Ciudad' }),
    item('a3', { answer: 'Málaga', normalized: 'málaga', category: 'Ciudad' }),
  ]);
  assert.equal(results.length, 3);
  assert.equal(provider.calls.length, 2, 'Madrid se pidió una sola vez al modelo');
  assert.equal(results[1]?.source, 'cache');
});

test('respeta el límite de concurrencia', async () => {
  const provider = new FakeProvider();
  let active = 0;
  let maxActive = 0;
  const originalValidate = provider.validate.bind(provider);
  provider.validate = async (req, ctx) => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 20));
    active--;
    return originalValidate(req, ctx);
  };
  const validator = new AIValidator(provider, { concurrency: 2, maxRetries: 0, confidenceThreshold: 0.7, log: silentLogger });
  const items = Array.from({ length: 6 }, (_, i) => item(`a${i}`, { answer: `Palabra${i}`, normalized: `palabra${i}` }));
  await validator.validateMany(items);
  assert.ok(maxActive <= 2, `concurrencia máxima observada: ${maxActive}`);
});

test('reintenta cuando el modelo devuelve mal JSON', async () => {
  const provider = new FakeProvider({ failFirstN: 1 });
  const validator = new AIValidator(provider, { concurrency: 1, maxRetries: 1, confidenceThreshold: 0.7, log: silentLogger });
  const results = await validator.validateMany([item('a1')]);
  assert.equal(results[0]?.ok, true);
  assert.equal(provider.calls.length, 2, 'primera falla + reintento exitoso');
});

test('sin reintentos, el error marca el resultado como fallo', async () => {
  const provider = new FakeProvider({ failFirstN: 99 });
  const validator = new AIValidator(provider, { concurrency: 1, maxRetries: 0, confidenceThreshold: 0.7, log: silentLogger });
  const results = await validator.validateMany([item('a1')]);
  assert.equal(results[0]?.ok, false);
  assert.ok(results[0]?.error);
});

test('checkHealth se cachea durante el TTL', async () => {
  const provider = new FakeProvider();
  const validator = new AIValidator(provider, { concurrency: 1, maxRetries: 0, confidenceThreshold: 0.7, log: silentLogger });
  await validator.checkHealth();
  await validator.checkHealth();
  await validator.checkHealth();
  assert.equal(provider.healthCalls, 1);
  const forced = await validator.checkHealth(true);
  assert.ok(forced.ok);
  assert.equal(provider.healthCalls, 2);
});

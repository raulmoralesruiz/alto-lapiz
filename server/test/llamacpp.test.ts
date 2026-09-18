import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { LlamaCppProvider } from '../src/ai/llamacpp.ts';

interface Mock {
  url: string;
  close: () => Promise<void>;
  requests: { method: string; path: string; body: string }[];
}

function startMock(behavior: (req: IncomingMessage, res: ServerResponse) => void): Promise<Mock> {
  const requests: Mock['requests'] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c as string));
    req.on('end', () => {
      requests.push({ method: req.method ?? '', path: req.url ?? '', body });
      behavior(req, res);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
        requests,
      });
    });
  });
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(data));
}

const base = { model: 'llama3.2', temperature: 0.1, timeoutMs: 5000 };

test('check() ok con un modelo cargado', async () => {
  const mock = await startMock((req, res) => {
    if (req.url === '/v1/models') json(res, 200, { data: [{ id: '/models/llama.gguf' }] });
    else json(res, 404, { error: 'no' });
  });
  try {
    const provider = new LlamaCppProvider({ url: mock.url, ...base });
    const health = await provider.check();
    assert.equal(health.ok, true);
  } finally {
    await mock.close();
  }
});

test('check() falla sin modelos cargados', async () => {
  const mock = await startMock((req, res) => {
    if (req.url === '/v1/models') json(res, 200, { data: [] });
    else json(res, 404, { error: 'no' });
  });
  try {
    const provider = new LlamaCppProvider({ url: mock.url, ...base });
    const health = await provider.check();
    assert.equal(health.ok, false);
    assert.match(health.detail ?? '', /no tiene modelos/);
  } finally {
    await mock.close();
  }
});

test('check() avisa si el modelo no coincide con varios cargados', async () => {
  const mock = await startMock((req, res) => {
    if (req.url === '/v1/models') json(res, 200, { data: [{ id: 'a.gguf' }, { id: 'b.gguf' }] });
    else json(res, 404, { error: 'no' });
  });
  try {
    const provider = new LlamaCppProvider({ url: mock.url, ...base });
    const health = await provider.check();
    assert.equal(health.ok, false);
    assert.match(health.detail ?? '', /no está cargado/);
  } finally {
    await mock.close();
  }
});

test('validate() envía a /v1/chat/completions y parsea la respuesta', async () => {
  const mock = await startMock((req, res) => {
    if (req.url === '/v1/chat/completions') {
      json(res, 200, {
        choices: [{ message: { content: '{"valid": true, "confidence": 0.9, "reason": "ok", "normalized_answer": "madrid"}' } }],
      });
    } else json(res, 404, { error: 'no' });
  });
  try {
    const provider = new LlamaCppProvider({ url: mock.url, ...base });
    const outcome = await provider.validate({ letter: 'M', category: 'Ciudades', answer: 'Madrid', language: 'es' });
    assert.equal(outcome.valid, true);
    assert.equal(outcome.confidence, 0.9);
    assert.equal(outcome.normalizedAnswer, 'madrid');

    const req = mock.requests[0];
    assert.equal(req?.path, '/v1/chat/completions');
    const body = JSON.parse(req?.body ?? '{}') as { response_format?: unknown; messages?: unknown };
    assert.deepEqual(body.response_format, { type: 'json_object' });
    assert.ok(Array.isArray(body.messages));
  } finally {
    await mock.close();
  }
});

test('validate() reintenta con el mensaje de error si el JSON es inválido', async () => {
  let calls = 0;
  const mock = await startMock((req, res) => {
    if (req.url === '/v1/chat/completions') {
      calls++;
      const content = calls === 1 ? 'esto no es JSON' : '{"valid": false, "confidence": 0.5, "reason": "no", "normalized_answer": "x"}';
      json(res, 200, { choices: [{ message: { content } }] });
    } else json(res, 404, { error: 'no' });
  });
  try {
    const provider = new LlamaCppProvider({ url: mock.url, ...base });
    // La primera respuesta inválida lanza AIFormatError (la detecta el validador para reintentar).
    await assert.rejects(
      () => provider.validate({ letter: 'M', category: 'X', answer: 'Y', language: 'es' }),
      /JSON/,
    );
  } finally {
    await mock.close();
  }
});

test('validate() lanza error ante HTTP 500', async () => {
  const mock = await startMock((req, res) => {
    if (req.url === '/v1/chat/completions') json(res, 500, { error: 'boom' });
    else json(res, 404, { error: 'no' });
  });
  try {
    const provider = new LlamaCppProvider({ url: mock.url, ...base });
    await assert.rejects(
      () => provider.validate({ letter: 'M', category: 'X', answer: 'Y', language: 'es' }),
      /HTTP 500/,
    );
  } finally {
    await mock.close();
  }
});

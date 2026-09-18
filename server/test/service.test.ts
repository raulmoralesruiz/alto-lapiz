import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { S2CMessage } from '../../shared/src/types.ts';
import { DEFAULT_SETTINGS } from '../../shared/src/types.ts';
import { createGame } from '../src/game/engine.ts';
import { GameService } from '../src/game/service.ts';
import { AIValidator } from '../src/ai/validator.ts';
import type { AIOutcome } from '../src/ai/provider.ts';
import { FakeProvider, createFakeTimers, silentLogger } from './helpers.ts';

process.env.ROUND_REVEAL_MS = '100';

interface EnvOpts {
  failAI?: boolean;
  responses?: Map<string, AIOutcome | string | Error>;
}

function makeEnv(opts: EnvOpts = {}) {
  const provider = new FakeProvider({ ok: !opts.failAI, responses: opts.responses });
  const validator = new AIValidator(provider, { concurrency: 2, maxRetries: 1, confidenceThreshold: 0.7, log: silentLogger });
  const timers = createFakeTimers();
  const broadcasted: S2CMessage[] = [];
  const sent: Array<{ playerId: string; msg: S2CMessage }> = [];
  let emptied = false;
  const initial = createGame('Ana', {
    ...DEFAULT_SETTINGS,
    categories: ['Animal', 'Ciudad', 'Comida'],
    rounds: 2,
  });
  const first = initial.players[0];
  assert.ok(first);
  const hostId = first.id;
  const service = new GameService(initial, {
    validator,
    log: silentLogger,
    broadcast: (msg) => broadcasted.push(msg),
    sendTo: (playerId, msg) => sent.push({ playerId, msg }),
    onGameEmpty: () => {
      emptied = true;
    },
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });
  return {
    service,
    provider,
    timers,
    broadcasted,
    sent,
    hostId,
    emptied: () => emptied,
    state: () => service.state,
  };
}

function toPlaying(env: ReturnType<typeof makeEnv>): void {
  env.service.handleClientEvent({ t: 'open_config' }, env.hostId);
  env.service.handleClientEvent({ t: 'start' }, env.hostId);
  env.timers.advance(100);
  assert.equal(env.state().phase, 'playing');
}

function scoreOf(env: ReturnType<typeof makeEnv>, playerId: string): number {
  return env.state().players.find((p) => p.id === playerId)?.score ?? -1;
}

test('flujo completo: ronda -> IA valida -> resultados -> siguiente ronda -> fin', async () => {
  const env = makeEnv();
  const { service } = env;
  env.provider.responses.set('Animal|mesa', { valid: false, confidence: 0.9, reason: 'una mesa no es un animal', normalizedAnswer: 'mesa' });

  service.joinPlayer('p2', 'Luis');
  toPlaying(env);

  service.handleClientEvent({ t: 'answer', category: 'Animal', text: 'Mono' }, env.hostId);
  service.handleClientEvent({ t: 'answer', category: 'Animal', text: 'Mesa' }, 'p2');
  service.handleClientEvent({ t: 'answer', category: 'Ciudad', text: 'Madrid' }, env.hostId);
  service.handleClientEvent({ t: 'answer', category: 'Ciudad', text: 'Madrid' }, 'p2');

  service.handleClientEvent({ t: 'pencil_down' }, 'p2');
  assert.equal(env.state().phase, 'validating');
  assert.ok(env.broadcasted.some((m) => m.t === 'event' && m.kind === 'ai_validating'));

  await service.waitForValidation();
  assert.equal(env.state().phase, 'results');
  assert.ok(env.broadcasted.some((m) => m.t === 'event' && m.kind === 'ai_done'));

  assert.equal(scoreOf(env, env.hostId), 15);
  assert.equal(scoreOf(env, 'p2'), 5);

  service.handleClientEvent({ t: 'next_round' }, env.hostId);
  assert.equal(env.state().phase, 'round_start');
  assert.equal(env.state().round?.index, 2);
  env.timers.advance(100);
  assert.equal(env.state().phase, 'playing');

  service.handleClientEvent({ t: 'pencil_down' }, env.hostId);
  await service.waitForValidation();
  assert.equal(env.state().phase, 'results');

  service.handleClientEvent({ t: 'next_round' }, env.hostId);
  assert.equal(env.state().phase, 'finished');
});

test('IA no disponible: respuestas dudosas para revisión manual', async () => {
  const env = makeEnv({ failAI: true });
  const { service } = env;
  toPlaying(env);
  service.handleClientEvent({ t: 'answer', category: 'Animal', text: 'Mono' }, env.hostId);
  service.handleClientEvent({ t: 'pencil_down' }, env.hostId);
  await service.waitForValidation();
  const a = env.state().round?.answers[0];
  assert.equal(a?.status, 'uncertain');
  assert.equal(a?.decidedBy, 'system');
  assert.equal(env.state().aiStatus.available, false);
  assert.equal(env.state().phase, 'results');
  assert.equal(scoreOf(env, env.hostId), 0);
  assert.ok(env.broadcasted.some((m) => m.t === 'event' && m.kind === 'ai_unavailable'));
});

test('timeout termina la ronda y valida', async () => {
  const env = makeEnv();
  const { service } = env;
  toPlaying(env);
  service.handleClientEvent({ t: 'answer', category: 'Animal', text: 'Mono' }, env.hostId);
  env.timers.advance(60 * 1000);
  assert.equal(env.state().phase, 'validating');
  assert.equal(env.state().round?.endedBy, 'timeout');
  await service.waitForValidation();
  const a = env.state().round?.answers[0];
  assert.equal(a?.status, 'valid');
  assert.equal(env.state().phase, 'results');
  assert.equal(scoreOf(env, env.hostId), 10);
});

test('disputa y resolución recalculan la puntuación', async () => {
  const env = makeEnv();
  const { service } = env;
  service.joinPlayer('p2', 'Luis');
  toPlaying(env);
  service.handleClientEvent({ t: 'answer', category: 'Animal', text: 'Mono' }, env.hostId);
  service.handleClientEvent({ t: 'pencil_down' }, env.hostId);
  await service.waitForValidation();
  assert.equal(scoreOf(env, env.hostId), 10);

  const a = env.state().round?.answers[0];
  assert.ok(a);
  service.handleClientEvent({ t: 'dispute', answerId: a.id }, 'p2');
  assert.equal(scoreOf(env, env.hostId), 0);
  assert.equal(env.state().round?.answers[0]?.status, 'disputed');

  service.handleClientEvent({ t: 'resolve', answerId: a.id, valid: true }, 'p2');
  assert.equal(scoreOf(env, env.hostId), 10);
  assert.equal(env.state().round?.answers[0]?.decidedBy, 'player');
});

test('restart reinicia la partida al lobby', async () => {
  const env = makeEnv();
  const { service } = env;
  toPlaying(env);
  service.handleClientEvent({ t: 'answer', category: 'Animal', text: 'Mono' }, env.hostId);
  service.handleClientEvent({ t: 'pencil_down' }, env.hostId);
  await service.waitForValidation();
  service.handleClientEvent({ t: 'next_round' }, env.hostId);
  env.timers.advance(100);
  service.handleClientEvent({ t: 'pencil_down' }, env.hostId);
  await service.waitForValidation();
  service.handleClientEvent({ t: 'next_round' }, env.hostId);
  assert.equal(env.state().phase, 'finished');
  assert.equal(scoreOf(env, env.hostId), 10);

  service.handleClientEvent({ t: 'restart' }, env.hostId);
  assert.equal(env.state().phase, 'lobby');
  assert.equal(env.state().round, null);
  assert.equal(scoreOf(env, env.hostId), 0);
});

test('update_settings inválido devuelve error al cliente', () => {
  const env = makeEnv();
  const { service } = env;
  service.handleClientEvent({ t: 'open_config' }, env.hostId);
  service.handleClientEvent({ t: 'update_settings', settings: { rounds: 0 } }, env.hostId);
  assert.ok(env.sent.some((s) => s.msg.t === 'error' && s.msg.code === 'settings'));
  service.handleClientEvent({ t: 'update_settings', settings: { rounds: 5, timeLimit: 90 } }, env.hostId);
  assert.equal(env.state().settings.rounds, 5);
  assert.equal(env.state().settings.timeLimit, 90);
});

test('solo el host puede configurar y arrancar', () => {
  const env = makeEnv();
  const { service } = env;
  service.joinPlayer('p2', 'Luis');
  service.handleClientEvent({ t: 'open_config' }, 'p2');
  assert.ok(env.sent.some((s) => s.msg.t === 'error' && s.msg.code === 'forbidden'));
  service.handleClientEvent({ t: 'start' }, 'p2');
  assert.ok(env.sent.some((s) => s.msg.t === 'error'));
});

test('respuesta con categoría inválida devuelve error', () => {
  const env = makeEnv();
  const { service } = env;
  toPlaying(env);
  service.handleClientEvent({ t: 'answer', category: 'Planeta', text: 'Marte' }, env.hostId);
  assert.ok(env.sent.some((s) => s.msg.t === 'error' && s.msg.code === 'category'));
});

test('respuesta vacía se marca inválida por el sistema', async () => {
  const env = makeEnv();
  const { service } = env;
  toPlaying(env);
  service.handleClientEvent({ t: 'answer', category: 'Animal', text: '   ' }, env.hostId);
  service.handleClientEvent({ t: 'pencil_down' }, env.hostId);
  await service.waitForValidation();
  const a = env.state().round?.answers[0];
  assert.equal(a?.status, 'invalid');
  assert.equal(a?.decidedBy, 'system');
});

test('confianza baja se marca como dudosa', async () => {
  const env = makeEnv({
    responses: new Map([['Animal|mono', { valid: true, confidence: 0.4, reason: 'no estoy seguro', normalizedAnswer: 'mono' }]]),
  });
  const { service } = env;
  toPlaying(env);
  service.handleClientEvent({ t: 'answer', category: 'Animal', text: 'Mono' }, env.hostId);
  service.handleClientEvent({ t: 'pencil_down' }, env.hostId);
  await service.waitForValidation();
  const a = env.state().round?.answers[0];
  assert.equal(a?.status, 'uncertain');
  assert.equal(a?.decidedBy, 'ai');
});

test('reconexión restaura la conexión del jugador', () => {
  const env = makeEnv();
  const { service } = env;
  service.joinPlayer('p2', 'Luis');
  toPlaying(env);
  service.disconnect(env.hostId);
  assert.equal(env.state().players.find((p) => p.id === env.hostId)?.connected, false);
  service.reconnect(env.hostId);
  assert.equal(env.state().players.find((p) => p.id === env.hostId)?.connected, true);
});

test('leave del último jugador elimina la partida', () => {
  const env = makeEnv();
  const { service } = env;
  service.handleClientEvent({ t: 'leave' }, env.hostId);
  assert.equal(env.emptied(), true);
});

test('mensaje de otro cliente sin partida devuelve error', () => {
  const env = makeEnv();
  const { service } = env;
  service.handleClientEvent({ t: 'pencil_down' }, 'inexistente');
  assert.ok(env.sent.some((s) => s.msg.t === 'error' && s.msg.code === 'forbidden'));
});

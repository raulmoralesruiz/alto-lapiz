import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GameState } from '../../shared/src/types.ts';
import { DEFAULT_SETTINGS } from '../../shared/src/types.ts';
import {
  applyEvent,
  createGame,
  EngineError,
  mergeSettings,
  validateSettings,
} from '../src/game/engine.ts';

function makeGame(over: Partial<typeof DEFAULT_SETTINGS> = {}): GameState {
  return createGame('Ana', { ...DEFAULT_SETTINGS, categories: ['Animal', 'Ciudad', 'Comida'], ...over });
}

function hostId(s: GameState): string {
  const h = s.players[0];
  assert.ok(h);
  return h.id;
}

function addPlayer(s: GameState, id: string, name: string): GameState {
  return applyEvent(s, { type: 'JOIN', playerId: id, name });
}

function toPlaying(s: GameState): GameState {
  let out = applyEvent(s, { type: 'OPEN_CONFIG' });
  out = applyEvent(out, { type: 'START' });
  out = applyEvent(out, { type: 'PLAYING_START' });
  return out;
}

test('createGame: lobby con host', () => {
  const s = makeGame();
  assert.equal(s.phase, 'lobby');
  assert.equal(s.players.length, 1);
  assert.equal(s.players[0]?.isHost, true);
  assert.match(s.code, /^[A-Z2-9]{5}$/);
});

test('JOIN añade jugadores solo en lobby', () => {
  const s = addPlayer(makeGame(), 'p2', 'Luis');
  assert.equal(s.players.length, 2);
  assert.throws(() => applyEvent(toPlaying(s), { type: 'JOIN', playerId: 'p3', name: 'X' }), EngineError);
});

test('flujo completo de una ronda hasta resultados', () => {
  let s = addPlayer(makeGame(), 'p2', 'Luis');
  const host = hostId(s);
  s = toPlaying(s);
  assert.equal(s.phase, 'playing');
  assert.ok(s.round);
  assert.equal(s.round.letter.length, 1);

  s = applyEvent(s, { type: 'SET_ANSWER', playerId: host, category: 'Animal', raw: 'Mono' });
  s = applyEvent(s, { type: 'SET_ANSWER', playerId: 'p2', category: 'Animal', raw: 'Mesa' });
  s = applyEvent(s, { type: 'SET_ANSWER', playerId: host, category: 'Ciudad', raw: 'Madrid' });
  s = applyEvent(s, { type: 'SET_ANSWER', playerId: 'p2', category: 'Ciudad', raw: 'Madrid' });

  s = applyEvent(s, { type: 'PENCIL_DOWN', playerId: 'p2' });
  assert.equal(s.phase, 'validating');
  assert.equal(s.round?.endedBy, 'pencil_down');

  const answers = s.round?.answers;
  assert.ok(answers && answers.length === 4);
  const [mono, mesa, m1, m2] = answers;
  assert.ok(mono && mesa && m1 && m2);
  s = applyEvent(s, { type: 'SET_ANSWER_STATUS', answerId: mono.id, status: 'valid', confidence: 0.95, reason: 'ok', decidedBy: 'ai' });
  s = applyEvent(s, { type: 'SET_ANSWER_STATUS', answerId: mesa.id, status: 'invalid', confidence: 0.9, reason: 'no', decidedBy: 'ai' });
  s = applyEvent(s, { type: 'SET_ANSWER_STATUS', answerId: m1.id, status: 'valid', confidence: 0.9, reason: 'ok', decidedBy: 'ai' });
  s = applyEvent(s, { type: 'SET_ANSWER_STATUS', answerId: m2.id, status: 'valid', confidence: 0.9, reason: 'ok', decidedBy: 'ai' });

  s = applyEvent(s, { type: 'SCORE_ROUND' });
  assert.equal(s.phase, 'results');
  const byId = new Map(s.round?.answers.map((a) => [a.id, a]));
  assert.equal(byId.get(mono.id)?.points, 10);
  assert.equal(byId.get(mesa.id)?.points, 0);
  assert.equal(byId.get(m1.id)?.points, 5);
  assert.equal(byId.get(m2.id)?.points, 5);
  assert.equal(s.players.find((p) => p.id === host)?.score, 15);
  assert.equal(s.players.find((p) => p.id === 'p2')?.score, 5);
});

test('SCORE_ROUND con respuestas pendientes lanza error', () => {
  let s = toPlaying(addPlayer(makeGame(), 'p2', 'Luis'));
  const host = hostId(s);
  s = applyEvent(s, { type: 'SET_ANSWER', playerId: host, category: 'Animal', raw: 'Mono' });
  s = applyEvent(s, { type: 'PENCIL_DOWN', playerId: host });
  assert.throws(() => applyEvent(s, { type: 'SCORE_ROUND' }), (e: unknown) => e instanceof EngineError && e.code === 'pending');
});

test('SET_ANSWER con categoría no válida lanza error', () => {
  const s = toPlaying(addPlayer(makeGame(), 'p2', 'Luis'));
  const host = hostId(s);
  assert.throws(
    () => applyEvent(s, { type: 'SET_ANSWER', playerId: host, category: 'Planeta', raw: 'Marte' }),
    (e: unknown) => e instanceof EngineError && e.code === 'category',
  );
});

test('SET_ANSWER reemplaza la respuesta previa del jugador', () => {
  let s = toPlaying(addPlayer(makeGame(), 'p2', 'Luis'));
  const host = hostId(s);
  s = applyEvent(s, { type: 'SET_ANSWER', playerId: host, category: 'Animal', raw: 'Mono' });
  s = applyEvent(s, { type: 'SET_ANSWER', playerId: host, category: 'Animal', raw: 'Maca' });
  assert.equal(s.round?.answers.length, 1);
  assert.equal(s.round?.answers[0]?.raw, 'Maca');
});

test('disputar y resolver recalcula puntos', () => {
  let s = addPlayer(makeGame(), 'p2', 'Luis');
  const host = hostId(s);
  s = toPlaying(s);
  s = applyEvent(s, { type: 'SET_ANSWER', playerId: host, category: 'Animal', raw: 'Jaguar' });
  s = applyEvent(s, { type: 'PENCIL_DOWN', playerId: host });
  const a = s.round?.answers[0];
  assert.ok(a);
  s = applyEvent(s, { type: 'SET_ANSWER_STATUS', answerId: a.id, status: 'valid', confidence: 0.99, reason: 'ok', decidedBy: 'ai' });
  s = applyEvent(s, { type: 'SCORE_ROUND' });
  assert.equal(s.players.find((p) => p.id === host)?.score, 10);

  s = applyEvent(s, { type: 'DISPUTE', answerId: a.id, byPlayerId: 'p2' });
  assert.equal(s.round?.answers[0]?.status, 'disputed');
  assert.equal(s.round?.answers[0]?.points, 0);
  assert.equal(s.players.find((p) => p.id === host)?.score, 0);

  s = applyEvent(s, { type: 'RESOLVE', answerId: a.id, valid: false, byPlayerId: 'p2' });
  assert.equal(s.round?.answers[0]?.status, 'invalid');
  assert.equal(s.round?.answers[0]?.decidedBy, 'player');
  assert.equal(s.players.find((p) => p.id === host)?.score, 0);
});

test('RESOLVE solo aplica sobre respuestas en disputa', () => {
  let s = addPlayer(makeGame(), 'p2', 'Luis');
  const host = hostId(s);
  s = toPlaying(s);
  s = applyEvent(s, { type: 'SET_ANSWER', playerId: host, category: 'Animal', raw: 'Mono' });
  s = applyEvent(s, { type: 'PENCIL_DOWN', playerId: host });
  const a = s.round?.answers[0];
  assert.ok(a);
  s = applyEvent(s, { type: 'SET_ANSWER_STATUS', answerId: a.id, status: 'valid', confidence: 0.9, reason: 'ok', decidedBy: 'ai' });
  s = applyEvent(s, { type: 'SCORE_ROUND' });
  assert.throws(
    () => applyEvent(s, { type: 'RESOLVE', answerId: a.id, valid: true, byPlayerId: 'p2' }),
    (e: unknown) => e instanceof EngineError && e.code === 'state',
  );
});

test('NEXT_ROUND avanza rondas y termina la partida', () => {
  let s = addPlayer(makeGame({ rounds: 2 }), 'p2', 'Luis');
  const host = hostId(s);
  s = toPlaying(s);
  s = applyEvent(s, { type: 'SET_ANSWER', playerId: host, category: 'Animal', raw: 'Mono' });
  s = applyEvent(s, { type: 'PENCIL_DOWN', playerId: host });
  const a = s.round?.answers[0];
  assert.ok(a);
  s = applyEvent(s, { type: 'SET_ANSWER_STATUS', answerId: a.id, status: 'valid', confidence: 0.9, reason: 'ok', decidedBy: 'ai' });
  s = applyEvent(s, { type: 'SCORE_ROUND' });
  s = applyEvent(s, { type: 'NEXT_ROUND' });
  assert.equal(s.phase, 'round_start');
  assert.equal(s.round?.index, 2);
  s = applyEvent(s, { type: 'PLAYING_START' });
  s = applyEvent(s, { type: 'PENCIL_DOWN', playerId: host });
  s = applyEvent(s, { type: 'SCORE_ROUND' });
  s = applyEvent(s, { type: 'NEXT_ROUND' });
  assert.equal(s.phase, 'finished');
});

test('RESTART reinicia la partida', () => {
  let s = addPlayer(makeGame({ rounds: 2 }), 'p2', 'Luis');
  const host = hostId(s);
  s = toPlaying(s);
  s = applyEvent(s, { type: 'SET_ANSWER', playerId: host, category: 'Animal', raw: 'Mono' });
  s = applyEvent(s, { type: 'PENCIL_DOWN', playerId: host });
  const a = s.round?.answers[0];
  assert.ok(a);
  s = applyEvent(s, { type: 'SET_ANSWER_STATUS', answerId: a.id, status: 'valid', confidence: 0.9, reason: 'ok', decidedBy: 'ai' });
  s = applyEvent(s, { type: 'SCORE_ROUND' });
  s = applyEvent(s, { type: 'NEXT_ROUND' });
  s = applyEvent(s, { type: 'PLAYING_START' });
  s = applyEvent(s, { type: 'PENCIL_DOWN', playerId: host });
  s = applyEvent(s, { type: 'SCORE_ROUND' });
  s = applyEvent(s, { type: 'NEXT_ROUND' });
  assert.equal(s.phase, 'finished');
  assert.equal(s.players.find((p) => p.id === host)?.score, 10);
  s = applyEvent(s, { type: 'RESTART' });
  assert.equal(s.phase, 'lobby');
  assert.equal(s.round, null);
  assert.equal(s.players.find((p) => p.id === host)?.score, 0);
});

test('DISCONNECT del host en lobby transfiere el host', () => {
  let s = addPlayer(makeGame(), 'p2', 'Luis');
  const host = hostId(s);
  s = applyEvent(s, { type: 'DISCONNECT', playerId: host });
  assert.equal(s.players.find((p) => p.id === host)?.connected, false);
  assert.equal(s.players.find((p) => p.id === 'p2')?.isHost, true);
});

test('TIME_UP termina la ronda', () => {
  let s = toPlaying(addPlayer(makeGame(), 'p2', 'Luis'));
  s = applyEvent(s, { type: 'TIME_UP' });
  assert.equal(s.phase, 'validating');
  assert.equal(s.round?.endedBy, 'timeout');
});

test('validateSettings rechaza configuraciones inválidas', () => {
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, categories: ['Solo', 'Dos'] }), EngineError);
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, rounds: 0 }), EngineError);
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, timeLimit: 5 }), EngineError);
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, language: 'xx' as never }), EngineError);
  assert.throws(
    () => validateSettings({ ...DEFAULT_SETTINGS, categories: ['Animal', 'animal', 'Ciudad'] }),
    EngineError,
  );
});

test('mergeSettings combina parcial y valida', () => {
  const base = { ...DEFAULT_SETTINGS, categories: ['Animal', 'Ciudad', 'Comida'] };
  const merged = mergeSettings(base, { rounds: 5 });
  assert.equal(merged.rounds, 5);
  assert.equal(merged.categories.length, 3);
  assert.throws(() => mergeSettings(base, { rounds: 99 }), EngineError);
});

test('LEAVE del último jugador deja la partida vacía', () => {
  let s = makeGame();
  const host = hostId(s);
  s = applyEvent(s, { type: 'LEAVE', playerId: host });
  assert.equal(s.players.length, 0);
});

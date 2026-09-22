import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AnswerState, GameSettings } from '../../shared/src/types.ts';
import { computeRoundPoints } from '../src/game/scoring.ts';

const settings: GameSettings = {
  categories: ['Animal'],
  categoriesPerRound: 3,
  rounds: 1,
  timeLimit: 60,
  language: 'es',
  pointsUnique: 10,
  pointsShared: 5,
};

function answer(over: Partial<AnswerState> & { id: string; playerId: string }): AnswerState {
  return {
    category: 'Animal',
    raw: '',
    normalized: '',
    status: 'valid',
    confidence: 0.9,
    reason: null,
    decidedBy: 'ai',
    points: 0,
    ...over,
  };
}

test('respuesta válida única -> pointsUnique', () => {
  const answers = [answer({ id: 'a1', playerId: 'p1', raw: 'Mono', normalized: 'mono' })];
  const pts = computeRoundPoints(answers, settings);
  assert.equal(pts.get('a1'), 10);
});

test('respuesta válida duplicada -> pointsShared para todos', () => {
  const answers = [
    answer({ id: 'a1', playerId: 'p1', raw: 'Mono', normalized: 'mono' }),
    answer({ id: 'a2', playerId: 'p2', raw: 'Mono', normalized: 'mono' }),
  ];
  const pts = computeRoundPoints(answers, settings);
  assert.equal(pts.get('a1'), 5);
  assert.equal(pts.get('a2'), 5);
});

test('duplicados con mayúsculas distintas cuentan igual', () => {
  const answers = [
    answer({ id: 'a1', playerId: 'p1', raw: 'Perro', normalized: 'perro' }),
    answer({ id: 'a2', playerId: 'p2', raw: 'PERRO', normalized: 'perro' }),
  ];
  const pts = computeRoundPoints(answers, settings);
  assert.equal(pts.get('a1'), 5);
  assert.equal(pts.get('a2'), 5);
});

test('duplicados con acentos distintos cuentan igual', () => {
  const answers = [
    answer({ id: 'a1', playerId: 'p1', raw: 'París', normalized: 'parís' }),
    answer({ id: 'a2', playerId: 'p2', raw: 'Paris', normalized: 'paris' }),
  ];
  const pts = computeRoundPoints(answers, settings);
  assert.equal(pts.get('a1'), 5);
  assert.equal(pts.get('a2'), 5);
});

test('respuesta inválida -> 0 aunque sea única', () => {
  const answers = [answer({ id: 'a1', playerId: 'p1', raw: 'Mesa', normalized: 'mesa', status: 'invalid' })];
  const pts = computeRoundPoints(answers, settings);
  assert.equal(pts.get('a1'), 0);
});

test('respuesta dudosa -> 0', () => {
  const answers = [answer({ id: 'a1', playerId: 'p1', raw: 'Jaguar', normalized: 'jaguar', status: 'uncertain' })];
  const pts = computeRoundPoints(answers, settings);
  assert.equal(pts.get('a1'), 0);
});

test('respuesta en disputa -> 0', () => {
  const answers = [answer({ id: 'a1', playerId: 'p1', raw: 'Mono', normalized: 'mono', status: 'disputed' })];
  const pts = computeRoundPoints(answers, settings);
  assert.equal(pts.get('a1'), 0);
});

test('puntuación configurable', () => {
  const custom: GameSettings = { ...settings, pointsUnique: 20, pointsShared: 3 };
  const answers = [
    answer({ id: 'a1', playerId: 'p1', raw: 'Mono', normalized: 'mono' }),
    answer({ id: 'a2', playerId: 'p2', raw: 'Mono', normalized: 'mono' }),
  ];
  const pts = computeRoundPoints(answers, custom);
  assert.equal(pts.get('a1'), 3);
  assert.equal(pts.get('a2'), 3);
});

test('una inválida duplicada no afecta a la válida', () => {
  const answers = [
    answer({ id: 'a1', playerId: 'p1', raw: 'Mono', normalized: 'mono' }),
    answer({ id: 'a2', playerId: 'p2', raw: 'Mesa', normalized: 'mesa', status: 'invalid' }),
  ];
  const pts = computeRoundPoints(answers, settings);
  assert.equal(pts.get('a1'), 10);
  assert.equal(pts.get('a2'), 0);
});

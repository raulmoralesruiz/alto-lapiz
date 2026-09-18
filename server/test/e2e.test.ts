import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { WebSocket } from 'ws';

process.env.ROUND_REVEAL_MS = '50';
process.env.LOG_LEVEL = 'error';

import { loadConfig } from '../src/config.ts';
import { AIValidator } from '../src/ai/validator.ts';
import { Hub } from '../src/ws/hub.ts';
import { createHttpServer } from '../src/http/routes.ts';
import { FakeProvider, silentLogger } from './helpers.ts';
import type { GameState, S2CMessage } from '../../shared/src/types.ts';

class Client {
  readonly ws: WebSocket;
  private queue: S2CMessage[] = [];
  private waiters: Array<{ pred: (m: S2CMessage) => boolean; res: (m: S2CMessage) => void }> = [];

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on('message', (data) => this._on(JSON.parse(String(data)) as S2CMessage));
  }

  private _on(m: S2CMessage): void {
    this.queue.push(m);
    this.waiters = this.waiters.filter((w) => {
      if (w.pred(m)) {
        w.res(m);
        return false;
      }
      return true;
    });
  }

  open(): Promise<void> {
    return new Promise((res, rej) => {
      this.ws.once('open', () => res());
      this.ws.once('error', rej);
    });
  }

  send(msg: unknown): void {
    this.ws.send(JSON.stringify(msg));
  }

  lastState(): GameState | null {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const m = this.queue[i];
      if (m && (m.t === 'state' || m.t === 'joined')) return m.game;
    }
    return null;
  }

  waitFor(pred: (m: S2CMessage) => boolean, timeoutMs = 8000): Promise<S2CMessage> {
    const existing = this.queue.find(pred);
    if (existing) return Promise.resolve(existing);
    return new Promise((res, rej) => {
      const t = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.res === res);
        if (idx >= 0) this.waiters.splice(idx, 1);
        rej(new Error('timeout esperando mensaje'));
      }, timeoutMs);
      this.waiters.push({ pred, res: (m) => { clearTimeout(t); res(m); } });
    });
  }

  close(): void {
    this.ws.removeAllListeners();
    this.ws.close();
  }
}

function stateOf(c: Client): GameState {
  const s = c.lastState();
  assert.ok(s, 'debe haber un estado');
  return s;
}

function scoreOf(s: GameState, playerId: string): number {
  const p = s.players.find((x) => x.id === playerId);
  assert.ok(p, 'jugador debe existir');
  return p.score;
}

test('E2E: partida completa por WebSocket (crear, jugar, validar, puntuar, disputar, terminar)', async (t) => {
  const provider = new FakeProvider({ ok: true });
  const validator = new AIValidator(provider, { concurrency: 2, maxRetries: 0, confidenceThreshold: 0.7, log: silentLogger });
  const hub = new Hub({ validator, log: silentLogger, allowedOrigins: null });
  const config = loadConfig();
  const server: Server = createHttpServer({
    config,
    validator,
    log: silentLogger,
    gameCount: () => hub.gameCount,
    staticDir: null,
  });
  server.on('upgrade', (req, socket, head) => hub.handleUpgrade(req, socket as never, head));

  const port = await new Promise<number>((res, rej) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      res(typeof addr === 'object' && addr ? addr.port : 0);
    });
    server.on('error', rej);
  });
  const url = `ws://127.0.0.1:${port}/ws`;

  const ana = new Client(url);
  const luis = new Client(url);
  await ana.open();
  await luis.open();

  after(() => {
    ana.close();
    luis.close();
    hub['games'].forEach((g) => g.destroy());
    server.close();
  });

  // 1) Ana crea la partida
  ana.send({
    t: 'create',
    name: 'Ana',
    settings: { rounds: 2, timeLimit: 15, categories: ['Animal', 'Ciudad', 'Comida'], pointsUnique: 10, pointsShared: 5 },
  });
  const joinedA = await ana.waitFor((m) => m.t === 'joined');
  assert.equal(joinedA.t, 'joined');
  if (joinedA.t !== 'joined') return;
  const anaId = joinedA.playerId;
  const code = joinedA.game.code;
  assert.ok(joinedA.game.players.length === 1);

  // 2) Luis se une
  luis.send({ t: 'join', code, name: 'Luis' });
  const joinedL = await luis.waitFor((m) => m.t === 'joined');
  assert.equal(joinedL.t, 'joined');
  if (joinedL.t !== 'joined') return;
  const luisId = joinedL.playerId;
  assert.notEqual(anaId, luisId);
  await ana.waitFor((m) => m.t === 'state' && m.game.players.length === 2);

  // 3) Ana configura y empieza
  ana.send({ t: 'open_config' });
  await ana.waitFor((m) => m.t === 'state' && m.game.phase === 'configuring');
  ana.send({ t: 'start' });
  await ana.waitFor((m) => m.t === 'state' && m.game.phase === 'round_start');
  await ana.waitFor((m) => m.t === 'state' && m.game.phase === 'playing');

  // 4) Ambos responden
  const answersA: Array<[string, string]> = [
    ['Animal', 'Jaguar'],
    ['Ciudad', 'Madrid'],
    ['Comida', 'Pan'],
  ];
  const answersL: Array<[string, string]> = [
    ['Animal', 'Jaguar'],
    ['Ciudad', 'Madrid'],
    ['Comida', 'Sopa'],
  ];
  for (const [cat, text] of answersA) ana.send({ t: 'answer', category: cat, text });
  for (const [cat, text] of answersL) luis.send({ t: 'answer', category: cat, text });
  await ana.waitFor((m) => m.t === 'state' && m.game.round?.answers.length === 6);

  // 5) Ana baja el lápiz -> validación -> resultados
  ana.send({ t: 'pencil_down' });
  await ana.waitFor((m) => m.t === 'state' && m.game.phase === 'results');

  const s1 = stateOf(ana);
  assert.equal(s1.phase, 'results');
  // Animal: Jaguar x2 (repetida) -> 5 c/u. Ciudad: Madrid x2 -> 5 c/u. Comida: Pan/Sopa únicas -> 10 c/u.
  assert.equal(scoreOf(s1, anaId), 20, `Ana debería tener 20, tiene ${scoreOf(s1, anaId)}`);
  assert.equal(scoreOf(s1, luisId), 20, `Luis debería tener 20, tiene ${scoreOf(s1, luisId)}`);

  // 6) Disputa y resolución
  const panAnswer = s1.round?.answers.find((a) => a.raw === 'Pan');
  assert.ok(panAnswer, 'debe existir la respuesta Pan');
  luis.send({ t: 'dispute', answerId: panAnswer.id });
  await ana.waitFor((m) => m.t === 'state' && !!(m.game.round?.answers.some((a) => a.id === panAnswer.id && a.status === 'disputed')));
  // Al disputar, los puntos de Pan (10) se retienen de Ana
  assert.equal(scoreOf(stateOf(ana), anaId), 10, 'tras la disputa Ana debe tener 10');
  luis.send({ t: 'resolve', answerId: panAnswer.id, valid: true });
  await ana.waitFor((m) => m.t === 'state' && !!(m.game.round?.answers.some((a) => a.id === panAnswer.id && a.decidedBy === 'player')));
  assert.equal(scoreOf(stateOf(ana), anaId), 20, 'tras resolver como válida Ana vuelve a 20');

  // 7) Siguiente ronda (2)
  ana.send({ t: 'next_round' });
  await ana.waitFor((m) => m.t === 'state' && m.game.phase === 'round_start' && m.game.round?.index === 2);
  await ana.waitFor((m) => m.t === 'state' && m.game.phase === 'playing' && m.game.round?.index === 2);
  ana.send({ t: 'answer', category: 'Animal', text: 'León' });
  luis.send({ t: 'answer', category: 'Animal', text: 'Tigre' });
  luis.send({ t: 'pencil_down' });
  await ana.waitFor((m) => m.t === 'state' && m.game.phase === 'results' && m.game.round?.index === 2);

  // 8) Terminar partida
  ana.send({ t: 'next_round' });
  const finished = await ana.waitFor((m) => m.t === 'state' && m.game.phase === 'finished');
  assert.equal(finished.t, 'state');
  if (finished.t !== 'state') return;
  const sf = finished.game;
  assert.equal(scoreOf(sf, anaId), 30, `Ana final 30 (20 + 10 única), tiene ${scoreOf(sf, anaId)}`);
  assert.equal(scoreOf(sf, luisId), 30, `Luis final 30 (20 + 10 única), tiene ${scoreOf(sf, luisId)}`);
});

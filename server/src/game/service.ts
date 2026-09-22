import type {
  AnswerStatus,
  C2SMessage,
  GameState,
  S2CMessage,
} from '../../../shared/src/types.ts';
import { MAX_ANSWER_LEN, MAX_CATEGORY_LEN, MAX_NAME_LEN } from '../../../shared/src/types.ts';
import type { AIValidator } from '../ai/validator.ts';
import type { Logger } from '../log.ts';
import { sanitizeText } from '../util/sanitize.ts';
import { applyEvent, EngineError, mergeSettings } from './engine.ts';

export interface ServiceDeps {
  validator: AIValidator;
  log: Logger;
  broadcast: (msg: S2CMessage) => void;
  sendTo: (playerId: string, msg: S2CMessage) => void;
  onGameEmpty: () => void;
  setTimer?: (ms: number, fn: () => void) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/**
 * Orquesta una partida: aplica eventos al motor puro, gestiona los
 * temporizadores, ejecuta el pipeline de validación de IA y emite
 * estado a los clientes. El servidor es la única autoridad.
 */
export class GameService {
  state: GameState;
  private deps: ServiceDeps;
  private timers = new Set<unknown>();
  private destroyed = false;
  private validation?: Promise<void>;

  constructor(initial: GameState, deps: ServiceDeps) {
    this.state = initial;
    this.deps = deps;
  }

  get code(): string {
    return this.state.code;
  }

  destroy(): void {
    this.destroyed = true;
    this.clearTimers();
  }

  private later(ms: number, fn: () => void): void {
    const set = this.deps.setTimer ?? ((m: number, f: () => void) => setTimeout(f, m));
    const handle = set(ms, () => {
      this.timers.delete(handle);
      if (!this.destroyed) fn();
    });
    this.timers.add(handle);
  }

  private clearTimers(): void {
    const clear = this.deps.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
    for (const t of this.timers) clear(t);
    this.timers.clear();
  }

  private emitState(): void {
    this.deps.broadcast({ t: 'state', game: this.state, serverNow: Date.now() });
  }

  private emitEvent(kind: 'pencil_down' | 'round_started' | 'round_ended' | 'ai_validating' | 'ai_done' | 'ai_unavailable', payload?: Record<string, unknown>): void {
    this.deps.broadcast({ t: 'event', kind, payload });
  }

  private requirePlayer(actorId: string | null): void {
    if (!actorId || !this.state.players.some((p) => p.id === actorId)) {
      throw new EngineError('forbidden', 'No eres jugador de esta partida');
    }
  }

  private requireHost(actorId: string | null): void {
    const p = this.state.players.find((pl) => pl.id === actorId);
    if (!p) throw new EngineError('forbidden', 'No eres jugador de esta partida');
    if (!p.isHost) throw new EngineError('forbidden', 'Solo el anfitrión puede hacer esto');
  }

  joinPlayer(playerId: string, rawName: string): boolean {
    const name = sanitizeText(rawName, MAX_NAME_LEN) || 'Jugador';
    try {
      this.state = applyEvent(this.state, { type: 'JOIN', playerId, name });
    } catch (err) {
      if (err instanceof EngineError) {
        this.deps.log.warn('join.rejected', { code: this.code, message: err.message });
        this.deps.sendTo(playerId, { t: 'error', code: err.code, message: err.message });
        return false;
      }
      throw err;
    }
    this.deps.log.info('player.joined', { code: this.code, player: name, total: this.state.players.length });
    this.deps.sendTo(playerId, { t: 'joined', playerId, game: this.state, serverNow: Date.now() });
    this.emitState();
    return true;
  }

  reconnect(playerId: string): void {
    this.state = applyEvent(this.state, { type: 'RECONNECT', playerId });
    this.deps.log.info('player.reconnected', { code: this.code, player: playerId });
    this.emitState();
  }

  disconnect(playerId: string): void {
    try {
      this.state = applyEvent(this.state, { type: 'DISCONNECT', playerId });
      this.emitState();
    } catch (e) {
      if (e instanceof EngineError && e.code === 'not_found') return;
      throw e;
    }
  }

  sendError(playerId: string | null, code: string, message: string): void {
    if (playerId) this.deps.sendTo(playerId, { t: 'error', code, message });
  }

  handleClientEvent(msg: C2SMessage, actorId: string | null): void {
    try {
      this.apply(msg, actorId);
    } catch (e) {
      if (e instanceof EngineError) {
        this.deps.log.warn('game.rejected', { code: this.code, action: msg.t, error: e.message, actor: actorId ?? 'null' });
        this.sendError(actorId, e.code, e.message);
        return;
      }
      this.deps.log.error('game.internal_error', { code: this.code, action: msg.t, error: e instanceof Error ? e.message : String(e) });
      this.sendError(actorId, 'internal', 'Error interno del servidor');
    }
  }

  private apply(msg: C2SMessage, actorId: string | null): void {
    const s = this.state;
    switch (msg.t) {
      case 'hello':
      case 'create':
      case 'join':
        // gestionados por el hub
        return;

      case 'open_config': {
        this.requireHost(actorId);
        this.state = applyEvent(s, { type: 'OPEN_CONFIG' });
        break;
      }
      case 'close_config': {
        this.requireHost(actorId);
        this.state = applyEvent(s, { type: 'CLOSE_CONFIG' });
        break;
      }
      case 'update_settings': {
        this.requireHost(actorId);
        const settings = mergeSettings(s.settings, msg.settings);
        this.state = applyEvent(s, { type: 'UPDATE_SETTINGS', settings });
        this.deps.log.info('game.settings_updated', { code: this.code, categories: settings.categories.length, rounds: settings.rounds, time: settings.timeLimit });
        break;
      }
      case 'start': {
        this.requireHost(actorId);
        this.state = applyEvent(s, { type: 'START' });
        this.deps.log.info('round.started', { code: this.code, round: 1, letter: this.state.round?.letter });
        this.scheduleRoundTimers();
        this.emitEvent('round_started');
        break;
      }
      case 'answer': {
        this.requirePlayer(actorId);
        const category = sanitizeText(msg.category, MAX_CATEGORY_LEN);
        const text = sanitizeText(msg.text, MAX_ANSWER_LEN);
        this.state = applyEvent(s, { type: 'SET_ANSWER', playerId: actorId as string, category, raw: text });
        break;
      }
      case 'vote_letter': {
        this.requirePlayer(actorId);
        this.state = applyEvent(s, { type: 'VOTE_LETTER', playerId: actorId as string });
        this.deps.log.info('round.letter_vote', { code: this.code, round: s.round?.index, votes: s.round?.letterVotes.length, player: actorId });
        break;
      }
      case 'pencil_down': {
        this.requirePlayer(actorId);
        this.state = applyEvent(s, { type: 'PENCIL_DOWN', playerId: actorId as string });
        this.clearTimers();
        this.deps.log.info('round.ended', { code: this.code, round: s.round?.index, by: 'pencil_down', player: actorId });
        this.emitEvent('pencil_down', { playerId: actorId });
        this.beginValidation();
        break;
      }
      case 'dispute': {
        this.requirePlayer(actorId);
        this.state = applyEvent(s, { type: 'DISPUTE', answerId: msg.answerId, byPlayerId: actorId as string });
        break;
      }
      case 'resolve': {
        this.requirePlayer(actorId);
        this.state = applyEvent(s, { type: 'RESOLVE', answerId: msg.answerId, valid: msg.valid, byPlayerId: actorId as string });
        break;
      }
      case 'next_round': {
        this.requirePlayer(actorId);
        this.state = applyEvent(s, { type: 'NEXT_ROUND' });
        if (this.state.phase === 'round_start') {
          this.deps.log.info('round.started', { code: this.code, round: this.state.round?.index, letter: this.state.round?.letter });
          this.scheduleRoundTimers();
          this.emitEvent('round_started');
        } else {
          this.deps.log.info('game.finished', { code: this.code, ranking: this.state.players.map((p) => ({ name: p.name, score: p.score })) });
        }
        break;
      }
      case 'restart': {
        this.requirePlayer(actorId);
        this.state = applyEvent(s, { type: 'RESTART' });
        this.deps.log.info('game.restarted', { code: this.code });
        break;
      }
      case 'leave': {
        this.requirePlayer(actorId);
        this.state = applyEvent(s, { type: 'LEAVE', playerId: actorId as string });
        this.deps.log.info('player.left', { code: this.code, player: actorId, remaining: this.state.players.length });
        if (this.state.players.length === 0) {
          this.destroy();
          this.deps.onGameEmpty();
          return;
        }
        break;
      }
      default: {
        const exhaustive: never = msg;
        throw new EngineError('unknown', `Mensaje desconocido: ${JSON.stringify(exhaustive)}`);
      }
    }
    this.emitState();
  }

  private scheduleRoundTimers(): void {
    const round = this.state.round;
    if (!round) return;
    this.later(round.revealMs, () => {
      if (this.state.phase !== 'round_start') return;
      this.state = applyEvent(this.state, { type: 'PLAYING_START' });
      this.emitState();
      this.later(this.state.settings.timeLimit * 1000, () => {
        if (this.state.phase !== 'playing') return;
        this.state = applyEvent(this.state, { type: 'TIME_UP' });
        this.deps.log.info('round.ended', { code: this.code, round: this.state.round?.index, by: 'timeout' });
        this.emitEvent('round_ended', { by: 'timeout' });
        this.beginValidation();
      });
    });
  }

  private beginValidation(): void {
    const round = this.state.round;
    if (!round) return;
    const total = round.answers.length;
    this.deps.log.info('validation.started', { code: this.code, round: round.index, answers: total });
    this.emitEvent('ai_validating', { total });

    const empty = round.answers.filter((a) => a.raw.trim().length === 0);
    for (const a of empty) {
      this.state = applyEvent(this.state, {
        type: 'SET_ANSWER_STATUS',
        answerId: a.id,
        status: 'invalid',
        confidence: 1,
        reason: 'Respuesta vacía',
        decidedBy: 'system',
      });
    }
    if (empty.length > 0) this.emitState();

    const items = round.answers
      .filter((a) => a.raw.trim().length > 0)
      .map((a) => ({
        id: a.id,
        letter: round.letter,
        category: a.category,
        answer: a.raw.trim(),
        normalized: a.normalized,
        language: this.state.settings.language,
      }));

    this.validation = (async () => {
      const health = await this.deps.validator.checkHealth();
      if (!health.ok) {
        this.deps.log.warn('ai.unavailable', { code: this.code, detail: health.detail ?? 'desconocido' });
        this.state = applyEvent(this.state, {
          type: 'SET_AI_STATUS',
          available: false,
          model: null,
          error: health.detail ?? 'IA local no disponible',
        });
        for (const a of round.answers) {
          if (a.status === 'pending') {
            this.state = applyEvent(this.state, {
              type: 'SET_ANSWER_STATUS',
              answerId: a.id,
              status: 'uncertain',
              confidence: null,
              reason: 'IA no disponible: revisión manual requerida',
              decidedBy: 'system',
            });
          }
        }
        this.emitEvent('ai_unavailable');
        this.finishValidation();
        return;
      }

      this.state = applyEvent(this.state, {
        type: 'SET_AI_STATUS',
        available: true,
        model: this.deps.validator.modelName,
        error: null,
      });

      const threshold = this.deps.validator.threshold;
      await this.deps.validator.validateMany(items, (r) => {
        let status: AnswerStatus;
        if (!r.ok) {
          status = 'uncertain';
        } else if (r.outcome && r.outcome.confidence >= threshold) {
          status = r.outcome.valid ? 'valid' : 'invalid';
        } else {
          status = 'uncertain';
        }
        this.state = applyEvent(this.state, {
          type: 'SET_ANSWER_STATUS',
          answerId: r.id,
          status,
          confidence: r.outcome ? r.outcome.confidence : null,
          reason: r.ok && r.outcome ? r.outcome.reason : `Error de validación: ${r.error ?? 'desconocido'}`,
          decidedBy: 'ai',
        });
        this.emitState();
      });

      this.deps.log.info('validation.finished', { code: this.code, round: round.index });
      this.finishValidation();
    })();
  }

  private finishValidation(): void {
    if (this.state.phase !== 'validating') return;
    this.state = applyEvent(this.state, { type: 'SCORE_ROUND' });
    this.emitEvent('ai_done');
    this.emitState();
  }

  /** Espera a que termine la validación de IA en curso (si la hay). */
  async waitForValidation(): Promise<void> {
    await this.validation;
  }
}

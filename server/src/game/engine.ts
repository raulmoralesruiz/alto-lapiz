import type {
  AnswerStatus,
  GameState,
  GameSettings,
  Language,
} from '../../../shared/src/types.ts';
import {
  LANGUAGES,
  MAX_CATEGORIES,
  MAX_CATEGORY_LEN,
  MAX_ROUNDS,
  MAX_TIME_LIMIT,
  MIN_CATEGORIES,
  MIN_TIME_LIMIT,
} from '../../../shared/src/types.ts';
import { newGameCode, newId } from '../util/id.ts';
import { randomLetter } from './letters.ts';
import { normalizeAnswer } from './normalize.ts';
import { computeRoundPoints } from './scoring.ts';

export class EngineError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'EngineError';
  }
}

export type GameEvent =
  | { type: 'JOIN'; playerId: string; name: string }
  | { type: 'LEAVE'; playerId: string }
  | { type: 'DISCONNECT'; playerId: string }
  | { type: 'RECONNECT'; playerId: string }
  | { type: 'OPEN_CONFIG' }
  | { type: 'CLOSE_CONFIG' }
  | { type: 'UPDATE_SETTINGS'; settings: GameSettings }
  | { type: 'START' }
  | { type: 'PLAYING_START' }
  | { type: 'SET_ANSWER'; playerId: string; category: string; raw: string }
  | { type: 'PENCIL_DOWN'; playerId: string }
  | { type: 'TIME_UP' }
  | {
      type: 'SET_ANSWER_STATUS';
      answerId: string;
      status: AnswerStatus;
      confidence: number | null;
      reason: string | null;
      decidedBy: 'ai' | 'player' | 'system';
    }
  | { type: 'SCORE_ROUND' }
  | { type: 'DISPUTE'; answerId: string; byPlayerId: string }
  | { type: 'RESOLVE'; answerId: string; valid: boolean; byPlayerId: string }
  | { type: 'NEXT_ROUND' }
  | { type: 'RESTART' }
  | { type: 'SET_AI_STATUS'; available: boolean | null; model: string | null; error: string | null };

export function validateSettings(settings: GameSettings): void {
  if (!Array.isArray(settings.categories)) throw new EngineError('settings', 'Categorías inválidas');
  if (settings.categories.length < MIN_CATEGORIES || settings.categories.length > MAX_CATEGORIES) {
    throw new EngineError('settings', `Se requieren entre ${MIN_CATEGORIES} y ${MAX_CATEGORIES} categorías`);
  }
  const seen = new Set<string>();
  for (const c of settings.categories) {
    if (typeof c !== 'string' || c.trim().length === 0) throw new EngineError('settings', 'Hay categorías vacías');
    if (c.length > MAX_CATEGORY_LEN) throw new EngineError('settings', 'Alguna categoría es demasiado larga');
    const k = c.trim().toLowerCase();
    if (seen.has(k)) throw new EngineError('settings', 'Hay categorías duplicadas');
    seen.add(k);
  }
  if (!Number.isInteger(settings.rounds) || settings.rounds < 1 || settings.rounds > MAX_ROUNDS) {
    throw new EngineError('settings', `Las rondas deben ser un entero entre 1 y ${MAX_ROUNDS}`);
  }
  if (!Number.isInteger(settings.timeLimit) || settings.timeLimit < MIN_TIME_LIMIT || settings.timeLimit > MAX_TIME_LIMIT) {
    throw new EngineError('settings', `El tiempo debe ser un entero entre ${MIN_TIME_LIMIT} y ${MAX_TIME_LIMIT} segundos`);
  }
  if (!(LANGUAGES as readonly string[]).includes(settings.language)) {
    throw new EngineError('settings', `Idioma no soportado: ${String(settings.language)}`);
  }
  if (!Number.isInteger(settings.pointsUnique) || settings.pointsUnique < 0 || settings.pointsUnique > 100) {
    throw new EngineError('settings', 'pointsUnique debe ser un entero entre 0 y 100');
  }
  if (!Number.isInteger(settings.pointsShared) || settings.pointsShared < 0 || settings.pointsShared > 100) {
    throw new EngineError('settings', 'pointsShared debe ser un entero entre 0 y 100');
  }
}

export function mergeSettings(current: GameSettings, partial: Partial<GameSettings>): GameSettings {
  const next: GameSettings = {
    categories: partial.categories ? [...partial.categories] : [...current.categories],
    rounds: partial.rounds ?? current.rounds,
    timeLimit: partial.timeLimit ?? current.timeLimit,
    language: (partial.language ?? current.language) as Language,
    pointsUnique: partial.pointsUnique ?? current.pointsUnique,
    pointsShared: partial.pointsShared ?? current.pointsShared,
  };
  validateSettings(next);
  return next;
}

export function createGame(hostName: string, settings: GameSettings): GameState {
  validateSettings(settings);
  const now = Date.now();
  return {
    code: newGameCode(),
    phase: 'lobby',
    settings: { ...settings, categories: [...settings.categories] },
    players: [{ id: newId(), name: hostName, isHost: true, connected: true, score: 0 }],
    round: null,
    createdAt: now,
    updatedAt: now,
    aiStatus: { available: null, model: null, error: null },
  };
}

function findPlayer(s: GameState, playerId: string) {
  return s.players.find((p) => p.id === playerId);
}

function findAnswer(s: GameState, answerId: string) {
  return s.round?.answers.find((a) => a.id === answerId);
}

export function getRevealMs(): number {
  const raw = process.env.ROUND_REVEAL_MS;
  if (raw !== undefined) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.trunc(n);
  }
  return 4000;
}

function startRound(s: GameState, index: number): void {
  const now = Date.now();
  const revealMs = getRevealMs();
  s.phase = 'round_start';
  s.round = {
    index,
    letter: randomLetter(s.round?.letter),
    startedAt: now,
    endsAt: now + revealMs + s.settings.timeLimit * 1000,
    revealMs,
    endedBy: null,
    endedByPlayerId: null,
    answers: [],
  };
}

function recomputeRoundPoints(s: GameState): void {
  if (!s.round) return;
  const points = computeRoundPoints(s.round.answers, s.settings);
  const deltas = new Map<string, number>();
  for (const a of s.round.answers) {
    const newPts = points.get(a.id) ?? 0;
    const delta = newPts - a.points;
    if (delta !== 0) {
      deltas.set(a.playerId, (deltas.get(a.playerId) ?? 0) + delta);
      a.points = newPts;
    }
  }
  for (const p of s.players) {
    const d = deltas.get(p.id);
    if (d !== undefined) p.score += d;
  }
}

function transferHostIfLobby(s: GameState, fromPlayerId: string): void {
  if (s.phase !== 'lobby' && s.phase !== 'configuring') return;
  const host = s.players.find((p) => p.isHost);
  if (host && host.id === fromPlayerId) {
    host.isHost = false;
    const next = s.players.find((p) => p.connected) ?? s.players[0];
    if (next) next.isHost = true;
  }
}

/**
 * Aplica un evento al estado. Función pura: devuelve un estado nuevo
 * sin mutar el original. Lanza EngineError si la transición no es válida.
 */
export function applyEvent(state: GameState, event: GameEvent): GameState {
  const s = structuredClone(state);
  switch (event.type) {
    case 'JOIN': {
      if (s.phase !== 'lobby') throw new EngineError('phase', 'Solo se puede unirse en el lobby');
      if (s.players.some((p) => p.id === event.playerId)) throw new EngineError('exists', 'El jugador ya está en la partida');
      if (s.players.length >= 8) throw new EngineError('full', 'La partida está llena (máximo 8 jugadores)');
      s.players.push({ id: event.playerId, name: event.name, isHost: false, connected: true, score: 0 });
      break;
    }
    case 'LEAVE': {
      const idx = s.players.findIndex((p) => p.id === event.playerId);
      if (idx === -1) throw new EngineError('not_found', 'Jugador no encontrado');
      const wasHost = s.players[idx]?.isHost ?? false;
      s.players.splice(idx, 1);
      const first = s.players[0];
      if (wasHost && first) first.isHost = true;
      break;
    }
    case 'DISCONNECT': {
      const p = findPlayer(s, event.playerId);
      if (!p) throw new EngineError('not_found', 'Jugador no encontrado');
      p.connected = false;
      transferHostIfLobby(s, event.playerId);
      break;
    }
    case 'RECONNECT': {
      const p = findPlayer(s, event.playerId);
      if (!p) throw new EngineError('not_found', 'Jugador no encontrado');
      p.connected = true;
      break;
    }
    case 'OPEN_CONFIG': {
      if (s.phase !== 'lobby') throw new EngineError('phase', 'Solo se puede configurar desde el lobby');
      s.phase = 'configuring';
      break;
    }
    case 'CLOSE_CONFIG': {
      if (s.phase !== 'configuring') throw new EngineError('phase', 'No se está configurando');
      s.phase = 'lobby';
      break;
    }
    case 'UPDATE_SETTINGS': {
      if (s.phase !== 'lobby' && s.phase !== 'configuring') {
        throw new EngineError('phase', 'La configuración solo se puede cambiar antes de empezar');
      }
      validateSettings(event.settings);
      s.settings = { ...event.settings, categories: [...event.settings.categories] };
      break;
    }
    case 'START': {
      if (s.phase !== 'configuring') throw new EngineError('phase', 'Primero abre la configuración');
      if (s.players.length < 1) throw new EngineError('players', 'Faltan jugadores');
      startRound(s, 1);
      break;
    }
    case 'PLAYING_START': {
      if (s.phase !== 'round_start' || !s.round) throw new EngineError('phase', 'No hay ronda en preparación');
      s.phase = 'playing';
      break;
    }
    case 'SET_ANSWER': {
      if (s.phase !== 'playing' || !s.round) throw new EngineError('phase', 'La ronda no está en juego');
      const player = findPlayer(s, event.playerId);
      if (!player) throw new EngineError('not_found', 'Jugador no encontrado');
      if (!s.settings.categories.some((c) => c.trim().toLowerCase() === event.category.trim().toLowerCase())) {
        throw new EngineError('category', 'Categoría no válida para esta partida');
      }
      const raw = event.raw.trim().slice(0, 60);
      const normalized = normalizeAnswer(raw);
      const existing = s.round.answers.find((a) => a.playerId === event.playerId && a.category === event.category);
      if (existing) {
        existing.raw = raw;
        existing.normalized = normalized;
        existing.status = 'pending';
        existing.confidence = null;
        existing.reason = null;
        existing.decidedBy = null;
        existing.points = 0;
      } else {
        s.round.answers.push({
          id: newId(),
          playerId: event.playerId,
          category: event.category,
          raw,
          normalized,
          status: 'pending',
          confidence: null,
          reason: null,
          decidedBy: null,
          points: 0,
        });
      }
      break;
    }
    case 'PENCIL_DOWN': {
      if (s.phase !== 'playing' || !s.round) throw new EngineError('phase', 'La ronda no está en juego');
      const player = findPlayer(s, event.playerId);
      if (!player) throw new EngineError('not_found', 'Jugador no encontrado');
      s.phase = 'validating';
      s.round.endedBy = 'pencil_down';
      s.round.endedByPlayerId = event.playerId;
      break;
    }
    case 'TIME_UP': {
      if (s.phase !== 'playing' && s.phase !== 'round_start') throw new EngineError('phase', 'La ronda no está en juego');
      if (!s.round) throw new EngineError('phase', 'No hay ronda activa');
      s.phase = 'validating';
      s.round.endedBy = 'timeout';
      s.round.endedByPlayerId = null;
      break;
    }
    case 'SET_ANSWER_STATUS': {
      if (s.phase !== 'validating') throw new EngineError('phase', 'La ronda no está en validación');
      const a = findAnswer(s, event.answerId);
      if (!a) throw new EngineError('not_found', 'Respuesta no encontrada');
      a.status = event.status;
      a.confidence = event.confidence;
      a.reason = event.reason;
      a.decidedBy = event.decidedBy;
      break;
    }
    case 'SCORE_ROUND': {
      if (s.phase !== 'validating' || !s.round) throw new EngineError('phase', 'No hay ronda que puntuar');
      if (s.round.answers.some((a) => a.status === 'pending')) {
        throw new EngineError('pending', 'Quedan respuestas sin validar');
      }
      recomputeRoundPoints(s);
      s.phase = 'results';
      break;
    }
    case 'DISPUTE': {
      if (s.phase !== 'results' || !s.round) throw new EngineError('phase', 'Solo se puede disputar en resultados');
      const a = findAnswer(s, event.answerId);
      if (!a) throw new EngineError('not_found', 'Respuesta no encontrada');
      if (a.status === 'disputed') throw new EngineError('state', 'Esta respuesta ya está en disputa');
      const player = findPlayer(s, event.byPlayerId);
      if (!player) throw new EngineError('not_found', 'Jugador no encontrado');
      const owner = findPlayer(s, a.playerId);
      const oldPoints = a.points;
      a.status = 'disputed';
      a.points = 0;
      if (owner) owner.score -= oldPoints;
      break;
    }
    case 'RESOLVE': {
      if (s.phase !== 'results' || !s.round) throw new EngineError('phase', 'Solo se puede resolver en resultados');
      const a = findAnswer(s, event.answerId);
      if (!a) throw new EngineError('not_found', 'Respuesta no encontrada');
      if (a.status !== 'disputed') throw new EngineError('state', 'Solo se puede resolver una respuesta en disputa');
      const resolver = findPlayer(s, event.byPlayerId);
      if (!resolver) throw new EngineError('not_found', 'Jugador no encontrado');
      a.status = event.valid ? 'valid' : 'invalid';
      a.decidedBy = 'player';
      a.reason = `${resolver.name} decidió esta respuesta`;
      recomputeRoundPoints(s);
      break;
    }
    case 'NEXT_ROUND': {
      if (s.phase !== 'results' || !s.round) throw new EngineError('phase', 'Solo se puede avanzar desde resultados');
      if (s.round.index >= s.settings.rounds) {
        s.phase = 'finished';
      } else {
        startRound(s, s.round.index + 1);
      }
      break;
    }
    case 'RESTART': {
      if (s.phase !== 'finished') throw new EngineError('phase', 'La partida no ha terminado');
      s.phase = 'lobby';
      s.round = null;
      for (const p of s.players) p.score = 0;
      break;
    }
    case 'SET_AI_STATUS': {
      s.aiStatus = { available: event.available, model: event.model, error: event.error };
      break;
    }
    default: {
      const exhaustive: never = event;
      throw new EngineError('unknown', `Evento desconocido: ${JSON.stringify(exhaustive)}`);
    }
  }
  s.updatedAt = Date.now();
  return s;
}

/**
 * Tipos compartidos entre cliente y servidor.
 * Este módulo NO debe tener dependencias: es el contrato del protocolo.
 */

export const LANGUAGES = ['es', 'en', 'fr', 'ca'] as const;
export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_NAMES: Record<Language, string> = {
  es: 'español',
  en: 'inglés',
  fr: 'francés',
  ca: 'catalán',
};

export const DEFAULT_CATEGORIES: Record<Language, string[]> = {
  es: ['Nombre', 'Apellido', 'Ciudad', 'País', 'Animal', 'Comida', 'Fruta', 'Profesión', 'Objeto', 'Marca'],
  en: ['First name', 'Last name', 'City', 'Country', 'Animal', 'Food', 'Fruit', 'Profession', 'Object', 'Brand'],
  fr: ['Prénom', 'Nom', 'Ville', 'Pays', 'Animal', 'Nourriture', 'Fruit', 'Profession', 'Objet', 'Marque'],
  ca: ['Nom', 'Cognom', 'Ciutat', 'País', 'Animal', 'Menjar', 'Fruita', 'Professió', 'Objecte', 'Marca'],
};

export interface GameSettings {
  categories: string[];
  rounds: number;
  timeLimit: number; // segundos
  language: Language;
  pointsUnique: number;
  pointsShared: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  categories: DEFAULT_CATEGORIES.es,
  rounds: 3,
  timeLimit: 60,
  language: 'es',
  pointsUnique: 10,
  pointsShared: 5,
};

export type Phase =
  | 'lobby'
  | 'configuring'
  | 'round_start'
  | 'playing'
  | 'validating'
  | 'results'
  | 'finished';

export type AnswerStatus = 'pending' | 'valid' | 'invalid' | 'uncertain' | 'disputed';
export type DecidedBy = 'ai' | 'player' | 'system';

export interface AnswerState {
  id: string;
  playerId: string;
  category: string;
  raw: string;
  normalized: string;
  status: AnswerStatus;
  confidence: number | null;
  reason: string | null;
  decidedBy: DecidedBy | null;
  points: number;
}

export interface PlayerState {
  id: string;
  name: string;
  isHost: boolean;
  connected: boolean;
  score: number;
}

export interface RoundState {
  index: number;
  letter: string;
  startedAt: number;
  endsAt: number;
  revealMs: number;
  endedBy: 'pencil_down' | 'timeout' | null;
  endedByPlayerId: string | null;
  answers: AnswerState[];
}

export interface AiStatus {
  available: boolean | null;
  model: string | null;
  error: string | null;
}

export interface GameState {
  code: string;
  phase: Phase;
  settings: GameSettings;
  players: PlayerState[];
  round: RoundState | null;
  createdAt: number;
  updatedAt: number;
  aiStatus: AiStatus;
}

/* ----------------------------- Protocolo WS ----------------------------- */

export type C2SMessage =
  | { t: 'hello'; code: string; playerId: string; name: string }
  | { t: 'create'; name: string; settings: Partial<GameSettings> }
  | { t: 'join'; code: string; name: string }
  | { t: 'open_config' }
  | { t: 'close_config' }
  | { t: 'update_settings'; settings: Partial<GameSettings> }
  | { t: 'start' }
  | { t: 'answer'; category: string; text: string }
  | { t: 'pencil_down' }
  | { t: 'dispute'; answerId: string }
  | { t: 'resolve'; answerId: string; valid: boolean }
  | { t: 'next_round' }
  | { t: 'restart' }
  | { t: 'leave' };

export type S2CMessage =
  | { t: 'joined'; playerId: string; game: GameState; serverNow: number }
  | { t: 'state'; game: GameState; serverNow: number }
  | { t: 'event'; kind: 'pencil_down' | 'round_started' | 'round_ended' | 'ai_validating' | 'ai_done' | 'ai_unavailable'; payload?: Record<string, unknown> }
  | { t: 'ai_status'; status: AiStatus }
  | { t: 'error'; code: string; message: string };

export const MAX_NAME_LEN = 24;
export const MAX_ANSWER_LEN = 40;
export const MAX_CATEGORY_LEN = 30;
export const MAX_CATEGORIES = 10;
export const MIN_CATEGORIES = 3;
export const MAX_ROUNDS = 10;
export const MAX_TIME_LIMIT = 300;
export const MIN_TIME_LIMIT = 15;

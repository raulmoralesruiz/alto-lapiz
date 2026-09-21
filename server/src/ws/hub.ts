import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import type { C2SMessage, GameSettings, S2CMessage } from '../../../shared/src/types.ts';
import {
  LANGUAGES,
  MAX_ANSWER_LEN,
  MAX_CATEGORIES,
  MAX_CATEGORY_LEN,
  MAX_NAME_LEN,
  MAX_ROUNDS,
  MAX_TIME_LIMIT,
  MIN_CATEGORIES,
  MIN_TIME_LIMIT,
} from '../../../shared/src/types.ts';
import type { AIValidator } from '../ai/validator.ts';
import type { Logger } from '../log.ts';
import { newId } from '../util/id.ts';
import { sanitizeText } from '../util/sanitize.ts';
import { RateLimiter } from '../util/ratelimit.ts';
import { createGame, EngineError, mergeSettings } from '../game/engine.ts';
import { DEFAULT_SETTINGS } from '../../../shared/src/types.ts';
import { GameService } from '../game/service.ts';

interface ClientCtx {
  ws: WebSocket;
  playerId: string | null;
  gameCode: string | null;
  name: string;
  remoteAddress: string;
}

const CODE_RE = /^[A-Z0-9]{4,8}$/;

const settingsSchema = z.object({
  categories: z.array(z.string().min(1).max(MAX_CATEGORY_LEN)).min(MIN_CATEGORIES).max(MAX_CATEGORIES),
  rounds: z.number().int().min(1).max(MAX_ROUNDS),
  timeLimit: z.number().int().min(MIN_TIME_LIMIT).max(MAX_TIME_LIMIT),
  language: z.enum(LANGUAGES),
  pointsUnique: z.number().int().min(0).max(100),
  pointsShared: z.number().int().min(0).max(100),
});

const messageSchemas: Record<string, z.ZodType> = {
  hello: z.object({
    t: z.literal('hello'),
    code: z.string().regex(CODE_RE),
    playerId: z.string().min(1).max(64),
    name: z.string().min(1).max(MAX_NAME_LEN),
  }),
  create: z.object({
    t: z.literal('create'),
    name: z.string().min(1).max(MAX_NAME_LEN),
    settings: settingsSchema.partial().optional(),
  }),
  join: z.object({
    t: z.literal('join'),
    code: z.string().regex(CODE_RE),
    name: z.string().min(1).max(MAX_NAME_LEN),
  }),
  open_config: z.object({ t: z.literal('open_config') }),
  close_config: z.object({ t: z.literal('close_config') }),
  update_settings: z.object({
    t: z.literal('update_settings'),
    settings: settingsSchema.partial().refine((s) => Object.keys(s).length > 0, 'settings vacías'),
  }),
  start: z.object({ t: z.literal('start') }),
  answer: z.object({
    t: z.literal('answer'),
    category: z.string().min(1).max(MAX_CATEGORY_LEN),
    text: z.string().max(MAX_ANSWER_LEN),
  }),
  pencil_down: z.object({ t: z.literal('pencil_down') }),
  dispute: z.object({ t: z.literal('dispute'), answerId: z.string().min(1).max(64) }),
  resolve: z.object({ t: z.literal('resolve'), answerId: z.string().min(1).max(64), valid: z.boolean() }),
  next_round: z.object({ t: z.literal('next_round') }),
  restart: z.object({ t: z.literal('restart') }),
  leave: z.object({ t: z.literal('leave') }),
};

export interface HubOptions {
  validator: AIValidator;
  log: Logger;
  allowedOrigins: string[] | null;
}

/**
 * Gestiona conexiones WebSocket, enrutamiento de mensajes hacia las
 * partidas y validación estricta de todos los inputs del cliente.
 */
export class Hub {
  private wss: WebSocketServer;
  private games = new Map<string, GameService>();
  private clients = new Map<WebSocket, ClientCtx>();
  private validator: AIValidator;
  private log: Logger;
  private allowedOrigins: string[] | null;
  private joinLimiter = new RateLimiter(20, 60_000);
  private actionLimiter = new RateLimiter(150, 60_000);

  constructor(opts: HubOptions) {
    this.wss = new WebSocketServer({ noServer: true });
    this.validator = opts.validator;
    this.log = opts.log;
    this.allowedOrigins = opts.allowedOrigins;
  }

  get gameCount(): number {
    return this.games.size;
  }

  handleUpgrade(req: import('node:http').IncomingMessage, socket: import('node:stream').Duplex, head: Buffer): void {
    const origin = req.headers.origin;
    if (this.allowedOrigins && typeof origin === 'string' && !this.allowedOrigins.includes(origin)) {
      this.log.warn('ws.origin_rejected', { origin });
      socket.destroy();
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => this.onOpen(ws, req.socket.remoteAddress ?? 'unknown'));
  }

  private onOpen(ws: WebSocket, remoteAddress: string): void {
    const ctx: ClientCtx = { ws, playerId: null, gameCode: null, name: '', remoteAddress };
    this.clients.set(ws, ctx);
    ws.on('message', (data) => this.onMessage(ctx, data));
    ws.on('close', () => this.onClose(ctx));
    ws.on('error', () => {
      /* el cierre se gestiona en onClose */
    });
    this.log.debug('ws.connected', { total: this.clients.size });
  }

  private onClose(ctx: ClientCtx): void {
    this.clients.delete(ctx.ws);
    if (ctx.gameCode && ctx.playerId) {
      const game = this.games.get(ctx.gameCode);
      if (game) {
        game.disconnect(ctx.playerId);
        this.log.info('player.disconnected', { code: ctx.gameCode, player: ctx.playerId });
      }
    }
    ctx.gameCode = null;
    ctx.playerId = null;
    this.log.debug('ws.disconnected', { total: this.clients.size });
  }

  private send(ws: WebSocket, msg: S2CMessage): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  private sendError(ctx: ClientCtx, code: string, message: string): void {
    this.send(ctx.ws, { t: 'error', code, message });
  }

  private ctxKey(ctx: ClientCtx): string {
    return ctx.remoteAddress;
  }

  private onMessage(ctx: ClientCtx, data: unknown): void {
    let msg: unknown;
    try {
      msg = JSON.parse(String(data));
    } catch {
      this.sendError(ctx, 'bad_json', 'Mensaje no válido');
      return;
    }
    const type = (msg as { t?: unknown })?.t;
    if (typeof type !== 'string') {
      this.sendError(ctx, 'bad_msg', 'Mensaje no válido');
      return;
    }
    const schema = messageSchemas[type];
    if (!schema) {
      this.sendError(ctx, 'unknown', 'Mensaje desconocido');
      return;
    }
    const parsed = schema.safeParse(msg);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      this.sendError(ctx, 'invalid', first ? `${first.path.join('.')}: ${first.message}` : 'Campos no válidos');
      return;
    }
    if (!this.actionLimiter.allow(this.ctxKey(ctx))) {
      this.sendError(ctx, 'rate_limited', 'Demasiadas peticiones, espera un momento');
      return;
    }
    try {
      this.route(ctx, parsed.data as C2SMessage);
    } catch (e) {
      if (e instanceof EngineError) {
        this.sendError(ctx, e.code, e.message);
      } else {
        this.log.error('ws.internal_error', { error: e instanceof Error ? e.message : String(e) });
        this.sendError(ctx, 'internal', 'Error interno del servidor');
      }
    }
  }

  private route(ctx: ClientCtx, msg: C2SMessage): void {
    switch (msg.t) {
      case 'create': {
        if (ctx.gameCode) {
          this.sendError(ctx, 'in_game', 'Ya estás en una partida. Sal de ella primero');
          return;
        }
        if (!this.joinLimiter.allow(this.ctxKey(ctx))) {
          this.sendError(ctx, 'rate_limited', 'Demasiadas peticiones, espera un momento');
          return;
        }
        const name = sanitizeText(msg.name, MAX_NAME_LEN) || 'Jugador';
        const settings: GameSettings = mergeSettings(DEFAULT_SETTINGS, msg.settings ?? {});
        const state = createGame(name, settings);
        const hostId = state.players[0]?.id ?? '';
        const game = this.createGameService(state);
        ctx.gameCode = state.code;
        ctx.playerId = hostId;
        ctx.name = name;
        this.log.info('game.created', { code: state.code, host: name, players: 1 });
        this.send(ctx.ws, { t: 'joined', playerId: hostId, game: state, serverNow: Date.now() });
        return;
      }
      case 'join': {
        if (ctx.gameCode) {
          this.sendError(ctx, 'in_game', 'Ya estás en una partida. Sal de ella primero');
          return;
        }
        if (!this.joinLimiter.allow(this.ctxKey(ctx))) {
          this.sendError(ctx, 'rate_limited', 'Demasiadas peticiones, espera un momento');
          return;
        }
        const code = msg.code.toUpperCase();
        const game = this.games.get(code);
        if (!game) {
          this.sendError(ctx, 'not_found', 'No existe esa partida. Revisa el código');
          return;
        }
        const name = sanitizeText(msg.name, MAX_NAME_LEN) || 'Jugador';
        const playerId = newId();
        ctx.gameCode = code;
        ctx.playerId = playerId;
        ctx.name = name;
        const joined = game.joinPlayer(playerId, name);
        if (!joined) {
          ctx.gameCode = null;
          ctx.playerId = null;
          ctx.name = '';
        }
        return;
      }
      case 'hello': {
        const code = msg.code.toUpperCase();
        const game = this.games.get(code);
        if (!game || !game.state.players.some((p) => p.id === msg.playerId)) {
          this.sendError(ctx, 'not_found', 'Partida no encontrada o sesión caducada');
          return;
        }
        ctx.gameCode = code;
        ctx.playerId = msg.playerId;
        ctx.name = msg.name;
        game.reconnect(msg.playerId);
        this.send(ctx.ws, { t: 'joined', playerId: msg.playerId, game: game.state, serverNow: Date.now() });
        return;
      }
      case 'leave': {
        const code = ctx.gameCode;
        const playerId = ctx.playerId;
        ctx.gameCode = null;
        ctx.playerId = null;
        ctx.name = '';
        if (code && playerId) {
          const game = this.games.get(code);
          if (game) game.handleClientEvent({ t: 'leave' }, playerId);
          this.log.info('player.left', { code, player: playerId });
        }
        return;
      }
      default: {
        if (!ctx.gameCode) {
          this.sendError(ctx, 'not_joined', 'Primero crea o únete a una partida');
          return;
        }
        const game = this.games.get(ctx.gameCode);
        if (!game) {
          this.sendError(ctx, 'not_found', 'Partida no encontrada');
          return;
        }
        game.handleClientEvent(msg, ctx.playerId);
      }
    }
  }

  private createGameService(state: ReturnType<typeof createGame>): GameService {
    const game = new GameService(state, {
      validator: this.validator,
      log: this.log,
      broadcast: (m) => this.broadcastToGame(state.code, m),
      sendTo: (playerId, m) => this.sendToPlayer(state.code, playerId, m),
      onGameEmpty: () => {
        this.games.delete(state.code);
        this.log.info('game.removed', { code: state.code });
      },
    });
    this.games.set(state.code, game);
    return game;
  }

  private broadcastToGame(code: string, msg: S2CMessage): void {
    const game = this.games.get(code);
    if (!game) return;
    for (const [ws, ctx] of this.clients) {
      if (ctx.gameCode === code && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    }
    void game;
  }

  private sendToPlayer(code: string, playerId: string, msg: S2CMessage): void {
    for (const [ws, ctx] of this.clients) {
      if (ctx.gameCode === code && ctx.playerId === playerId && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
        return;
      }
    }
  }
}

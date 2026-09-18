import type { C2SMessage, S2CMessage } from './types.ts';

export interface SocketHandlers {
  onJoined?: (playerId: string, game: import('./types.ts').GameState, serverNow: number) => void;
  onState?: (game: import('./types.ts').GameState, serverNow: number) => void;
  onEvent?: (kind: string, payload?: Record<string, unknown>) => void;
  onAiStatus?: (status: import('./types.ts').AiStatus) => void;
  onError?: (code: string, message: string) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

function wsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

/**
 * Cliente WebSocket fino: conecta, envía mensajes C2S y emite los S2C
 * recibidos a través de callbacks. No gestiona el estado de la partida.
 */
export class GameSocket {
  private ws: WebSocket | null = null;
  private handlers: SocketHandlers = {};
  private url: string;
  private closedByUser = false;

  constructor(url: string = wsUrl()) {
    this.url = url;
  }

  setHandlers(h: SocketHandlers): void {
    this.handlers = h;
  }

  get isOpen(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.closedByUser = false;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => this.handlers.onOpen?.();
    ws.onclose = () => {
      this.ws = null;
      if (!this.closedByUser) this.handlers.onClose?.();
    };
    ws.onerror = () => {
      /* el cierre se notifica en onclose */
    };
    ws.onmessage = (e) => {
      let msg: S2CMessage;
      try {
        msg = JSON.parse(String(e.data)) as S2CMessage;
      } catch {
        return;
      }
      this.dispatch(msg);
    };
  }

  private dispatch(msg: S2CMessage): void {
    switch (msg.t) {
      case 'joined':
        this.handlers.onJoined?.(msg.playerId, msg.game, msg.serverNow);
        break;
      case 'state':
        this.handlers.onState?.(msg.game, msg.serverNow);
        break;
      case 'event':
        this.handlers.onEvent?.(msg.kind, msg.payload);
        break;
      case 'ai_status':
        this.handlers.onAiStatus?.(msg.status);
        break;
      case 'error':
        this.handlers.onError?.(msg.code, msg.message);
        break;
      default:
        break;
    }
  }

  send(msg: C2SMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  close(): void {
    this.closedByUser = true;
    this.ws?.close();
    this.ws = null;
  }
}

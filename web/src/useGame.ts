import { useCallback, useEffect, useRef, useState } from 'react';
import { GameSocket } from './ws.ts';
import type { AiStatus, C2SMessage, GameSettings, GameState } from './types.ts';

const SESSION_KEY = 'alto-lapiz:session';
const MAX_RECONNECT = 5;

interface Session {
  code: string;
  playerId: string;
  name: string;
}

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (s && typeof s.code === 'string' && typeof s.playerId === 'string' && typeof s.name === 'string') return s;
    return null;
  } catch {
    return null;
  }
}

function saveSession(s: Session): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* almacenamiento no disponible */
  }
}

function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}

export interface GameApi {
  game: GameState | null;
  playerId: string | null;
  connected: boolean;
  error: string | null;
  aiStatus: AiStatus | null;
  skewMs: number;
  create: (name: string, settings?: Partial<GameSettings>) => void;
  join: (code: string, name: string) => void;
  send: (msg: C2SMessage) => void;
  leave: () => void;
  clearError: () => void;
}

export function useGame(): GameApi {
  const [game, setGame] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [skewMs, setSkewMs] = useState(0);

  const socketRef = useRef<GameSocket | null>(null);
  const sessionRef = useRef<Session | null>(loadSession());
  const pendingNameRef = useRef<string | null>(null);
  const pendingHelloRef = useRef(false);
  const attemptsRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  const applyGame = useCallback((g: GameState, serverNow: number) => {
    setGame(g);
    setAiStatus(g.aiStatus ?? null);
    setSkewMs(serverNow - Date.now());
  }, []);

  const resetToHome = useCallback(() => {
    clearSession();
    sessionRef.current = null;
    pendingHelloRef.current = false;
    setGame(null);
    setPlayerId(null);
    setError(null);
  }, []);

  const refreshAiStatus = useCallback(() => {
    fetch('/api/ai/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setAiStatus({ available: !!d.available, model: d.provider ?? d.model ?? null, error: d.error ?? null });
      })
      .catch(() => {
        /* sin estado IA disponible */
      });
  }, []);

  useEffect(() => {
    const socket = new GameSocket();
    socketRef.current = socket;

    const sendHello = () => {
      const s = sessionRef.current;
      if (s) {
        pendingHelloRef.current = true;
        socket.send({ t: 'hello', code: s.code, playerId: s.playerId, name: s.name });
      }
    };

    socket.setHandlers({
      onOpen: () => {
        setConnected(true);
        sendHello();
      },
      onClose: () => {
        setConnected(false);
        const s = sessionRef.current;
        if (s && attemptsRef.current < MAX_RECONNECT) {
          attemptsRef.current += 1;
          const delay = Math.min(1000 * 2 ** attemptsRef.current, 8000);
          if (timerRef.current !== null) window.clearTimeout(timerRef.current);
          timerRef.current = window.setTimeout(() => socket.connect(), delay);
        }
      },
      onJoined: (pid, g, serverNow) => {
        attemptsRef.current = 0;
        pendingHelloRef.current = false;
        setPlayerId(pid);
        applyGame(g, serverNow);
        const name = pendingNameRef.current ?? g.players.find((p) => p.id === pid)?.name ?? 'Jugador';
        pendingNameRef.current = null;
        const session = { code: g.code, playerId: pid, name };
        sessionRef.current = session;
        saveSession(session);
        setError(null);
        void refreshAiStatus();
      },
      onState: (g, serverNow) => applyGame(g, serverNow),
      onAiStatus: (status) => setAiStatus(status),
      onError: (code, message) => {
        if (pendingHelloRef.current && (code === 'not_found' || code === 'bad_msg')) {
          resetToHome();
          return;
        }
        setError(message);
      },
    });

    socket.connect();
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      socket.close();
      socketRef.current = null;
    };
  }, [applyGame, resetToHome, refreshAiStatus]);

  const send = useCallback((msg: C2SMessage) => {
    socketRef.current?.send(msg);
  }, []);

  const create = useCallback((name: string, settings?: Partial<GameSettings>) => {
    setError(null);
    pendingNameRef.current = name;
    socketRef.current?.send({ t: 'create', name, settings: settings ?? {} });
  }, []);

  const join = useCallback((code: string, name: string) => {
    setError(null);
    pendingNameRef.current = name;
    socketRef.current?.send({ t: 'join', code: code.toUpperCase(), name });
  }, []);

  const leave = useCallback(() => {
    socketRef.current?.send({ t: 'leave' });
    resetToHome();
  }, [resetToHome]);

  const clearError = useCallback(() => setError(null), []);

  return { game, playerId, connected, error, aiStatus, skewMs, create, join, send, leave, clearError };
}

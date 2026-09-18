import type { AIOutcome, AIProvider, AIValidationRequest, ProviderHealth, ValidateContext } from '../src/ai/provider.ts';
import type { Logger } from '../src/log.ts';
import { parseAIResponse } from '../src/ai/schema.ts';

export const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/** Clave de respuesta sin letra (la letra es aleatoria por ronda en las pruebas). */
export function reqKey(req: AIValidationRequest): string {
  return `${req.category}|${req.answer.trim().toLowerCase()}`;
}

export interface FakeProviderOptions {
  ok?: boolean;
  /** clave category|answer -> resultado (AIOutcome, JSON string o Error) */
  responses?: Map<string, AIOutcome | string | Error>;
  /** cuántas veces debe fallar antes de devolver el resultado correcto */
  failFirstN?: number;
}

export class FakeProvider implements AIProvider {
  readonly name = 'fake';
  calls: AIValidationRequest[] = [];
  healthCalls = 0;
  responses: Map<string, AIOutcome | string | Error>;
  private ok: boolean;
  private failFirstN: number;
  private failCounts = new Map<string, number>();

  constructor(opts: FakeProviderOptions = {}) {
    this.ok = opts.ok ?? true;
    this.responses = opts.responses ?? new Map();
    this.failFirstN = opts.failFirstN ?? 0;
  }

  async validate(req: AIValidationRequest, _context?: ValidateContext): Promise<AIOutcome> {
    this.calls.push(req);
    const key = reqKey(req);
    const value = this.responses.get(key);
    const fails = this.failCounts.get(key) ?? 0;
    if (this.failFirstN > 0 && fails < this.failFirstN) {
      this.failCounts.set(key, fails + 1);
      if (value instanceof Error) throw value;
      throw new Error('JSON inválido del modelo: no es JSON');
    }
    if (value === undefined) {
      return { valid: true, confidence: 0.95, reason: 'fijo', normalizedAnswer: req.answer.trim().toLowerCase() };
    }
    if (value instanceof Error) throw value;
    if (typeof value === 'string') return parseAIResponse(value);
    return value;
  }

  async check(): Promise<ProviderHealth> {
    this.healthCalls++;
    return { ok: this.ok, detail: this.ok ? undefined : 'fake down' };
  }
}

export interface FakeTimers {
  setTimer: (ms: number, fn: () => void) => unknown;
  clearTimer: (handle: unknown) => void;
  advance: (ms: number) => void;
}

export function createFakeTimers(): FakeTimers {
  let now = 0;
  let nextId = 1;
  const tasks = new Map<number, { at: number; fn: () => void }>();
  return {
    setTimer: (ms, fn) => {
      const id = nextId++;
      tasks.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (handle) => {
      tasks.delete(handle as number);
    },
    advance: (ms) => {
      const target = now + ms;
      const due = [...tasks.entries()]
        .filter(([, t]) => t.at <= target)
        .sort((a, b) => a[1].at - b[1].at);
      now = target;
      for (const [id, t] of due) {
        tasks.delete(id);
        t.fn();
      }
    },
  };
}

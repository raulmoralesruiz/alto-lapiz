import type { Language } from '../../../shared/src/types.ts';
import type { Logger } from '../log.ts';
import type { AIOutcome, AIProvider, AIValidationRequest } from './provider.ts';
import { AIFormatError } from './schema.ts';
import { cacheKey, ValidationCache } from './cache.ts';
import { mapPool } from '../util/pool.ts';

export interface ValidationItem {
  id: string;
  letter: string;
  category: string;
  answer: string;
  normalized: string;
  language: Language;
}

export interface ValidationResult {
  id: string;
  ok: boolean;
  source: 'cache' | 'model' | 'error';
  outcome?: AIOutcome;
  error?: string;
}

export interface ValidatorOptions {
  concurrency: number;
  maxRetries: number;
  confidenceThreshold: number;
  log: Logger;
}

const HEALTH_TTL_MS = 15000;

/**
 * Fachada de validación: añade caché, concurrencia limitada, reintentos
 * ante JSON malformado y verificación de salud del proveedor.
 */
export class AIValidator {
  private provider: AIProvider;
  private cache: ValidationCache;
  private concurrency: number;
  private maxRetries: number;
  private confidenceThreshold: number;
  private log: Logger;
  private health: { at: number; ok: boolean; detail?: string } | null = null;
  private inFlight = new Map<string, Promise<AIOutcome>>();

  constructor(provider: AIProvider, opts: ValidatorOptions) {
    this.provider = provider;
    this.cache = new ValidationCache();
    this.concurrency = opts.concurrency;
    this.maxRetries = opts.maxRetries;
    this.confidenceThreshold = opts.confidenceThreshold;
    this.log = opts.log;
  }

  get modelName(): string {
    return this.provider.name;
  }

  get threshold(): number {
    return this.confidenceThreshold;
  }

  async checkHealth(force = false): Promise<{ ok: boolean; detail?: string }> {
    if (!force && this.health && Date.now() - this.health.at < HEALTH_TTL_MS) {
      return { ok: this.health.ok, detail: this.health.detail };
    }
    const result = await this.provider.check();
    this.health = { at: Date.now(), ok: result.ok, detail: result.detail };
    return result;
  }

  async validateMany(items: ValidationItem[], onResult?: (r: ValidationResult) => void): Promise<ValidationResult[]> {
    return mapPool(items, this.concurrency, async (item) => {
      const key = cacheKey(item.language, item.letter, item.category, item.normalized);

      // 1) Resultado ya cacheado: sin llamada al modelo.
      const cached = this.cache.get(key);
      if (cached) {
        const r: ValidationResult = { id: item.id, ok: true, source: 'cache', outcome: cached };
        this.log.debug('ai.cache_hit', { id: item.id, category: item.category, answer: item.answer });
        onResult?.(r);
        return r;
      }

      // 2) Llamada ya en curso para la misma clave: reutilizarla (single-flight).
      let pending = this.inFlight.get(key);
      const shared = pending !== undefined;
      if (!pending) {
        pending = this.validateOne(item, key).finally(() => this.inFlight.delete(key));
        this.inFlight.set(key, pending);
      }

      const startedAt = Date.now();
      try {
        const outcome = await pending;
        const r: ValidationResult = { id: item.id, ok: true, source: shared ? 'cache' : 'model', outcome };
        this.log.info('ai.validated', {
          id: item.id,
          category: item.category,
          answer: item.answer,
          valid: outcome.valid,
          confidence: outcome.confidence,
          ms: Date.now() - startedAt,
          shared,
        });
        onResult?.(r);
        return r;
      } catch (e) {
        const r: ValidationResult = { id: item.id, ok: false, source: 'error', error: e instanceof Error ? e.message : String(e) };
        onResult?.(r);
        return r;
      }
    });
  }

  private async validateOne(item: ValidationItem, key: string): Promise<AIOutcome> {
    let lastError = 'error desconocido';
    let previousBad: string | undefined;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const req: AIValidationRequest = {
          letter: item.letter,
          category: item.category,
          answer: item.answer,
          language: item.language,
        };
        const outcome = await this.provider.validate(req, { attempt, previousBad });
        this.cache.set(key, outcome);
        return outcome;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        if (e instanceof AIFormatError) previousBad = lastError;
        this.log.warn('ai.error', { id: item.id, attempt, error: lastError.slice(0, 200) });
      }
    }
    throw new Error(lastError);
  }
}

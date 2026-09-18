import type { AIOutcome } from './provider.ts';

export function cacheKey(language: string, letter: string, category: string, normalized: string): string {
  return [language, letter.toUpperCase(), category.trim().toLowerCase(), normalized].join('|');
}

/** Caché en memoria con límite de tamaño (FIFO). */
export class ValidationCache {
  private map = new Map<string, AIOutcome>();
  private max: number;

  constructor(max = 2000) {
    this.max = max;
  }

  get(key: string): AIOutcome | undefined {
    return this.map.get(key);
  }

  set(key: string, value: AIOutcome): void {
    if (this.map.size >= this.max) {
      const first = this.map.keys().next().value;
      if (first !== undefined) this.map.delete(first);
    }
    this.map.set(key, value);
  }

  get size(): number {
    return this.map.size;
  }
}

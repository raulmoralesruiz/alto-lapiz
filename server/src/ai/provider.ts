import type { Language } from '../../../shared/src/types.ts';

export interface AIValidationRequest {
  letter: string;
  category: string;
  answer: string;
  language: Language;
}

export interface AIOutcome {
  valid: boolean;
  confidence: number;
  reason: string;
  normalizedAnswer: string;
}

export interface ValidateContext {
  attempt: number;
  previousBad?: string;
}

export interface ProviderHealth {
  ok: boolean;
  detail?: string;
}

/**
 * Abstracción del proveedor de IA. Cualquier runtime local (Ollama,
 * llama.cpp server, LM Studio...) puede implementarse sin tocar el resto.
 */
export interface AIProvider {
  readonly name: string;
  validate(req: AIValidationRequest, context?: ValidateContext): Promise<AIOutcome>;
  check(): Promise<ProviderHealth>;
}

import { z } from 'zod';
import type { AIOutcome } from './provider.ts';

export const AI_RESULT_SCHEMA = z.object({
  valid: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(300),
  normalized_answer: z.string().min(1).max(80),
});

export class AIFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIFormatError';
  }
}

/**
 * Parsea la respuesta del modelo y la valida contra el schema estricto.
 * Tolera markdown y texto alrededor del JSON. Lanza AIFormatError si no
 * se puede extraer un resultado válido.
 */
export function parseAIResponse(text: string): AIOutcome {
  let candidate = (text ?? '').trim();
  if (candidate.length === 0) throw new AIFormatError('El modelo no devolvió contenido');

  const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) candidate = fence[1].trim();

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start !== -1 && end > start) candidate = candidate.slice(start, end + 1);

  let data: unknown;
  try {
    data = JSON.parse(candidate);
  } catch {
    throw new AIFormatError(`JSON inválido del modelo: ${text.slice(0, 160)}`);
  }

  const parsed = AI_RESULT_SCHEMA.safeParse(data);
  if (!parsed.success) {
    throw new AIFormatError(`El JSON del modelo no cumple el schema: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
  }
  const d = parsed.data;
  return {
    valid: d.valid,
    confidence: d.confidence,
    reason: d.reason,
    normalizedAnswer: d.normalized_answer,
  };
}

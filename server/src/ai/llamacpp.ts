import type { AIOutcome, AIProvider, AIValidationRequest, ProviderHealth, ValidateContext } from './provider.ts';
import { buildValidationPrompt, RETRY_MESSAGE } from './prompt.ts';
import { parseAIResponse } from './schema.ts';

export interface LlamaCppConfig {
  url: string;
  model: string;
  temperature: number;
  timeoutMs: number;
}

/**
 * Proveedor para llama.cpp server (API compatible con OpenAI).
 * También sirve para LM Studio, koboldcpp o cualquier endpoint `/v1/chat/completions`.
 */
export class LlamaCppProvider implements AIProvider {
  readonly name = 'llamacpp';
  private url: string;
  private model: string;
  private temperature: number;
  private timeoutMs: number;

  constructor(cfg: LlamaCppConfig) {
    this.url = cfg.url.replace(/\/+$/, '');
    this.model = cfg.model;
    this.temperature = cfg.temperature;
    this.timeoutMs = cfg.timeoutMs;
  }

  private async postChat(messages: { role: string; content: string }[]): Promise<string> {
    const res = await fetch(`${this.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: this.temperature,
        max_tokens: 300,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`llama.cpp respondió HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? '';
  }

  async validate(req: AIValidationRequest, context?: ValidateContext): Promise<AIOutcome> {
    const messages: { role: string; content: string }[] = [
      { role: 'user', content: buildValidationPrompt(req) },
    ];
    if (context?.previousBad) {
      messages.push({ role: 'assistant', content: context.previousBad });
      messages.push({ role: 'user', content: RETRY_MESSAGE });
    }
    const text = await this.postChat(messages);
    return parseAIResponse(text);
  }

  async check(): Promise<ProviderHealth> {
    try {
      const res = await fetch(`${this.url}/v1/models`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return { ok: false, detail: `llama.cpp respondió HTTP ${res.status}` };
      const data = (await res.json()) as { data?: { id: string }[] };
      const models = (data.data ?? []).map((m) => m.id);
      if (models.length === 0) return { ok: false, detail: 'llama.cpp no tiene modelos cargados' };
      // Con un solo modelo llama.cpp lo usa aunque el nombre no coincida;
      // con varios, el nombre configurado debe coincidir con uno de ellos.
      if (models.length > 1 && !models.includes(this.model)) {
        return { ok: false, detail: `El modelo "${this.model}" no está cargado. Disponibles: ${models.join(', ')}` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  }
}

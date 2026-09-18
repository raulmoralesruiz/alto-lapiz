import type { AIOutcome, AIProvider, AIValidationRequest, ProviderHealth, ValidateContext } from './provider.ts';
import { buildValidationPrompt, RETRY_MESSAGE } from './prompt.ts';
import { parseAIResponse } from './schema.ts';

export interface OllamaConfig {
  url: string;
  model: string;
  temperature: number;
  timeoutMs: number;
}

export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';
  private url: string;
  private model: string;
  private temperature: number;
  private timeoutMs: number;

  constructor(cfg: OllamaConfig) {
    this.url = cfg.url.replace(/\/+$/, '');
    this.model = cfg.model;
    this.temperature = cfg.temperature;
    this.timeoutMs = cfg.timeoutMs;
  }

  private async postChat(messages: { role: string; content: string }[]): Promise<string> {
    const res = await fetch(`${this.url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        format: 'json',
        options: { temperature: this.temperature, num_predict: 300 },
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Ollama respondió HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content ?? '';
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
      const res = await fetch(`${this.url}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return { ok: false, detail: `Ollama respondió HTTP ${res.status}` };
      const data = (await res.json()) as { models?: { name: string }[] };
      const found = (data.models ?? []).some(
        (m) => m.name === this.model || m.name.startsWith(`${this.model}:`),
      );
      if (!found) return { ok: false, detail: `El modelo "${this.model}" no está descargado en Ollama` };
      return { ok: true };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  }
}

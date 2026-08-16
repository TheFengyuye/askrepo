import { getConfig } from '../config';
import type { ChatMessage, LLMProvider, LLMResponse } from './provider';

/** DeepSeek via the OpenAI-compatible chat completions API (plain fetch, no SDK). */
export class DeepSeekProvider implements LLMProvider {
  async chat(messages: ChatMessage[]): Promise<LLMResponse> {
    const cfg = getConfig();
    if (!cfg.deepseekApiKey) {
      throw new Error(
        'DEEPSEEK_API_KEY is not set. Copy .env.example to .env and fill in your key (https://platform.deepseek.com).',
      );
    }
    const res = await fetch(`${cfg.deepseekBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: cfg.deepseekModel,
        messages,
        temperature: 0.2,
        max_tokens: 2000,
        stream: false,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`DeepSeek API error ${res.status}: ${text.slice(0, 500)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return { content: data.choices?.[0]?.message?.content ?? '' };
  }

  /** Deterministic variant (temperature 0) — used for query rewriting. */
  async chatDeterministic(messages: ChatMessage[]): Promise<LLMResponse> {
    const cfg = getConfig();
    if (!cfg.deepseekApiKey) {
      throw new Error('DEEPSEEK_API_KEY is not set. Copy .env.example to .env and fill in your key.');
    }
    const res = await fetch(`${cfg.deepseekBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: cfg.deepseekModel,
        messages,
        temperature: 0,
        max_tokens: 200,
        stream: false,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`DeepSeek API error ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return { content: data.choices?.[0]?.message?.content ?? '' };
  }

  /** SSE streaming variant — yields content deltas as they arrive. */
  async chatStream(messages: ChatMessage[]): Promise<AsyncIterable<string>> {
    const cfg = getConfig();
    if (!cfg.deepseekApiKey) {
      throw new Error(
        'DEEPSEEK_API_KEY is not set. Copy .env.example to .env and fill in your key (https://platform.deepseek.com).',
      );
    }
    const res = await fetch(`${cfg.deepseekBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: cfg.deepseekModel,
        messages,
        temperature: 0.2,
        max_tokens: 2000,
        stream: true,
      }),
    });
    if (!res.ok || !res.body) {
      const text = await res.text();
      throw new Error(`DeepSeek API error ${res.status}: ${text.slice(0, 300)}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    return (async function* () {
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const payload = t.slice(5).trim();
          if (payload === '[DONE]') return;
          try {
            const json = JSON.parse(payload) as {
              choices?: { delta?: { content?: string } }[];
            };
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) yield delta;
          } catch {
            // skip malformed keep-alive lines
          }
        }
      }
    })();
  }
}

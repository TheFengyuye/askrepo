import { getConfig } from '../config.js';
import type { ChatMessage, LLMProvider, LLMResponse } from './provider.js';

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
}

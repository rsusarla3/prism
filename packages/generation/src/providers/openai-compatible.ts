import type { LLMClient } from '../generate.js';

export interface OpenAICompatibleClientOptions {
  baseUrl: string;
  model: string;
  apiKey?: string;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
}

function normalizeBaseUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('LLM base URL must use HTTP or HTTPS.');
  url.pathname = url.pathname.replace(/\/$/u, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/u, '');
}

/** Provider-neutral client for Ollama and hosted OpenAI-compatible services. */
export function createOpenAICompatibleClient(options: OpenAICompatibleClientOptions): LLMClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  return {
    async complete({ system, user, schema }) {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: options.model,
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          temperature: 0.2,
          ...(schema ? { response_format: { type: 'json_schema', json_schema: { name: 'prism_response', strict: true, schema } } } : {}),
        }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => response.statusText);
        throw new Error(`Compatible LLM API ${response.status}: ${detail}`);
      }
      const data = await response.json() as ChatCompletionResponse;
      const content = data.choices?.[0]?.message?.content;
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        const text = content.filter((part) => part.type === 'text').map((part) => part.text ?? '').join('');
        if (text) return text;
      }
      throw new Error('Compatible LLM response did not contain text content.');
    },
  };
}

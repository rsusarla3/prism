/**
 * Gemini-backed LLMClient. Server-side only — the API key never reaches a
 * client bundle. Model name is configurable because provider model ids move
 * fast; GEMINI_MODEL overrides the default in apps/web/src/server.ts.
 */
import type { LLMClient } from '../generate.js';

export interface GeminiClientOptions {
  apiKey: string;
  model?: string;
}

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

export function createGeminiClient(opts: GeminiClientOptions): LLMClient {
  const model = opts.model ?? DEFAULT_GEMINI_MODEL;

  return {
    async complete({ system, user, schema }) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': opts.apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              ...(schema ? { responseJsonSchema: schema } : {}),
            },
          }),
        },
      );

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`Gemini API ${res.status}: ${text}`);
      }

      const data = (await res.json()) as GeminiResponse;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== 'string') {
        throw new Error('Gemini response did not contain text content.');
      }
      return text;
    },
  };
}

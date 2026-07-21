/**
 * Gemini-backed LLMClient. Server-side only — the API key never reaches a
 * client bundle. Model name is configurable because provider model ids move
 * fast; GEMINI_MODEL overrides the default in apps/web/src/server.ts.
 */
import type { LLMClient } from '../generate.js';

export interface GeminiClientOptions {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
}

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';
const DEFAULT_TIMEOUT_MS = 45_000;

export class GeminiProviderError extends Error {
  readonly status = 502;

  constructor(message: string, readonly code: 'timeout' | 'network' | 'response') {
    super(message);
    this.name = 'GeminiProviderError';
  }
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

export function createGeminiClient(opts: GeminiClientOptions): LLMClient {
  const model = opts.model ?? DEFAULT_GEMINI_MODEL;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async complete({ system, user, schema }) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetch(
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
            signal: controller.signal,
          },
        );
      } catch (error) {
        if (controller.signal.aborted) {
          throw new GeminiProviderError(`Gemini did not respond within ${Math.round(timeoutMs / 1000)} seconds. Check the API key's project, billing, and model access, then try again.`, 'timeout');
        }
        const cause = error && typeof error === 'object' ? (error as { cause?: unknown }).cause : undefined;
        const detail = cause instanceof Error ? ` (${cause.message})` : '';
        throw new GeminiProviderError(`Could not reach Gemini's API${detail}`, 'network');
      } finally {
        clearTimeout(timeout);
      }

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new GeminiProviderError(`Gemini API ${res.status}: ${text}`, 'response');
      }

      const data = (await res.json()) as GeminiResponse;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== 'string') {
        throw new GeminiProviderError('Gemini response did not contain text content.', 'response');
      }
      return text;
    },
  };
}

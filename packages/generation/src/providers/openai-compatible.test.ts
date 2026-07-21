import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpenAICompatibleClient } from './openai-compatible.js';

afterEach(() => vi.unstubAllGlobals());

describe('OpenAI-compatible provider', () => {
  it('supports a credential-free local Ollama endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const client = createOpenAICompatibleClient({ baseUrl: 'http://127.0.0.1:11434/v1/', model: 'qwen3:8b' });
    await expect(client.complete({ system: 'Teach.', user: 'Current page.', schema: { type: 'object' } })).resolves.toBe('{"ok":true}');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:11434/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('adds a bearer credential only when configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = createOpenAICompatibleClient({ baseUrl: 'https://api.example.com/v1', model: 'model', apiKey: 'secret' });
    await client.complete({ system: 's', user: 'u' });
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>).authorization).toBe('Bearer secret');
  });
});

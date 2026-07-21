import { describe, it, expect, vi, afterEach } from 'vitest';
import { createGeminiClient, DEFAULT_GEMINI_MODEL } from './gemini.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(response: { ok: boolean; status?: number; json?: unknown; text?: string }) {
  const fetchMock = vi.fn(async () => ({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 500),
    statusText: 'Error',
    json: async () => response.json,
    text: async () => response.text ?? '',
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('createGeminiClient', () => {
  it('sends the system and user prompt in the expected request shape', async () => {
    const fetchMock = stubFetch({
      ok: true,
      json: { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] },
    });

    const client = createGeminiClient({ apiKey: 'test-key' });
    await client.complete({ system: 'be helpful', user: 'do the thing' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(DEFAULT_GEMINI_MODEL);
    expect(url).toContain('key=test-key');

    const body = JSON.parse(init.body as string);
    expect(body.systemInstruction.parts[0].text).toBe('be helpful');
    expect(body.contents[0].parts[0].text).toBe('do the thing');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('uses a custom model when provided', async () => {
    const fetchMock = stubFetch({ ok: true, json: { candidates: [{ content: { parts: [{ text: '{}' }] } }] } });
    const client = createGeminiClient({ apiKey: 'k', model: 'gemini-custom' });
    await client.complete({ system: 's', user: 'u' });
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toContain('gemini-custom');
  });

  it('returns the text from the first candidate', async () => {
    stubFetch({ ok: true, json: { candidates: [{ content: { parts: [{ text: '{"bundle":1}' }] } }] } });
    const client = createGeminiClient({ apiKey: 'k' });
    const text = await client.complete({ system: 's', user: 'u' });
    expect(text).toBe('{"bundle":1}');
  });

  it('throws with the response body when the API call fails', async () => {
    stubFetch({ ok: false, status: 429, text: 'rate limited' });
    const client = createGeminiClient({ apiKey: 'k' });
    await expect(client.complete({ system: 's', user: 'u' })).rejects.toThrow(/429/);
  });

  it('throws when the response has no text content', async () => {
    stubFetch({ ok: true, json: { candidates: [] } });
    const client = createGeminiClient({ apiKey: 'k' });
    await expect(client.complete({ system: 's', user: 'u' })).rejects.toThrow(/text content/);
  });
});

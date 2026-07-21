import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGeminiFigureClient, DEFAULT_GEMINI_FIGURE_MODEL } from './gemini-figure.js';

afterEach(() => vi.unstubAllGlobals());

describe('Gemini figure client', () => {
  it('uses the most compatible minimal request for Gemini 2.5 and reads inline image data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'aGVsbG8=' } }] } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const image = await createGeminiFigureClient({ apiKey: 'secret' }).generate('Draw a diagram.');
    expect(image).toEqual({ mimeType: 'image/png', dataBase64: 'aGVsbG8=' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain(DEFAULT_GEMINI_FIGURE_MODEL);
    expect(init.headers['x-goog-api-key']).toBe('secret');
    expect(JSON.parse(init.body)).toEqual({ contents: [{ parts: [{ text: 'Draw a diagram.' }] }] });
  });

  it('sets an explicit 1K size only for Gemini 3 image models', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'aGVsbG8=' } }] } }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await createGeminiFigureClient({ apiKey: 'secret', model: 'gemini-3.1-flash-image' }).generate('Draw.');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).generationConfig.responseModalities).toEqual(['IMAGE']);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).generationConfig.responseFormat.image.aspectRatio).toBe('3:4');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).generationConfig.responseFormat.image.imageSize).toBe('1K');
  });

  it('retries a missing v1 model through the v1beta generateContent route', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { status: 'NOT_FOUND', message: 'not found for API version v1' } }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'aGVsbG8=' } }] } }],
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(createGeminiFigureClient({ apiKey: 'secret' }).generate('Draw.')).resolves.toMatchObject({ mimeType: 'image/png' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('/v1beta/models/');
  });

  it('distinguishes an invalid request from unavailable model access without leaking details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { status: 'INVALID_ARGUMENT', message: 'private-project-detail' },
    }), { status: 400 })));
    const request = createGeminiFigureClient({ apiKey: 'secret' }).generate('Draw.');
    await expect(request).rejects.toThrow(/request configuration/i);
    await expect(request).rejects.not.toThrow(/private-project-detail/i);
  });

  it('rejects responses without supported image data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [] }), { status: 200 })));
    await expect(createGeminiFigureClient({ apiKey: 'secret' }).generate('Draw.')).rejects.toThrow(/supported image/i);
  });

  it('returns a useful billing message without exposing provider response details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"private-project-detail"}', { status: 403 })));
    const request = createGeminiFigureClient({ apiKey: 'secret' }).generate('Draw.');
    await expect(request).rejects.toThrow(/billing/i);
    await expect(request).rejects.not.toThrow(/private-project-detail/i);
  });
});

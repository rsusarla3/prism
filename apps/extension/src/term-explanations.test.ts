import { describe, expect, it, vi } from 'vitest';
import { explainTerm, fallbackTermExplanation } from '../term-explanations.js';

describe('term explanations', () => {
  it('provides a definition instead of returning the source excerpt', () => {
    const excerpt = 'A severe labor shortage could emerge as baby boomers retire.';
    const definition = fallbackTermExplanation('labor shortage', [excerpt], 'en');
    expect(definition).toMatch(/employers need more workers/i);
    expect(definition).not.toBe(excerpt);
  });

  it('uses a no-key encyclopedia definition when available', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ type: 'standard', lang: 'en', extract: 'Photosynthesis is a biological process that converts light energy into chemical energy.' }),
    });
    const result = await explainTerm('photosynthesis', { fetcher, language: 'en' });
    expect(result.source).toBe('Wikipedia');
    expect(result.definition).toMatch(/biological process/i);
  });

  it('falls back locally when the encyclopedia is unavailable', async () => {
    const result = await explainTerm('compound interest', { fetcher: vi.fn().mockRejectedValue(new Error('offline')), language: 'en' });
    expect(result.source).toBe('Prism local explanation');
    expect(result.definition).toMatch(/original amount/i);
  });
});

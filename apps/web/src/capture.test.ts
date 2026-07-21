import { describe, expect, it } from 'vitest';
import { MAX_CAPTURED_SOURCES, prepareCapturedSources } from './capture.js';

const source = { url: 'https://example.com/topic', title: 'Topic', text: 'Readable lesson text', capturedAt: '2026-07-21T12:00:00Z' };

describe('prepareCapturedSources', () => {
  it('normalizes an explicit capture batch', () => {
    expect(prepareCapturedSources({ sources: [source] })[0]).toEqual({ ...source, capturedAt: '2026-07-21T12:00:00.000Z' });
  });

  it('rejects browser-internal URLs and empty text', () => {
    expect(() => prepareCapturedSources({ sources: [{ ...source, url: 'chrome://settings' }] })).toThrow(/HTTP/);
    expect(() => prepareCapturedSources({ sources: [{ ...source, text: ' ' }] })).toThrow(/non-empty/);
  });

  it('limits the number of tabs in one capture', () => {
    expect(() => prepareCapturedSources({ sources: Array.from({ length: MAX_CAPTURED_SOURCES + 1 }, () => source) })).toThrow(/at most/);
  });
});

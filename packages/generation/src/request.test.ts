import { describe, expect, it } from 'vitest';
import { MAX_SOURCE_CHARS, prepareGenerateRequest } from './request.js';

describe('prepareGenerateRequest', () => {
  it('trims source text and optional metadata', () => {
    expect(prepareGenerateRequest({ text: '  lesson  ', title: ' Topic ', targetGrade: 8, homeLanguage: 'en-US' })).toEqual({
      text: 'lesson', title: 'Topic', targetGrade: 8, homeLanguage: 'en-US',
    });
  });

  it('rejects empty text', () => {
    expect(() => prepareGenerateRequest({ text: '   ' })).toThrow(/text is required/);
  });

  it('rejects source text over the product limit with status 413', () => {
    try {
      prepareGenerateRequest({ text: 'a'.repeat(MAX_SOURCE_CHARS + 1) });
      throw new Error('Expected prepareGenerateRequest to throw.');
    } catch (error) {
      expect((error as { status?: number }).status).toBe(413);
    }
  });

  it('rejects invalid grade and language metadata', () => {
    expect(() => prepareGenerateRequest({ text: 'lesson', targetGrade: 13 })).toThrow(/targetGrade/);
    expect(() => prepareGenerateRequest({ text: 'lesson', homeLanguage: 'not a tag!' })).toThrow(/homeLanguage/);
  });
});

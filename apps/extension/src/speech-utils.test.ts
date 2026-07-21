import { describe, expect, it } from 'vitest';
import { chunkSpeechText, voicesForLanguage } from '../speech-utils.js';

describe('listen voice filtering', () => {
  const voices = [
    { name: 'English US', lang: 'en-US' },
    { name: 'English UK', lang: 'en-GB' },
    { name: 'Español', lang: 'es-ES' },
    { name: 'Mandarin', lang: 'zh-CN' },
  ];

  it('shows only voices matching the chosen language', () => {
    expect(voicesForLanguage(voices, 'es').map((voice) => voice.name)).toEqual(['Español']);
    expect(voicesForLanguage(voices, 'en-US').map((voice) => voice.name)).toEqual(['English US', 'English UK']);
  });

  it('does not fall back to unrelated voices', () => {
    expect(voicesForLanguage(voices, 'fr')).toEqual([]);
  });
});

describe('speech chunking', () => {
  it('keeps a long narration in short, readable utterances', () => {
    const text = 'First sentence is short. Second sentence is also short. Third sentence should start a new chunk.';
    expect(chunkSpeechText(text, 45)).toEqual([
      'First sentence is short.',
      'Second sentence is also short.',
      'Third sentence should start a new chunk.',
    ]);
  });
});

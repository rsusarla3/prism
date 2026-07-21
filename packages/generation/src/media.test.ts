import { describe, it, expect } from 'vitest';
import type { StudyBundle, MediaAsset } from 'prism-shared';
import { attachMedia, type SpeechClient, type ImageClient } from './media.js';

const AUDIO: MediaAsset = { dataUrl: 'data:audio/wav;base64,AAA', mimeType: 'audio/wav', durationMs: 1200 };
const IMAGE: MediaAsset = { dataUrl: 'data:image/png;base64,BBB', mimeType: 'image/png' };

function bundle(): StudyBundle {
  return {
    meta: { title: 'T', contentType: 'expository', inferredGrade: 6, conceptIds: [], language: 'en', droppedForCoherence: [] },
    read: { segments: [{ text: 'Text.', glosses: [{ term: 't', definition: 'd' }], recap: 'R.' }] },
    listen: { script: 'Narration.', segmentIndex: [0], highlightLeadMs: 300 },
    watch: { kind: 'diagram', steps: [{ caption: 'C', description: 'D' }], altText: 'Alt.' },
    explore: { timeline: [{ label: 'L', detail: 'D', order: 1 }] },
    quiz: { items: [{ kind: 'transfer', stem: 'Q?', explanation: 'E', options: [{ text: 'a', correct: true, feedback: 'f' }, { text: 'b', correct: false, feedback: 'f' }] }] },
  };
}

const okSpeech: SpeechClient = { async speak() { return AUDIO; } };
const okImage: ImageClient = { async draw() { return IMAGE; } };

describe('attachMedia', () => {
  it('leaves the bundle untouched when no clients are configured', async () => {
    const result = await attachMedia(bundle(), {});
    expect(result.bundle.listen.audio).toBeUndefined();
    expect(result.bundle.watch.image).toBeUndefined();
    expect(result.failures).toEqual([]);
  });

  it('attaches audio and image when both clients succeed', async () => {
    const result = await attachMedia(bundle(), { speech: okSpeech, image: okImage });
    expect(result.bundle.listen.audio).toEqual(AUDIO);
    expect(result.bundle.watch.image).toEqual(IMAGE);
    expect(result.failures).toEqual([]);
  });

  it('passes the narration script and language to the speech client', async () => {
    let seen: { text: string; language: string } | null = null;
    const spy: SpeechClient = { async speak(args) { seen = args; return AUDIO; } };
    await attachMedia(bundle(), { speech: spy });
    expect(seen).toEqual({ text: 'Narration.', language: 'en' });
  });

  it('builds the image prompt from the watch steps the model wrote', async () => {
    let prompt = '';
    const spy: ImageClient = { async draw(args) { prompt = args.prompt; return IMAGE; } };
    await attachMedia(bundle(), { image: spy });
    expect(prompt).toContain('C: D');
    expect(prompt).toContain('grade 6');
  });

  it('degrades rather than throwing when a provider fails', async () => {
    const boom: SpeechClient = { async speak() { throw new Error('provider down'); } };
    const result = await attachMedia(bundle(), { speech: boom, image: okImage });
    expect(result.bundle.listen.audio).toBeUndefined();
    expect(result.bundle.watch.image).toEqual(IMAGE);
    expect(result.failures).toEqual([{ asset: 'listen.audio', message: 'provider down' }]);
  });

  it('keeps the lesson content intact while attaching media', async () => {
    const result = await attachMedia(bundle(), { speech: okSpeech });
    expect(result.bundle.quiz.items).toHaveLength(1);
    expect(result.bundle.listen.script).toBe('Narration.');
    expect(result.bundle.read.segments[0].text).toBe('Text.');
  });
});

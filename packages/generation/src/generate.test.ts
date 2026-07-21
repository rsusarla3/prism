import { describe, it, expect } from 'vitest';
import { generateStudyBundle, type LLMClient } from './generate.js';
import type { StudyBundle } from 'prism-shared';

const VALID_BUNDLE: StudyBundle = {
  meta: {
    title: 'Test',
    contentType: 'expository',
    inferredGrade: 6,
    conceptIds: [],
    language: 'en',
    droppedForCoherence: ['a cookie banner'],
  },
  read: { segments: [{ text: 'Some text.', glosses: [], recap: 'A recap.' }] },
  listen: { script: 'Here is what happened.', segmentIndex: [0], highlightLeadMs: 300 },
  watch: { kind: 'diagram', steps: [{ caption: 'Step 1', description: 'It shows the idea.' }], altText: 'A labelled diagram of the idea.' },
  explore: { timeline: [{ label: 'Start', detail: 'It began.', order: 0 }] },
  quiz: {
    items: [
      {
        kind: 'transfer',
        stem: 'Which applies?',
        options: [
          { text: 'Right', correct: true, feedback: 'Correct because X.' },
          { text: 'Wrong', correct: false, feedback: 'Not quite, because Y.' },
        ],
        explanation: 'X explains it.',
      },
    ],
  },
};

function fakeClient(responses: string[]): LLMClient {
  let i = 0;
  return {
    async complete() {
      const r = responses[Math.min(i, responses.length - 1)];
      i++;
      return r;
    },
  };
}

describe('generateStudyBundle', () => {
  it('returns the bundle on a valid first attempt', async () => {
    const llm = fakeClient([JSON.stringify(VALID_BUNDLE)]);
    const result = await generateStudyBundle({ text: 'passage' }, llm);
    expect(result.bundle).not.toBeNull();
    expect(result.issues).toEqual([]);
    expect(result.attempts).toBe(1);
  });

  it('retries once and succeeds when the second attempt fixes the issues', async () => {
    const broken: StudyBundle = {
      ...VALID_BUNDLE,
      quiz: { items: [{ ...VALID_BUNDLE.quiz.items[0], options: [{ text: 'Right', correct: true, feedback: '' }, VALID_BUNDLE.quiz.items[0].options[1]] }] },
    };
    const llm = fakeClient([JSON.stringify(broken), JSON.stringify(VALID_BUNDLE)]);
    const result = await generateStudyBundle({ text: 'passage' }, llm);
    expect(result.bundle).not.toBeNull();
    expect(result.attempts).toBe(2);
  });

  it('gives up after maxAttempts and reports the last issues', async () => {
    const broken: StudyBundle = { ...VALID_BUNDLE, watch: { ...VALID_BUNDLE.watch, altText: '' } };
    const llm = fakeClient([JSON.stringify(broken)]);
    const result = await generateStudyBundle({ text: 'passage' }, llm, { maxAttempts: 2 });
    expect(result.bundle).toBeNull();
    expect(result.issues.some((i) => i.rule === 'watch-alt-text-required')).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it('treats invalid JSON as a retryable failure', async () => {
    const llm = fakeClient(['not json', JSON.stringify(VALID_BUNDLE)]);
    const result = await generateStudyBundle({ text: 'passage' }, llm);
    expect(result.bundle).not.toBeNull();
    expect(result.attempts).toBe(2);
  });
});

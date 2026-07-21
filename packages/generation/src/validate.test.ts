import { describe, it, expect } from 'vitest';
import type { StudyBundle } from 'prism-shared';
import { validateStudyBundle, MAX_GLOSS_WORDS } from './validate.js';

function validBundle(): StudyBundle {
  return {
    meta: {
      title: 'Photosynthesis Basics',
      contentType: 'expository',
      inferredGrade: 6,
      conceptIds: [],
      language: 'en',
      droppedForCoherence: ['Removed cookie-consent banner text.'],
    },
    read: {
      segments: [
        {
          text: 'Plants convert sunlight into energy through photosynthesis.',
          glosses: [{ term: 'photosynthesis', definition: 'making food from light', homeLanguage: undefined }],
          recap: 'Plants turn light into energy.',
        },
      ],
    },
    listen: {
      script: 'You are about to learn how plants make their own food.',
      segmentIndex: [0],
      highlightLeadMs: 300,
    },
    watch: {
      kind: 'diagram',
      steps: [{ caption: 'Sunlight hits the leaf', description: 'Light energy is absorbed by chlorophyll.' }],
      altText: 'Diagram of sunlight entering a leaf and producing glucose and oxygen.',
    },
    explore: {
      timeline: [{ label: 'Light absorbed', detail: 'Chlorophyll captures photons.', order: 1 }],
    },
    quiz: {
      items: [
        {
          kind: 'recall',
          stem: 'What do plants use to make food?',
          options: [
            { text: 'Sunlight', correct: true, feedback: 'Correct — sunlight provides the energy.' },
            { text: 'Soil only', correct: false, feedback: 'Soil provides nutrients, not the main energy source.' },
          ],
          explanation: 'Photosynthesis converts light energy into chemical energy.',
        },
        {
          kind: 'transfer',
          stem: 'A plant is moved to a dark room. What happens to its food production?',
          options: [
            { text: 'It decreases', correct: true, feedback: 'Correct — without light, photosynthesis slows drastically.' },
            { text: 'It increases', correct: false, feedback: 'Incorrect — light is required as an energy input.' },
          ],
          explanation: 'Without light, the light-dependent reactions cannot proceed.',
        },
      ],
    },
  };
}

function clone(bundle: StudyBundle): StudyBundle {
  return JSON.parse(JSON.stringify(bundle));
}

describe('validateStudyBundle', () => {
  it('accepts a well-formed bundle', () => {
    const result = validateStudyBundle(validBundle());
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('rejects a correct option missing feedback', () => {
    const bundle = clone(validBundle());
    bundle.quiz.items[0].options[0].feedback = '';
    const result = validateStudyBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.rule === 'quiz-option-feedback-required')).toBe(true);
  });

  it('rejects a wrong option missing feedback', () => {
    const bundle = clone(validBundle());
    bundle.quiz.items[0].options[1].feedback = '';
    const result = validateStudyBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.rule === 'quiz-option-feedback-required')).toBe(true);
  });

  it('rejects a bundle with no transfer-kind quiz item', () => {
    const bundle = clone(validBundle());
    bundle.quiz.items[1].kind = 'recall';
    const result = validateStudyBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.rule === 'quiz-transfer-item-required')).toBe(true);
  });

  it('rejects empty watch.altText', () => {
    const bundle = clone(validBundle());
    bundle.watch.altText = '';
    const result = validateStudyBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.rule === 'watch-alt-text-required')).toBe(true);
  });

  it('rejects a missing meta.droppedForCoherence field', () => {
    const bundle = clone(validBundle());
    // @ts-expect-error simulating a malformed bundle missing the required field
    delete bundle.meta.droppedForCoherence;
    const result = validateStudyBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.rule === 'meta-dropped-for-coherence-required')).toBe(true);
  });

  it('rejects empty read.segments', () => {
    const bundle = clone(validBundle());
    bundle.read.segments = [];
    const result = validateStudyBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.rule === 'read-segments-non-empty')).toBe(true);
  });

  it('rejects a quiz item with zero correct options', () => {
    const bundle = clone(validBundle());
    bundle.quiz.items[0].options.forEach((o) => (o.correct = false));
    const result = validateStudyBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.rule === 'quiz-item-exactly-one-correct')).toBe(true);
  });

  it('rejects a quiz item with two correct options', () => {
    const bundle = clone(validBundle());
    bundle.quiz.items[0].options.forEach((o) => (o.correct = true));
    const result = validateStudyBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.rule === 'quiz-item-exactly-one-correct')).toBe(true);
  });

  it('rejects empty listen.script', () => {
    const bundle = clone(validBundle());
    bundle.listen.script = '';
    const result = validateStudyBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.rule === 'listen-script-required')).toBe(true);
  });

  it('rejects negative highlightLeadMs', () => {
    const bundle = clone(validBundle());
    bundle.listen.highlightLeadMs = -100;
    const result = validateStudyBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.rule === 'listen-highlight-lead-ms-valid')).toBe(true);
  });

  it('rejects a NaN value in explore.data series points', () => {
    const bundle = clone(validBundle());
    bundle.explore.data = { caption: 'Measurements', series: [{ name: 'Output', points: [{ x: 0, y: 1 }] }] };
    bundle.explore.data!.series[0].points[0].y = NaN;
    const result = validateStudyBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.rule === 'explore-data-point-finite')).toBe(true);
  });

  it('returns structural issues instead of throwing for malformed model output', () => {
    expect(() => validateStudyBundle({ meta: {} })).not.toThrow();
    const result = validateStudyBundle({ meta: {} });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.rule === 'invalid-structure')).toBe(true);
  });

  it('rejects a plotted data value that is absent from the source', () => {
    const bundle = clone(validBundle());
    bundle.explore.data = { caption: 'Shots', series: [{ name: 'Spain', points: [{ x: 'shots', y: 42 }] }] };
    const result = validateStudyBundle(bundle, 'Spain had 20 shots.');
    expect(result.issues.some((i) => i.rule === 'number-source-required')).toBe(true);
  });

  it('accepts equivalent comma-formatted source numbers', () => {
    const bundle = clone(validBundle());
    bundle.explore.data = { caption: 'Crowd', series: [{ name: 'Attendance', points: [{ x: 'fans', y: 1000 }] }] };
    const result = validateStudyBundle(bundle, 'The population reached 1,000.');
    expect(result.issues.some((i) => i.rule === 'number-source-required')).toBe(false);
  });

  it('does not flag numbers in prose, where distractors and paraphrase legitimately differ', () => {
    const bundle = clone(validBundle());
    bundle.read.segments[0].recap = 'About 82.5 thousand fans attended.';
    bundle.quiz.items[0].options[1].text = '3-0';
    const result = validateStudyBundle(bundle, 'A crowd of 82,500 watched Spain win 2-1.');
    expect(result.issues.some((i) => i.rule === 'number-source-required')).toBe(false);
  });

  it('reads both digits of a hyphenated scoreline as source numbers', () => {
    const bundle = clone(validBundle());
    bundle.explore.data = { caption: 'Goals', series: [{ name: 'Argentina', points: [{ x: 'goals', y: 1 }] }] };
    const result = validateStudyBundle(bundle, 'Spain beat Argentina 2-1.');
    expect(result.issues.some((i) => i.rule === 'number-source-required')).toBe(false);
  });

  it('rejects an explore block with neither timeline nor data', () => {
    const bundle = clone(validBundle());
    bundle.explore = {};
    const result = validateStudyBundle(bundle);
    expect(result.issues.some((i) => i.rule === 'explore-requires-timeline-or-data')).toBe(true);
  });

  it('rejects narration that leaves a read segment uncovered', () => {
    const bundle = clone(validBundle());
    bundle.read.segments.push({ text: 'Oxygen is released.', glosses: [], recap: 'Oxygen leaves the leaf.' });
    const result = validateStudyBundle(bundle);
    expect(result.issues.some((i) => i.rule === 'listen-must-cover-segments')).toBe(true);
  });

  it('accepts a bundle with no glossed terms when the source needs none', () => {
    const bundle = clone(validBundle());
    bundle.read.segments[0].glosses = [];
    const result = validateStudyBundle(bundle);
    expect(result.issues.some((i) => i.path.includes('gloss'))).toBe(false);
  });

  it('rejects a gloss definition that has grown into a paragraph', () => {
    const bundle = clone(validBundle());
    bundle.read.segments[0].glosses[0].definition = 'word '.repeat(MAX_GLOSS_WORDS + 1).trim();
    const result = validateStudyBundle(bundle);
    expect(result.issues.some((i) => i.rule === 'gloss-definition-too-long')).toBe(true);
  });

  it('accepts a gloss definition at the length ceiling', () => {
    const bundle = clone(validBundle());
    bundle.read.segments[0].glosses[0].definition = 'word '.repeat(MAX_GLOSS_WORDS).trim();
    const result = validateStudyBundle(bundle);
    expect(result.issues.some((i) => i.rule === 'gloss-definition-too-long')).toBe(false);
  });

  it('rejects enum values that do not match the shared contract', () => {
    const bundle = clone(validBundle());
    (bundle.watch as { kind: string }).kind = 'animation';
    const result = validateStudyBundle(bundle);
    expect(result.issues.some((i) => i.rule === 'invalid-watch-kind')).toBe(true);
  });

  it('rejects listen indexes that do not reference a read segment', () => {
    const bundle = clone(validBundle());
    bundle.listen.segmentIndex = [4];
    const result = validateStudyBundle(bundle);
    expect(result.issues.some((i) => i.rule === 'invalid-segment-index')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import type { LLMClient } from './generate.js';
import { generateLearningAsset } from './asset.js';
import { validateLearningAsset } from './validate.js';

const source = 'Plants use sunlight to make food through photosynthesis.';

describe('generateLearningAsset', () => {
  it('requests only the selected asset schema', async () => {
    let receivedSchema: Record<string, unknown> | undefined;
    const llm: LLMClient = { async complete(args) { receivedSchema = args.schema; return JSON.stringify({ script: 'You can learn how plants use sunlight to make food.', segmentIndex: [0], highlightLeadMs: 300 }); } };
    const result = await generateLearningAsset({ text: source }, 'listen', llm);
    expect(result.payload).toEqual({ script: 'You can learn how plants use sunlight to make food.', segmentIndex: [0], highlightLeadMs: 300 });
    expect(receivedSchema).toMatchObject({ required: ['script', 'segmentIndex', 'highlightLeadMs'] });
  });

  it('rejects a quiz asset without a transfer question', () => {
    const result = validateLearningAsset('quiz', { items: [{ kind: 'recall', stem: 'What do plants use?', explanation: 'Light helps.', options: [{ text: 'Sunlight', correct: true, feedback: 'Correct.' }, { text: 'Noise', correct: false, feedback: 'No.' }] }] }, source);
    expect(result.issues.some((issue) => issue.rule === 'quiz-transfer-item-required')).toBe(true);
  });

  it('retries a malformed selected asset once', async () => {
    let count = 0;
    const llm: LLMClient = { async complete() { count++; return count === 1 ? '{}' : JSON.stringify({ script: 'You can learn how plants use sunlight to make food.', segmentIndex: [0], highlightLeadMs: 300 }); } };
    const result = await generateLearningAsset({ text: source }, 'listen', llm);
    expect(result.attempts).toBe(2);
    expect(result.payload).not.toBeNull();
  });
});

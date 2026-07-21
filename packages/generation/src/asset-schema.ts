import type { LearningAssetKind } from 'prism-shared';

const string = { type: 'string' };

export const LEARNING_ASSET_JSON_SCHEMAS: Record<LearningAssetKind, Record<string, unknown>> = {
  read: {
    type: 'object', additionalProperties: false, required: ['segments'], properties: {
      segments: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: false, required: ['text', 'glosses', 'recap'], properties: {
        text: string, recap: string,
        glosses: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['term', 'definition'], properties: { term: string, definition: string, homeLanguage: string } } },
      } } },
    },
  },
  listen: {
    type: 'object', additionalProperties: false, required: ['script', 'segmentIndex', 'highlightLeadMs'], properties: {
      script: string,
      segmentIndex: { type: 'array', items: { type: 'integer', minimum: 0 } },
      highlightLeadMs: { type: 'integer', enum: [300] },
    },
  },
  watch: {
    type: 'object', additionalProperties: false, required: ['kind', 'steps', 'altText'], properties: {
      kind: { type: 'string', enum: ['diagram', 'sequence'] }, altText: string,
      steps: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: false, required: ['caption', 'description'], properties: { caption: string, description: string } } },
    },
  },
  explore: {
    type: 'object', additionalProperties: false, properties: {
      timeline: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['label', 'detail', 'order'], properties: { label: string, detail: string, order: { type: 'integer' } } } },
      data: { type: 'object', additionalProperties: false, required: ['caption', 'series'], properties: {
        caption: string,
        series: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'points'], properties: {
          name: string,
          points: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['x', 'y'], properties: { x: { anyOf: [{ type: 'number' }, string] }, y: { type: 'number' } } } },
        } } },
      } },
    },
  },
  quiz: {
    type: 'object', additionalProperties: false, required: ['items'], properties: {
      items: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: false, required: ['kind', 'stem', 'options', 'explanation'], properties: {
        kind: { type: 'string', enum: ['recall', 'transfer'] }, stem: string, explanation: string,
        options: { type: 'array', minItems: 2, items: { type: 'object', additionalProperties: false, required: ['text', 'correct', 'feedback'], properties: { text: string, correct: { type: 'boolean' }, feedback: string } } },
      } } },
    },
  },
};

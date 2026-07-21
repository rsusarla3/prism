/** Gemini-compatible JSON Schema for the generated StudyBundle. */
export const STUDY_BUNDLE_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['meta', 'read', 'listen', 'watch', 'explore', 'quiz'],
  properties: {
    meta: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'contentType', 'inferredGrade', 'conceptIds', 'language', 'droppedForCoherence'],
      properties: {
        title: { type: 'string' },
        contentType: { type: 'string', enum: ['narrative', 'expository', 'problem', 'data'] },
        inferredGrade: { type: 'integer', minimum: 1, maximum: 12 },
        conceptIds: { type: 'array', items: { type: 'string' } },
        language: { type: 'string' },
        droppedForCoherence: { type: 'array', items: { type: 'string' } },
      },
    },
    read: {
      type: 'object', additionalProperties: false, required: ['segments'],
      properties: {
        segments: {
          type: 'array', minItems: 1, items: {
            type: 'object', additionalProperties: false, required: ['text', 'glosses', 'recap'],
            properties: {
              text: { type: 'string' }, recap: { type: 'string' },
              glosses: {
                type: 'array', items: {
                  type: 'object', additionalProperties: false, required: ['term', 'definition'],
                  properties: { term: { type: 'string' }, definition: { type: 'string' }, homeLanguage: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    },
    listen: {
      type: 'object', additionalProperties: false, required: ['script', 'segmentIndex', 'highlightLeadMs'],
      properties: {
        script: { type: 'string' },
        segmentIndex: { type: 'array', items: { type: 'integer', minimum: 0 } },
        highlightLeadMs: { type: 'integer', enum: [300] },
      },
    },
    watch: {
      type: 'object', additionalProperties: false, required: ['kind', 'steps', 'altText'],
      properties: {
        kind: { type: 'string', enum: ['diagram', 'sequence'] },
        altText: { type: 'string' },
        steps: {
          type: 'array', minItems: 1, items: {
            type: 'object', additionalProperties: false, required: ['caption', 'description'],
            properties: { caption: { type: 'string' }, description: { type: 'string' } },
          },
        },
      },
    },
    explore: {
      type: 'object', additionalProperties: false,
      properties: {
        timeline: {
          type: 'array', items: {
            type: 'object', additionalProperties: false, required: ['label', 'detail', 'order'],
            properties: { label: { type: 'string' }, detail: { type: 'string' }, order: { type: 'integer' } },
          },
        },
        data: {
          type: 'object', additionalProperties: false, required: ['caption', 'series'],
          properties: {
            caption: { type: 'string' },
            series: {
              type: 'array', items: {
                type: 'object', additionalProperties: false, required: ['name', 'points'],
                properties: {
                  name: { type: 'string' },
                  points: {
                    type: 'array', items: {
                      type: 'object', additionalProperties: false, required: ['x', 'y'],
                      properties: { x: { anyOf: [{ type: 'number' }, { type: 'string' }] }, y: { type: 'number' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    quiz: {
      type: 'object', additionalProperties: false, required: ['items'],
      properties: {
        items: {
          type: 'array', minItems: 1, items: {
            type: 'object', additionalProperties: false, required: ['kind', 'stem', 'options', 'explanation'],
            properties: {
              kind: { type: 'string', enum: ['recall', 'transfer'] },
              stem: { type: 'string' }, explanation: { type: 'string' },
              options: {
                type: 'array', minItems: 2, items: {
                  type: 'object', additionalProperties: false, required: ['text', 'correct', 'feedback'],
                  properties: { text: { type: 'string' }, correct: { type: 'boolean' }, feedback: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    },
  },
};

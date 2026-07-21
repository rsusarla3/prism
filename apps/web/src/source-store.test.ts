import { afterEach, describe, expect, it } from 'vitest';
import type { LearningAssetPayload, StudyBundle } from 'prism-shared';
import { SourceStore } from './source-store.js';

const stores: SourceStore[] = [];
function store() { const value = new SourceStore(':memory:'); stores.push(value); return value; }
afterEach(() => stores.splice(0).forEach((value) => value.close()));

const input = { url: 'https://example.com/lesson', title: 'Lesson', text: 'Source text', capturedAt: '2026-07-21T12:00:00.000Z' };
const bundle: StudyBundle = {
  meta: { title: 'Lesson', contentType: 'expository', inferredGrade: 6, conceptIds: [], language: 'en', droppedForCoherence: [] },
  read: { segments: [{ text: 'Source text', glosses: [], recap: 'Source text.' }] },
  listen: { script: 'You can review the source.', segmentIndex: [0], highlightLeadMs: 300 },
  watch: { kind: 'diagram', steps: [{ caption: 'Source', description: 'The source idea.' }], altText: 'A diagram of the source idea.' },
  explore: {},
  quiz: { items: [{ kind: 'transfer', stem: 'Where else?', options: [{ text: 'Here', correct: true, feedback: 'Yes.' }, { text: 'Nowhere', correct: false, feedback: 'Try applying it.' }], explanation: 'The idea transfers.' }] },
};

describe('SourceStore', () => {
  it('persists and lists captured sources', () => {
    const db = store();
    const [saved] = db.saveSources([input]);
    expect(saved.id).toMatch(/^src_/);
    expect(db.listSources()).toEqual([saved]);
  });

  it('updates a recaptured URL instead of creating a duplicate', () => {
    const db = store();
    const [first] = db.saveSources([input]);
    const [updated] = db.saveSources([{ ...input, title: 'Updated', text: 'New text' }]);
    expect(updated.id).toBe(first.id);
    expect(db.listSources()).toHaveLength(1);
    expect(db.listSources()[0].text).toBe('New text');
  });

  it('persists generated materials with their source metadata', () => {
    const db = store();
    const [source] = db.saveSources([input]);
    const material = db.saveMaterial(source, bundle);
    expect(db.listMaterials()).toEqual([material]);
  });

  it('caches one generated asset per source and kind', () => {
    const db = store();
    const [source] = db.saveSources([input]);
    const payload: LearningAssetPayload = { script: 'You can review the source.', segmentIndex: [0], highlightLeadMs: 300 };
    const saved = db.saveLearningAsset(source, 'listen', payload);
    expect(saved.cached).toBe(false);
    expect(db.getLearningAsset(source.id, 'listen')).toMatchObject({ payload, cached: true });
  });

  it('keeps cached assets when the same source text is captured again', () => {
    const db = store();
    const [source] = db.saveSources([input]);
    db.saveLearningAsset(source, 'listen', { script: 'You can review the source.', segmentIndex: [0], highlightLeadMs: 300 });
    db.saveSources([{ ...input, capturedAt: '2026-07-22T12:00:00.000Z' }]);
    expect(db.getLearningAsset(source.id, 'listen')).not.toBeNull();
  });

  it('caches generated figures and invalidates them when source text changes', () => {
    const db = store();
    const [source] = db.saveSources([input]);
    const saved = db.saveFigureAsset(source, {
      mimeType: 'image/png', dataBase64: 'aGVsbG8=', altText: 'A source-grounded figure.',
      model: 'gemini-image', promptVersion: 'v1',
    });
    expect(saved).toMatchObject({ dataUrl: 'data:image/png;base64,aGVsbG8=', cached: false });
    expect(db.getFigureAsset(source.id, 'gemini-image', 'v1')).toMatchObject({ cached: true });
    db.saveSources([{ ...input, text: 'Changed source text' }]);
    expect(db.getFigureAsset(source.id, 'gemini-image', 'v1')).toBeNull();
  });

});

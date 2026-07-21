import { describe, expect, it } from 'vitest';
import { buildConceptMap, connectedConcepts } from '../concept-map.js';

const analysis = {
  title: 'How photosynthesis works',
  summary: ['Photosynthesis stores light energy as chemical energy.'],
  sentences: [
    'Chlorophyll absorbs light energy inside chloroplasts.',
    'During photosynthesis, chloroplasts help plants form glucose and oxygen.',
    'Plants use glucose for growth and cellular respiration.',
  ],
  keyTerms: [
    { term: 'photosynthesis', count: 3, contexts: ['During photosynthesis, chloroplasts help plants form glucose and oxygen.'] },
    { term: 'chloroplasts', count: 2, contexts: ['Chlorophyll absorbs light energy inside chloroplasts.'] },
    { term: 'glucose', count: 2, contexts: ['Plants use glucose for growth and cellular respiration.'] },
    { term: 'light energy', count: 2, contexts: ['Chlorophyll absorbs light energy inside chloroplasts.'] },
  ],
};

describe('local concept map', () => {
  it('builds the same bounded map for the same local analysis', () => {
    const first = buildConceptMap(analysis);
    expect(buildConceptMap(analysis)).toEqual(first);
    expect(first.nodes).toHaveLength(4);
    expect(first.relations.length).toBeLessThanOrEqual(5);
  });

  it('connects concepts only when a source sentence supports the relation', () => {
    const map = buildConceptMap(analysis);
    const photosynthesis = map.nodes.find((node) => node.label === 'photosynthesis')!;
    const chloroplasts = map.nodes.find((node) => node.label === 'chloroplasts')!;
    const relation = map.relations.find((edge) =>
      [edge.from, edge.to].includes(photosynthesis.id) && [edge.from, edge.to].includes(chloroplasts.id));
    expect(relation?.evidence).toBe(analysis.sentences[1]);
    expect(map.relations.some((edge) => edge.evidence.includes('demo data'))).toBe(false);
  });

  it('returns connected nodes and evidence for interactive details', () => {
    const map = buildConceptMap(analysis);
    const chloroplasts = map.nodes.find((node) => node.label === 'chloroplasts')!;
    const connected = connectedConcepts(map, chloroplasts.id);
    expect(connected.neighbors.map((node) => node.label)).toEqual(expect.arrayContaining(['photosynthesis', 'light energy']));
    expect(connected.relations.every((relation) => analysis.sentences.includes(relation.evidence))).toBe(true);
  });

  it('keeps short pages usable without inventing a topic', () => {
    const map = buildConceptMap({ title: 'Short note', summary: [], keyTerms: [], sentences: [] });
    expect(map.nodes).toEqual([{ id: 'concept-0', label: 'Main idea', detail: 'Short note', count: 0 }]);
    expect(map.relations).toEqual([]);
  });
});

const DEFAULT_NODE_LIMIT = 6;
const DEFAULT_RELATION_LIMIT = 5;

function normalized(value) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

function containsTerm(sentence, term) {
  return normalized(sentence).toLocaleLowerCase().includes(normalized(term).toLocaleLowerCase());
}

/**
 * Builds a deterministic, source-grounded concept map from the extension's
 * existing local analysis. Every related edge is backed by a source sentence;
 * no model or network call is involved.
 */
export function buildConceptMap({ title = '', summary = [], keyTerms = [], sentences = [] } = {}, {
  maxNodes = DEFAULT_NODE_LIMIT,
  maxRelations = DEFAULT_RELATION_LIMIT,
} = {}) {
  const safeSummary = Array.isArray(summary) ? summary.filter(Boolean) : [];
  const safeSentences = Array.isArray(sentences) ? sentences.filter(Boolean) : [];
  const nodes = (Array.isArray(keyTerms) ? keyTerms : []).slice(0, maxNodes).map((term, index) => {
    const matchingSentence = safeSentences.find((sentence) => containsTerm(sentence, term.term));
    return {
      id: `concept-${index}`,
      label: normalized(term.term) || `Concept ${index + 1}`,
      detail: normalized(term.contexts?.[0] || matchingSentence || safeSummary[0] || title),
      count: Number.isFinite(term.count) ? term.count : 0,
    };
  });

  if (!nodes.length) {
    nodes.push({
      id: 'concept-0',
      label: 'Main idea',
      detail: normalized(safeSummary[0] || title || 'Not enough readable text was found.'),
      count: 0,
    });
  }

  const relations = [];
  for (let left = 0; left < nodes.length; left += 1) {
    for (let right = left + 1; right < nodes.length; right += 1) {
      const evidence = safeSentences.filter((sentence) =>
        containsTerm(sentence, nodes[left].label) && containsTerm(sentence, nodes[right].label));
      if (!evidence.length) continue;
      relations.push({
        id: `relation-${left}-${right}`,
        from: nodes[left].id,
        to: nodes[right].id,
        weight: evidence.length,
        evidence: normalized(evidence[0]),
      });
    }
  }

  relations.sort((a, b) => b.weight - a.weight || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

  return {
    title: normalized(title) || 'Current page',
    summary: normalized(safeSummary[0] || title || 'Main idea'),
    nodes,
    relations: relations.slice(0, maxRelations),
  };
}

export function connectedConcepts(map, nodeId) {
  const relations = map.relations.filter((relation) => relation.from === nodeId || relation.to === nodeId);
  const neighborIds = relations.map((relation) => relation.from === nodeId ? relation.to : relation.from);
  return {
    relations,
    neighbors: neighborIds.map((id) => map.nodes.find((node) => node.id === id)).filter(Boolean),
  };
}

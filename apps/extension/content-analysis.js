const STOP_WORDS = new Set(`
a an and are as at be been being but by can could did do does doing for from had has have having
he her hers herself him himself his how i if in into is it its itself may me might more most much
must my myself no nor not of on once only or other our ours ourselves out over own same she should
so some such than that the their theirs them themselves then there these they this those through to
too under until up very was we were what when where which while who whom why will with would you your
yours yourself yourselves about above after again against all am any because before below between
both down during each few further here off ought please via within without yes yet
click continue cookie cookies copyright home login menu next page previous privacy read register
search share sign site submit subscribe terms website welcome www
`.trim().split(/\s+/));

const SUFFIXES = [
  [/ies$/u, 'y'],
  [/ments?$/u, ''],
  [/ations?$/u, 'ate'],
  [/ing$/u, ''],
  [/ed$/u, ''],
  [/es$/u, ''],
  [/s$/u, ''],
];

export function normalizeText(value) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

export function splitSentences(text) {
  return normalizeText(text)
    .split(/(?<=[.!?])\s+(?=[\p{Lu}\d])/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 35 && sentence.length <= 520);
}

function tokenize(text) {
  return normalizeText(text)
    .match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.map((surface) => ({
      surface,
      lower: surface.toLocaleLowerCase(),
    })) ?? [];
}

function canonical(word) {
  let value = word.toLocaleLowerCase().replace(/[’']s$/u, '');
  if (value.length <= 4) return value;
  for (const [pattern, replacement] of SUFFIXES) {
    if (pattern.test(value)) {
      const candidate = value.replace(pattern, replacement);
      if (candidate.length >= 4) return candidate;
    }
  }
  return value;
}

function isUseful(token) {
  if (token.lower === 'ai') return true;
  if (token.lower.length < 3 || STOP_WORDS.has(token.lower)) return false;
  if (/^\d+(?:[.,]\d+)*$/u.test(token.lower)) return false;
  return /\p{L}/u.test(token.lower);
}

function addCandidate(map, key, surface, weight, context) {
  const current = map.get(key) ?? { surfaces: new Map(), count: 0, score: 0, contexts: [] };
  current.count += 1;
  current.score += weight;
  current.surfaces.set(surface, (current.surfaces.get(surface) ?? 0) + 1);
  if (context && current.contexts.length < 2 && !current.contexts.includes(context)) current.contexts.push(context);
  map.set(key, current);
}

function bestSurface(surfaces) {
  return [...surfaces.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]?.[0] ?? '';
}

/**
 * Ranks meaningful one- and two-word concepts. Frequency is only one signal:
 * headings, repeated phrases, and early appearances receive extra weight,
 * while stop words, UI boilerplate, pure numbers, and tiny tokens are removed.
 */
export function extractKeyTerms(text, { headings = [], limit = 12 } = {}) {
  const normalized = normalizeText(text);
  const sentences = splitSentences(normalized);
  const headingText = headings.map(normalizeText).join(' ').toLocaleLowerCase();
  const candidates = new Map();

  sentences.forEach((sentence, sentenceIndex) => {
    const useful = tokenize(sentence).filter(isUseful);
    useful.forEach((token) => {
      const key = canonical(token.lower);
      const headingBoost = headingText.includes(token.lower) ? 2.2 : 1;
      const positionBoost = sentenceIndex < 2 ? 1.25 : 1;
      addCandidate(candidates, key, token.surface, headingBoost * positionBoost, sentence);
    });
    for (let index = 0; index < useful.length - 1; index += 1) {
      const first = useful[index];
      const second = useful[index + 1];
      const key = `${canonical(first.lower)} ${canonical(second.lower)}`;
      const surface = `${first.surface} ${second.surface}`;
      const headingBoost = headingText.includes(surface.toLocaleLowerCase()) ? 2.4 : 1;
      addCandidate(candidates, key, surface, 2.1 * headingBoost, sentence);
    }
    for (let index = 0; index < useful.length - 2; index += 1) {
      const group = useful.slice(index, index + 3);
      const key = group.map((token) => canonical(token.lower)).join(' ');
      const surface = group.map((token) => token.surface).join(' ');
      const headingBoost = headingText.includes(surface.toLocaleLowerCase()) ? 2.6 : 1;
      addCandidate(candidates, key, surface, 3.2 * headingBoost, sentence);
    }
  });

  const entries = [...candidates.entries()]
    .filter(([key, value]) => !key.includes(' ') || value.count >= 2)
    .map(([key, value]) => ({
      key,
      term: bestSurface(value.surfaces),
      count: value.count,
      score: value.score + Math.log2(value.count + 1),
      contexts: value.contexts,
    }));

  const phraseRoots = new Set(entries.filter((entry) => entry.key.includes(' ')).flatMap((entry) => entry.key.split(' ')));
  const ranked = entries
    .map((entry) => ({ ...entry, score: entry.score + (entry.key.includes(' ') ? 2.5 : phraseRoots.has(entry.key) ? -1.2 : 0) }))
    .sort((a, b) => b.score - a.score || b.count - a.count || a.term.localeCompare(b.term));
  const selected = [];
  for (const entry of ranked) {
    const words = entry.key.split(' ');
    const overlaps = selected.some((chosen) => {
      const chosenWords = chosen.key.split(' ');
      const nested = words.every((word) => chosenWords.includes(word)) || chosenWords.every((word) => words.includes(word));
      const shared = words.filter((word) => chosenWords.includes(word)).length;
      const substantiallyOverlaps = shared / Math.min(words.length, chosenWords.length) >= 0.5;
      return (nested || substantiallyOverlaps) && chosen.count >= Math.max(2, entry.count * 0.6);
    });
    if (!overlaps) selected.push(entry);
    if (selected.length >= limit) break;
  }
  const repeated = selected.filter((entry) => entry.count >= 2);
  return (repeated.length >= 5 ? repeated : selected).slice(0, limit);
}

export function summarizeText(text, { limit = 4, headings = [] } = {}) {
  const sentences = splitSentences(text);
  if (sentences.length <= limit) return sentences;
  const terms = extractKeyTerms(text, { headings, limit: 10 });
  const ranked = sentences.map((sentence, index) => {
    const lower = sentence.toLocaleLowerCase();
    const conceptScore = terms.reduce((score, term) => score + (lower.includes(term.term.toLocaleLowerCase()) ? term.score : 0), 0);
    const positionScore = index === 0 ? 4 : index < 3 ? 2 : 0;
    const lengthPenalty = sentence.length > 330 ? 2 : 0;
    return { sentence, index, score: conceptScore + positionScore - lengthPenalty };
  });
  return ranked.sort((a, b) => b.score - a.score).slice(0, limit).sort((a, b) => a.index - b.index).map((item) => item.sentence);
}

export function createLocalQuiz(text, { limit = 5, headings = [] } = {}) {
  const terms = extractKeyTerms(text, { headings, limit: 14 });
  const sentences = splitSentences(text);
  const items = [];
  for (const term of terms) {
    if (items.length >= limit) break;
    const sentence = sentences.find((candidate) => candidate.toLocaleLowerCase().includes(term.term.toLocaleLowerCase()));
    if (!sentence) continue;
    const distractors = terms.filter((candidate) => candidate.key !== term.key).slice(items.length, items.length + 3);
    if (distractors.length < 2) continue;
    const escaped = term.term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const stem = sentence.replace(new RegExp(escaped, 'iu'), '_____');
    const options = [term, ...distractors].map((candidate) => ({
      text: candidate.term,
      correct: candidate.key === term.key,
      feedback: candidate.key === term.key ? `Yes — the page uses “${term.term}” in this context.` : `Not here. Re-read the sentence and compare it with “${term.term}.”`,
    }));
    const rotation = items.length % options.length;
    items.push({
      kind: items.length === limit - 1 ? 'transfer' : 'recall',
      stem: `Which key term completes this idea? “${stem}”`,
      options: [...options.slice(rotation), ...options.slice(0, rotation)],
      explanation: sentence,
    });
  }
  return items;
}

export function analyzeContent(text, { headings = [] } = {}) {
  const normalized = normalizeText(text);
  return {
    text: normalized,
    wordCount: tokenize(normalized).length,
    sentences: splitSentences(normalized),
    summary: summarizeText(normalized, { headings }),
    keyTerms: extractKeyTerms(normalized, { headings }),
  };
}

export { STOP_WORDS };

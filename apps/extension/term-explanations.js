import { normalizeText, splitSentences } from './content-analysis.js';

const WIKIPEDIA_LANGUAGES = new Set(['en', 'zh', 'hi', 'es', 'fr', 'ar', 'bn', 'pt', 'ru', 'ur']);

const FALLBACK_DEFINITIONS = new Map([
  ['artificial intelligence', 'Computer systems designed to perform tasks that usually require human intelligence.'],
  ['compound interest', 'Growth earned on both the original amount and the growth already added.'],
  ['labor force', 'People who are working or actively looking for work.'],
  ['labor market', 'The system in which employers seek workers and people seek jobs.'],
  ['labor shortage', 'A situation in which employers need more workers than are available.'],
  ['baby boomers', 'The generation born during the large rise in births after World War II.'],
  ['wage growth', 'An increase in the amount workers are paid over time.'],
]);

export function fallbackTermExplanation(term, contexts = [], language = 'en') {
  const cleanTerm = normalizeText(term);
  const known = language === 'en' ? FALLBACK_DEFINITIONS.get(cleanTerm.toLocaleLowerCase()) : undefined;
  if (known) return known;

  for (const context of contexts) {
    const sentence = normalizeText(context);
    const escaped = cleanTerm.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const direct = sentence.match(new RegExp(`${escaped}\\s+(?:is|are|means|refers to|describes)\\s+([^.!?]{12,220})`, 'iu'));
    if (direct?.[1]) return `${cleanTerm} means ${direct[1].trim()}.`;
  }

  return `${cleanTerm} is a central concept in this page. Its exact meaning depends on the subject and how the author uses it.`;
}
function usableWikipediaExtract(payload) {
  if (!payload || typeof payload !== 'object' || payload.type === 'disambiguation') return '';
  const extract = normalizeText(payload.extract);
  if (!extract || extract.length < 20) return '';
  return splitSentences(extract, payload.lang || 'en').slice(0, 2).join(' ') || extract;
}

async function fetchSummary(title, language, fetcher) {
  const endpoint = `https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/\s+/gu, '_'))}`;
  const response = await fetcher(endpoint, { headers: { accept: 'application/json' } });
  if (!response.ok) return '';
  return usableWikipediaExtract(await response.json());
}

export async function explainTerm(term, { contexts = [], language = 'en', fetcher = globalThis.fetch } = {}) {
  const cleanTerm = normalizeText(term);
  const baseLanguage = String(language).split('-')[0];
  const wikiLanguage = WIKIPEDIA_LANGUAGES.has(baseLanguage) ? baseLanguage : 'en';
  if (typeof fetcher === 'function') {
    try {
      const direct = await fetchSummary(cleanTerm, wikiLanguage, fetcher);
      if (direct) return { definition: direct, source: 'Wikipedia' };

      const searchUrl = `https://${wikiLanguage}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanTerm)}&srlimit=1&format=json&origin=*`;
      const searchResponse = await fetcher(searchUrl, { headers: { accept: 'application/json' } });
      if (searchResponse.ok) {
        const search = await searchResponse.json();
        const title = search?.query?.search?.[0]?.title;
        if (title) {
          const searched = await fetchSummary(title, wikiLanguage, fetcher);
          if (searched) return { definition: searched, source: 'Wikipedia' };
        }
      }
    } catch { /* Keep the feature useful while offline. */ }
  }
  return { definition: fallbackTermExplanation(cleanTerm, contexts, wikiLanguage), source: 'Prism local explanation' };
}

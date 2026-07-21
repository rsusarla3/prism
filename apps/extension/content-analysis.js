const ENGLISH_STOP_WORDS = new Set(`
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

const SPANISH_STOP_WORDS = new Set(`
a al algo algunas algunos ante antes como con contra cual cuando de del desde donde durante e el
ella ellas ellos en entre era es esa esas ese esos esta estaba estan estar este esto estos fue ha
hacia hasta hay la las le les lo los mas me mi mis muy no nos o para pero por porque que quien se
sin sobre son su sus te tiene todo tu tus un una uno unas unos y ya
clic continuar cookies derechos inicio iniciar menu pagina privacidad buscar compartir sitio
suscribir terminos
`.trim().split(/\s+/));

const FRENCH_STOP_WORDS = new Set(`
a au aux avec ce ces comme dans de des du elle en et eux il je la le les leur lui mais me meme mes
moi mon ne nos notre nous on ou par pas pour qu que quelle qui sa se ses son sur ta te tes toi ton
tu un une vos votre vous y est sont etre plus
accueil chercher cliquer confidentialité continuer menu partager site termes
`.trim().split(/\s+/));

const PORTUGUESE_STOP_WORDS = new Set(`a ao aos as com como da das de do dos e ela ele em entre era essa esse esta eu foi mais mas me meu minha muito na nao nas no nos o os ou para pela pelo por porque que se sem ser seu sua tem um uma voce`.split(/\s+/));
const RUSSIAN_STOP_WORDS = new Set(`а без более бы был была были было быть в вам вас весь во вот все всего вы да для до его ее если есть еще же за и из или им их к как ко когда кто ли либо мне может мы на над не него нее нет ни но ну о об от по под при про с со так также то того тоже только тут ты у уже что чтобы эта эти это я`.split(/\s+/));
const ARABIC_STOP_WORDS = new Set(`أو أي إذا إلى أن أنا أنت أكثر التي الذي الذين على عن في كان كانت كل كما لا لم لن ما مع من هو هي هذا هذه هناك و يا`.split(/\s+/));
const HINDI_STOP_WORDS = new Set(`और अगर अब आप इस इसका इसे एक ऐसे का कि की के को गया घर जब जो तक तो था थी थे द्वारा न नहीं पर पहले फिर बहुत में या यह ये लिए वह से है हैं हो`.split(/\s+/));
const BENGALI_STOP_WORDS = new Set(`ও একটি এই এর এখন এমন এক করা করে কে কি কিন্তু জন্য তার থেকে না পর বা মধ্যে যে সব সে সঙ্গে হয়`.split(/\s+/));
const URDU_STOP_WORDS = new Set(`اور اگر اب آپ اس ایک ایسے کا کی کے کو جو تک تو تھا تھی تھے نہیں پر پھر بہت میں یا یہ لیے وہ سے ہے ہیں ہو`.split(/\s+/));

const STOP_WORDS_BY_LANGUAGE = {
  en: ENGLISH_STOP_WORDS,
  es: SPANISH_STOP_WORDS,
  fr: FRENCH_STOP_WORDS,
  pt: PORTUGUESE_STOP_WORDS,
  ru: RUSSIAN_STOP_WORDS,
  ar: ARABIC_STOP_WORDS,
  hi: HINDI_STOP_WORDS,
  bn: BENGALI_STOP_WORDS,
  ur: URDU_STOP_WORDS,
};

const SUPPORTED_LANGUAGES = new Set(['en', 'zh', 'hi', 'es', 'fr', 'ar', 'bn', 'pt', 'ru', 'ur']);

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

export function splitSentences(text, language = 'en') {
  const normalized = normalizeText(text);
  const pieces = typeof Intl?.Segmenter === 'function'
    ? [...new Intl.Segmenter(language, { granularity: 'sentence' }).segment(normalized)].map(({ segment }) => segment)
    : normalized.split(/(?<=[.!?。！？])\s*/u);
  return pieces
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 20 && sentence.length <= 520);
}

function tokenize(text, language = 'en') {
  const normalized = normalizeText(text);
  if (typeof Intl?.Segmenter === 'function') {
    return [...new Intl.Segmenter(language, { granularity: 'word' }).segment(normalized)]
      .filter(({ isWordLike }) => isWordLike)
      .map(({ segment: surface }) => ({ surface, lower: surface.toLocaleLowerCase() }));
  }
  return normalized.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.map((surface) => ({
      surface,
      lower: surface.toLocaleLowerCase(),
    })) ?? [];
}

function canonical(word, language = 'en') {
  let value = word.toLocaleLowerCase().replace(/[’']s$/u, '');
  if (language !== 'en') return value;
  if (value.length <= 4) return value;
  for (const [pattern, replacement] of SUFFIXES) {
    if (pattern.test(value)) {
      const candidate = value.replace(pattern, replacement);
      if (candidate.length >= 4) return candidate;
    }
  }
  return value;
}

function isUseful(token, stopWords, language = 'en') {
  if (token.lower === 'ai') return true;
  const minimumLength = language === 'zh' ? 1 : 3;
  if (token.lower.length < minimumLength || stopWords.has(token.lower)) return false;
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
export function normalizeLanguage(value) {
  const language = String(value ?? '').trim().toLocaleLowerCase().split(/[-_]/u)[0];
  return SUPPORTED_LANGUAGES.has(language) ? language : 'en';
}

export function detectLanguage(text, hint = '') {
  const hinted = String(hint ?? '').trim().toLocaleLowerCase().split(/[-_]/u)[0];
  if (SUPPORTED_LANGUAGES.has(hinted)) return hinted;
  if (/\p{Script=Han}/u.test(text)) return 'zh';
  if (/\p{Script=Devanagari}/u.test(text)) return 'hi';
  if (/\p{Script=Bengali}/u.test(text)) return 'bn';
  if (/\p{Script=Cyrillic}/u.test(text)) return 'ru';
  if (/\p{Script=Arabic}/u.test(text)) return 'ar';
  const words = tokenize(text).map((token) => token.lower);
  const scores = Object.entries(STOP_WORDS_BY_LANGUAGE).map(([language, stopWords]) => ({
    language,
    score: words.reduce((total, word) => total + (stopWords.has(word) ? 1 : 0), 0),
  }));
  return scores.sort((a, b) => b.score - a.score)[0]?.language ?? 'en';
}

export function extractKeyTerms(text, { headings = [], limit = 12, language = '' } = {}) {
  const normalized = normalizeText(text);
  const resolvedLanguage = detectLanguage(normalized, language);
  const stopWords = STOP_WORDS_BY_LANGUAGE[resolvedLanguage] ?? ENGLISH_STOP_WORDS;
  const sentences = splitSentences(normalized, resolvedLanguage);
  const headingText = headings.map(normalizeText).join(' ').toLocaleLowerCase();
  const candidates = new Map();

  sentences.forEach((sentence, sentenceIndex) => {
    const useful = tokenize(sentence, resolvedLanguage).filter((token) => isUseful(token, stopWords, resolvedLanguage));
    useful.forEach((token) => {
      const key = canonical(token.lower, resolvedLanguage);
      const headingBoost = headingText.includes(token.lower) ? 2.2 : 1;
      const positionBoost = sentenceIndex < 2 ? 1.25 : 1;
      addCandidate(candidates, key, token.surface, headingBoost * positionBoost, sentence);
    });
    for (let index = 0; index < useful.length - 1; index += 1) {
      const first = useful[index];
      const second = useful[index + 1];
      const key = `${canonical(first.lower, resolvedLanguage)} ${canonical(second.lower, resolvedLanguage)}`;
      const surface = `${first.surface} ${second.surface}`;
      const headingBoost = headingText.includes(surface.toLocaleLowerCase()) ? 2.4 : 1;
      addCandidate(candidates, key, surface, 2.1 * headingBoost, sentence);
    }
    for (let index = 0; index < useful.length - 2; index += 1) {
      const group = useful.slice(index, index + 3);
      const key = group.map((token) => canonical(token.lower, resolvedLanguage)).join(' ');
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

export function summarizeText(text, { limit = 4, headings = [], language = '' } = {}) {
  const resolvedLanguage = detectLanguage(text, language);
  const sentences = splitSentences(text, resolvedLanguage);
  if (sentences.length <= limit) return sentences;
  const terms = extractKeyTerms(text, { headings, limit: 10, language: resolvedLanguage });
  const ranked = sentences.map((sentence, index) => {
    const lower = sentence.toLocaleLowerCase();
    const conceptScore = terms.reduce((score, term) => score + (lower.includes(term.term.toLocaleLowerCase()) ? term.score : 0), 0);
    const positionScore = index === 0 ? 4 : index < 3 ? 2 : 0;
    const lengthPenalty = sentence.length > 330 ? 2 : 0;
    return { sentence, index, score: conceptScore + positionScore - lengthPenalty };
  });
  return ranked.sort((a, b) => b.score - a.score).slice(0, limit).sort((a, b) => a.index - b.index).map((item) => item.sentence);
}

export function createLocalQuiz(text, { limit = 5, headings = [], language = '' } = {}) {
  const resolvedLanguage = detectLanguage(text, language);
  const terms = extractKeyTerms(text, { headings, limit: 14, language: resolvedLanguage });
  const sentences = splitSentences(text, resolvedLanguage);
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

export function analyzeContent(text, { headings = [], language = '' } = {}) {
  const normalized = normalizeText(text);
  const resolvedLanguage = detectLanguage(normalized, language);
  return {
    text: normalized,
    language: resolvedLanguage,
    wordCount: tokenize(normalized, resolvedLanguage).length,
    sentences: splitSentences(normalized, resolvedLanguage),
    summary: summarizeText(normalized, { headings, language: resolvedLanguage }),
    keyTerms: extractKeyTerms(normalized, { headings, language: resolvedLanguage }),
  };
}

export { ENGLISH_STOP_WORDS as STOP_WORDS, STOP_WORDS_BY_LANGUAGE };

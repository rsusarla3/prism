import { analyzeContent, createLocalQuiz } from './content-analysis.js';
import { DEFAULT_API_BASE, normalizeApiBase } from './config.js';
import { redactSensitiveText } from './privacy.js';

let apiBase = DEFAULT_API_BASE;
const app = document.querySelector('#app');
const WAYS = [
  { id: 'summarize', label: 'Summarize', hint: 'The page in a few clear points', color: 'var(--ray-1)', run: showSummary },
  { id: 'quiz', label: 'Quiz me', hint: 'Answer first, then see why', color: 'var(--ray-2)', run: showQuiz },
  { id: 'terms', label: 'Key terms', hint: 'The concepts that matter most', color: 'var(--ray-3)', run: showKeyTerms },
  { id: 'visualize', label: 'Visualize', hint: 'One map of the whole idea', color: 'var(--ray-4)', run: showVisualize },
  { id: 'listen', label: 'Listen', hint: 'Read aloud at your pace', color: 'var(--ray-5)', run: showListen },
];
const RAY_Y = [30, 62, 94, 126, 158];
const OUTPUT_LANGUAGES = [
  ['source', 'Page language'], ['en', 'English'], ['zh', 'Mandarin Chinese'],
  ['hi', 'Hindi'], ['es', 'Spanish'], ['fr', 'French'], ['ar', 'Arabic'],
  ['bn', 'Bengali'], ['pt', 'Portuguese'], ['ru', 'Russian'], ['ur', 'Urdu'],
];

let page = null;
let pageSource = null;
let analysis = null;
let storedSourceId = null;
let outputLanguage = 'source';
const translatorCache = new Map();

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function truncate(value, limit) {
  const text = String(value ?? '').trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}…` : text;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isRestricted(url) {
  return !url || /^(chrome|edge|about|devtools|chrome-extension|moz-extension):/.test(url);
}

async function readPageMeta() {
  const tab = await activeTab();
  if (!tab || isRestricted(tab.url)) return { restricted: true, url: tab?.url || '', title: tab?.title || '', headings: [] };
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      language: document.documentElement.lang || navigator.language || '',
      headings: [...document.querySelectorAll('h1,h2,h3')]
        .map((heading) => (heading.textContent || '').replace(/\s+/g, ' ').trim())
        .filter((heading) => heading.length > 3 && heading.length < 160)
        .slice(0, 10),
    }),
  });
  return { ...result.result, restricted: false, url: tab.url, title: tab.title || '' };
}

async function captureSource() {
  const stored = await chrome.storage.session.get(['selection', 'pendingContext']);
  const selected = stored.selection || stored.pendingContext;
  if (selected?.text && selected.pageUrl && selected.pageUrl === page?.url) {
    return {
      url: selected.pageUrl,
      title: selected.pageTitle || page?.title || 'Selected page text',
      text: selected.text,
      language: page?.language || '',
      capturedAt: new Date(selected.capturedAt || Date.now()).toISOString(),
    };
  }
  const result = await chrome.runtime.sendMessage({ type: 'capture-active-tab' });
  if (result?.error) throw new Error(result.error);
  if (!result?.source) throw new Error('Prism could not capture this page.');
  return result.source;
}

async function ensureSource() {
  if (!pageSource) pageSource = await captureSource();
  if (!analysis) analysis = analyzeContent(pageSource.text, { headings: page?.headings || [], language: pageSource.language || page?.language || '' });
  return pageSource;
}

async function ensureStoredSource() {
  const source = await ensureSource();
  if (storedSourceId) return storedSourceId;
  const redacted = redactSensitiveText(source.text);
  const saved = await post('/api/sources/capture', {
    sources: [{ ...source, text: redacted.text, redactions: redacted.findings }],
  });
  storedSourceId = saved.sources?.[0]?.id;
  if (!storedSourceId) throw new Error('Prism could not save this page.');
  return storedSourceId;
}

async function requestGeneratedAsset(kind) {
  const sourceId = await ensureStoredSource();
  return post(`/api/sources/${encodeURIComponent(sourceId)}/assets/${kind}`, {
    homeLanguage: outputLanguage === 'source' ? undefined : outputLanguage,
  });
}

async function post(path, body) {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Prism server returned ${response.status}.`);
  return data;
}

function prismSvg() {
  const rays = WAYS.map((way, index) => `<path class="ray" data-ray="${way.id}" stroke="${way.color}" d="M 140 96 L 306 ${RAY_Y[index]}"/>`).join('');
  return `<svg class="scene" viewBox="0 0 320 190" role="img" aria-label="The current page entering a prism and refracting into five ways to learn it.">
    <path class="in" d="M 12 92 L 105 92"/><path class="spark" d="M 12 92 L 105 92"/>
    <path class="side" d="M 122 38 L 136 30 L 168 132 L 154 140 Z"/>
    <path class="base" d="M 90 140 L 104 132 L 168 132 L 154 140 Z"/>
    <path class="face" d="M 122 38 L 154 140 L 90 140 Z"/><path class="internal" d="M 105 92 L 140 96"/>${rays}</svg>`;
}

function sourceBlock() {
  const host = page?.restricted ? 'this page is protected' : safeHost(page?.url);
  return `<p class="eyebrow">The page you're on</p>
    <div class="source"><span class="dot"></span><span class="url">${esc(host)}</span></div>
    <p class="subtle">${esc(page?.title || pageSource?.title || '')}</p>`;
}

function safeHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'web page'; }
}

function languageName(code) {
  return OUTPUT_LANGUAGES.find(([value]) => value === code)?.[1] ?? code;
}

async function translateValues(values) {
  const sourceLanguage = analysis?.language || pageSource?.language || page?.language || 'en';
  const targetLanguage = outputLanguage === 'source' ? sourceLanguage : outputLanguage;
  if (targetLanguage === sourceLanguage || outputLanguage === 'source') return { values, note: '' };
  try {
    if (!('Translator' in globalThis)) throw new Error('On-device translation is unavailable.');
    const key = `${sourceLanguage}:${targetLanguage}`;
    let translator = translatorCache.get(key);
    if (!translator) {
      const availability = await globalThis.Translator.availability({ sourceLanguage, targetLanguage });
      if (availability === 'unavailable') throw new Error('This on-device language pair is unavailable.');
      translator = await globalThis.Translator.create({ sourceLanguage, targetLanguage });
      translatorCache.set(key, translator);
    }
    const translated = [];
    for (const value of values) translated.push(await translator.translate(String(value ?? '')));
    return { values: translated, note: `Translated on-device to ${languageName(targetLanguage)}.` };
  } catch (browserError) {
    try {
      const translated = await post('/api/translate', { texts: values, sourceLanguage, targetLanguage });
      if (Array.isArray(translated.texts) && translated.texts.length === values.length) {
        return { values: translated.texts, note: `Translated by the configured Prism engine to ${languageName(targetLanguage)}.` };
      }
    } catch { /* Preserve the original result below. */ }
    return { values, note: `${languageName(targetLanguage)} needs an on-device language pack or configured translation engine; showing the page language.` };
  }
}

function renderHome() {
  speechSynthesis?.cancel?.();
  if (page?.restricted) {
    app.innerHTML = `${sourceBlock()}<div class="out"><p class="err">Prism cannot read this browser-protected page. Open an article or assignment and try again.</p></div>`;
    return;
  }
  const readiness = analysis ? `${analysis.wordCount.toLocaleString()} words analyzed` : 'Ready to analyze';
  app.innerHTML = `${sourceBlock()}${prismSvg()}<div class="ready"><span></span>${esc(readiness)}</div>
    <label class="language-picker">Show results in<select id="output-language">${OUTPUT_LANGUAGES.map(([value, label]) => `<option value="${value}" ${value === outputLanguage ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label>
    <p class="eyebrow">Choose a learning mode</p>
    <div class="ways">${WAYS.map((way) => `<button class="way" data-way="${way.id}"><span class="bar" style="background:${way.color}"></span><span class="txt"><b>${esc(way.label)}</b><span>${esc(way.hint)}</span></span></button>`).join('')}</div>
    <p class="note">Only this active page or the text you selected is analyzed.</p>`;
  bindWays();
  document.querySelector('#output-language')?.addEventListener('change', async (event) => {
    outputLanguage = event.target.value;
    await chrome.storage.local.set({ outputLanguage });
  });
}

function bindWays() {
  document.querySelectorAll('[data-way]').forEach((button) => {
    const way = WAYS.find((candidate) => candidate.id === button.dataset.way);
    button.addEventListener('mouseenter', () => highlightRay(way.id));
    button.addEventListener('mouseleave', () => highlightRay(null));
    button.addEventListener('focus', () => highlightRay(way.id));
    button.addEventListener('blur', () => highlightRay(null));
    button.addEventListener('click', () => void way.run());
  });
}

function highlightRay(id) {
  document.querySelectorAll('[data-ray]').forEach((ray) => {
    ray.classList.toggle('on', id !== null && ray.dataset.ray === id);
    ray.classList.toggle('dim', id !== null && ray.dataset.ray !== id);
  });
}

function renderLoading(label) {
  app.innerHTML = `${sourceBlock()}<div class="loading"><i></i><p>${esc(label)}</p></div>`;
}

function finishResult(html, note = '') {
  app.innerHTML = `${sourceBlock()}<div class="out">${html}</div>${note ? `<p class="note">${esc(note)}</p>` : ''}`;
  app.append(backButton());
}

function backButton() {
  const button = document.createElement('button');
  button.className = 'back';
  button.textContent = '← Back to the five modes';
  button.onclick = renderHome;
  return button;
}

async function showSummary() {
  renderLoading('Finding the signal…');
  await ensureSource();
  let points = analysis.summary;
  let source = 'Instant extractive summary';
  try {
    const asset = await requestGeneratedAsset('read');
    points = asset.payload.segments.map((segment) => segment.recap || segment.text);
    source = asset.cached ? 'Saved AI-refined summary' : 'AI-refined summary';
  } catch { /* The local summary is the zero-key, offline-safe path. */ }
  const translated = await translateValues(points);
  points = translated.values;
  finishResult(`<div class="result-head"><span>Summarize</span><small>${esc(source)}</small></div>
    <h3>${esc(pageSource.title)}</h3><div class="summary-points">${points.map((point, index) => `<p data-summary="${index}"><b>${index + 1}</b>${esc(point)}</p>`).join('')}</div>
    <div class="segmented" role="group" aria-label="Summary length"><button data-length="2">Short</button><button class="active" data-length="4">Standard</button><button data-length="99">All</button></div>`, translated.note || `${analysis.wordCount.toLocaleString()} source words distilled into ${points.length} points.`);
  document.querySelectorAll('[data-length]').forEach((button) => button.addEventListener('click', () => {
    const limit = Number(button.dataset.length);
    document.querySelectorAll('[data-summary]').forEach((point) => { point.hidden = Number(point.dataset.summary) >= limit; });
    document.querySelectorAll('[data-length]').forEach((candidate) => candidate.classList.toggle('active', candidate === button));
  }));
}

async function showQuiz() {
  renderLoading('Building questions from this page…');
  await ensureSource();
  let items = createLocalQuiz(pageSource.text, { headings: page.headings, language: analysis.language, limit: 5 });
  let source = 'Instant source-based quiz';
  try {
    const asset = await requestGeneratedAsset('quiz');
    items = asset.payload.items;
    source = asset.cached ? 'Saved AI-refined quiz' : 'AI-refined quiz';
  } catch { /* Keep the deterministic quiz. */ }
  const quizCopy = items.flatMap((item) => [item.stem, item.explanation, ...item.options.flatMap((option) => [option.text, option.feedback])]);
  const translatedQuiz = await translateValues(quizCopy);
  let copyIndex = 0;
  items = items.map((item) => ({ ...item,
    stem: translatedQuiz.values[copyIndex++], explanation: translatedQuiz.values[copyIndex++],
    options: item.options.map((option) => ({ ...option, text: translatedQuiz.values[copyIndex++], feedback: translatedQuiz.values[copyIndex++] })),
  }));
  if (!items.length) return finishResult('<h3>Quiz me</h3><p>Prism needs a little more readable text to build questions.</p>');
  finishResult(`<div class="result-head"><span>Quiz me</span><small>${esc(source)}</small></div><div class="quiz-list">${items.map((item, questionIndex) => `
    <section class="quiz-item" data-question="${questionIndex}"><p class="question-count">${questionIndex + 1} / ${items.length}</p><h3>${esc(item.stem)}</h3>
      <div class="quiz-options">${item.options.map((option, optionIndex) => `<button data-option="${optionIndex}" data-correct="${option.correct}">${esc(option.text)}</button>`).join('')}</div>
      <div class="quiz-feedback" hidden></div><p class="quiz-explanation" hidden>${esc(item.explanation)}</p></section>`).join('')}</div>`, translatedQuiz.note || 'Answers and explanations stay hidden until you attempt each question.');
  document.querySelectorAll('.quiz-item').forEach((card) => {
    card.querySelectorAll('[data-option]').forEach((button) => button.addEventListener('click', () => {
      if (card.dataset.answered) return;
      card.dataset.answered = 'true';
      const item = items[Number(card.dataset.question)];
      const option = item.options[Number(button.dataset.option)];
      card.querySelectorAll('[data-option]').forEach((candidate) => {
        candidate.disabled = true;
        if (candidate.dataset.correct === 'true') candidate.classList.add('correct');
      });
      button.classList.add(option.correct ? 'correct' : 'wrong');
      const feedback = card.querySelector('.quiz-feedback');
      feedback.hidden = false;
      feedback.textContent = option.feedback;
      card.querySelector('.quiz-explanation').hidden = false;
    }));
  });
}

async function showKeyTerms() {
  renderLoading('Filtering noise and ranking concepts…');
  await ensureSource();
  const translatedTerms = await translateValues(analysis.keyTerms.flatMap((term) => [term.term, term.contexts[0] || '']));
  let termCopyIndex = 0;
  const terms = analysis.keyTerms.map((term) => ({ ...term, term: translatedTerms.values[termCopyIndex++], contexts: [translatedTerms.values[termCopyIndex++], ...term.contexts.slice(1)] }));
  finishResult(`<div class="result-head"><span>Key terms</span><small>Frequency + relevance</small></div>
    <h3>${terms.length ? 'What this page keeps coming back to' : 'Not enough terms yet'}</h3>
    <div class="term-grid">${terms.map((term, index) => `<button class="term" data-term="${index}"><span>${esc(term.term)}</span><b>${term.count}×</b></button>`).join('')}</div>
    <div class="term-context" id="term-context">Choose a term to see it in context.</div>`, translatedTerms.note || 'Common filler and interface words are removed; repeated phrases and heading terms rank higher.');
  document.querySelectorAll('[data-term]').forEach((button) => button.addEventListener('click', () => {
    const term = terms[Number(button.dataset.term)];
    document.querySelectorAll('[data-term]').forEach((candidate) => candidate.classList.toggle('active', candidate === button));
    document.querySelector('#term-context').innerHTML = `<b>${esc(term.term)}</b><p>${esc(term.contexts[0] || 'No additional context found.')}</p>`;
  }));
}

async function showVisualize() {
  renderLoading('Drawing the relationships…');
  await ensureSource();
  let nodes = analysis.keyTerms.slice(0, 6).map((term) => ({ label: term.term, detail: term.contexts[0] || '' }));
  let source = 'Generated locally from ranked concepts';
  try {
    const asset = await requestGeneratedAsset('watch');
    nodes = asset.payload.steps.slice(0, 6).map((step) => ({ label: step.caption, detail: step.description }));
    source = asset.cached ? 'Saved AI-refined visual plan' : 'AI-refined visual plan';
  } catch { /* The deterministic concept map remains available. */ }
  const visualCopy = await translateValues([pageSource.title, analysis.summary[0] || pageSource.title, ...nodes.map((node) => node.label)]);
  const visualTitle = visualCopy.values[0];
  const visualSummary = visualCopy.values[1];
  nodes = nodes.map((node, index) => ({ ...node, label: visualCopy.values[index + 2] }));
  const svg = conceptMapSvg(visualTitle, nodes, visualSummary);
  finishResult(`<div class="result-head"><span>Visualize</span><small>${esc(source)}</small></div>${svg}
    <p class="visual-caption">${esc(visualSummary)}</p><button class="fig" id="download-visual">Download SVG</button>`, visualCopy.note || 'One coherent concept map is created from this page—not a generic stock image.');
  document.querySelector('#download-visual')?.addEventListener('click', () => downloadSvg(document.querySelector('.concept-map').outerHTML));
}

function conceptMapSvg(title, nodes, summary = '') {
  const positions = [[160,38],[258,82],[250,172],[160,212],[70,172],[62,82]];
  const safeNodes = nodes.length ? nodes : [{ label: 'Main idea', detail: '' }];
  return `<svg class="concept-map" viewBox="0 0 320 250" role="img" aria-label="Concept map for ${esc(title)}">
    <defs><linearGradient id="map-center" x1="0" x2="1"><stop stop-color="#ff9f45"/><stop offset="1" stop-color="#a06bff"/></linearGradient></defs>
    ${safeNodes.map((node, index) => `<path d="M160 125 L${positions[index % positions.length][0]} ${positions[index % positions.length][1]}"/>`).join('')}
    <rect class="map-center" x="93" y="96" width="134" height="58" rx="16"/><text class="map-title" x="160" y="121">${esc(truncate(title, 26))}</text><text class="map-title small" x="160" y="139">${esc(truncate(summary || 'Main idea', 38))}</text>
    ${safeNodes.map((node, index) => { const [x,y]=positions[index % positions.length]; return `<g><rect x="${x-51}" y="${y-18}" width="102" height="36" rx="12"/><text x="${x}" y="${y+4}">${esc(truncate(node.label, 18))}</text></g>`; }).join('')}
  </svg>`;
}

function downloadSvg(svg) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'prism-visual.svg';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function showListen() {
  renderLoading('Preparing the reader…');
  await ensureSource();
  let narrated = analysis.summary.join(' ');
  let source = 'Browser voice · no API key';
  try {
    const asset = await requestGeneratedAsset('listen');
    narrated = asset.payload.script;
    source = asset.cached ? 'Saved AI-refined narration' : 'AI-refined narration';
  } catch { /* Browser speech still reads the source. */ }
  const listenCopy = await translateValues([analysis.summary.join(' '), pageSource.text, narrated]);
  finishResult(`<div class="result-head"><span>Listen</span><small>${esc(source)}</small></div><h3>${esc(pageSource.title)}</h3>
    <div class="listen-controls"><label>Read<select id="listen-scope"><option value="summary">Summary</option><option value="article">Full page</option><option value="narration">Narration</option></select></label>
      <label>Speed<select id="listen-rate"><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label>
      <label>Voice<select id="listen-voice"></select></label></div>
    <div class="transport"><button class="fig" id="listen-play">▶ Play</button><button class="fig" id="listen-pause">Ⅱ Pause</button><button class="fig" id="listen-stop">■ Stop</button></div>
    <p class="voice-status" id="voice-status">Ready.</p>`, listenCopy.note || 'Playback stays on your device.');
  bindSpeech({ summary: listenCopy.values[0], article: listenCopy.values[1], narration: listenCopy.values[2] });
}

function bindSpeech(copy) {
  const voiceSelect = document.querySelector('#listen-voice');
  const loadVoices = () => {
    const voices = speechSynthesis.getVoices();
    voiceSelect.innerHTML = voices.map((voice, index) => `<option value="${index}">${esc(voice.name)} · ${esc(voice.lang)}</option>`).join('');
  };
  loadVoices();
  speechSynthesis.addEventListener?.('voiceschanged', loadVoices, { once: true });
  document.querySelector('#listen-play').onclick = () => {
    speechSynthesis.cancel();
    const scope = document.querySelector('#listen-scope').value;
    const utterance = new SpeechSynthesisUtterance(copy[scope]);
    utterance.rate = Number(document.querySelector('#listen-rate').value);
    const voices = speechSynthesis.getVoices();
    utterance.voice = voices[Number(voiceSelect.value)] || null;
    utterance.onstart = () => { document.querySelector('#voice-status').textContent = 'Playing…'; };
    utterance.onend = () => { document.querySelector('#voice-status').textContent = 'Finished.'; };
    speechSynthesis.speak(utterance);
  };
  document.querySelector('#listen-pause').onclick = () => {
    if (speechSynthesis.paused) { speechSynthesis.resume(); document.querySelector('#voice-status').textContent = 'Playing…'; }
    else { speechSynthesis.pause(); document.querySelector('#voice-status').textContent = 'Paused.'; }
  };
  document.querySelector('#listen-stop').onclick = () => { speechSynthesis.cancel(); document.querySelector('#voice-status').textContent = 'Stopped.'; };
}

function devShim() {
  if (typeof chrome !== 'undefined' && chrome.runtime?.id) return false;
  const text = `Photosynthesis lets plants turn light energy into chemical energy stored in glucose. Chlorophyll absorbs light inside chloroplasts. During photosynthesis, plants use carbon dioxide and water to form glucose and oxygen. Light-dependent reactions capture energy while the Calvin cycle helps assemble sugar molecules. The rate of photosynthesis changes with light intensity, carbon dioxide concentration, and temperature. Plants use glucose for growth and cellular respiration.`;
  globalThis.chrome = {
    tabs: { query: async () => [{ id: 1, url: 'https://example.edu/biology/photosynthesis', title: 'How photosynthesis works' }], create: ({ url }) => window.open(url, '_blank'), onActivated: { addListener() {} }, onUpdated: { addListener() {} } },
    scripting: { executeScript: async () => [{ result: { language: 'en', headings: ['How photosynthesis works', 'Light-dependent reactions', 'The Calvin cycle'] } }] },
    storage: { session: { get: async () => ({}), set: async () => {}, remove: async () => {} }, local: { get: async () => ({}), set: async () => {} } },
    runtime: { id: '', sendMessage: async () => ({ source: { url: 'https://example.edu/biology/photosynthesis', title: 'How photosynthesis works', language: 'en', text, capturedAt: new Date().toISOString() } }) },
  };
  return true;
}

async function boot() {
  speechSynthesis?.cancel?.();
  storedSourceId = null;
  pageSource = null;
  analysis = null;
  const settings = await chrome.storage.local.get(['apiBaseUrl', 'outputLanguage']);
  outputLanguage = OUTPUT_LANGUAGES.some(([value]) => value === settings.outputLanguage) ? settings.outputLanguage : 'source';
  apiBase = settings.apiBaseUrl ? normalizeApiBase(settings.apiBaseUrl) : DEFAULT_API_BASE;
  page = await readPageMeta();
  if (page.restricted) return renderHome();
  app.innerHTML = `${sourceBlock()}<div class="loading"><i></i><p>Analyzing this page…</p></div>`;
  try { await ensureSource(); } catch (error) {
    app.innerHTML = `${sourceBlock()}<div class="out"><p class="err">${esc(error?.message || 'Prism could not read this page.')}</p></div>`;
    return;
  }
  renderHome();
}

devShim();
void boot();
chrome.tabs.onActivated.addListener(() => void boot());
chrome.tabs.onUpdated.addListener((_id, info) => { if (info.status === 'complete') void boot(); });

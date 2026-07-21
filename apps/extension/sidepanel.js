import { analyzeContent, createLocalQuiz, summarizeText } from './content-analysis.js';
import { DEFAULT_API_BASE, normalizeApiBase } from './config.js';
import { redactSensitiveText } from './privacy.js';
import { explainTerm } from './term-explanations.js';
import { voicesForLanguage } from './speech-utils.js';
import { classifyText, startSession, tutorQuizHtml, bindTutor } from './tutor.js';

let apiBase = DEFAULT_API_BASE;
const app = document.querySelector('#app');
const WAYS = [
  { id: 'summarize', label: 'Summarize', hint: 'The page in a few clear points', color: 'var(--ray-1)', run: showSummary },
  { id: 'quiz', label: 'Quiz me', hint: 'Answer first, then see why', color: 'var(--ray-2)', run: showQuiz },
  { id: 'terms', label: 'Key terms', hint: 'The concepts that matter most', color: 'var(--ray-3)', run: showKeyTerms },
  { id: 'visualize', label: 'Visualize', hint: 'One map of the whole idea', color: 'var(--ray-4)', run: showVisualize },
  { id: 'listen', label: 'Listen', hint: 'Read aloud at your pace', color: 'var(--ray-5)', run: showListen },
];
let sceneObserver = null;
let activeMode = null;  // drives the result view's accent colour
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
const termExplanationCache = new Map();

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
  if (!tab?.id) return { restricted: true, url: '', title: '', headings: [] };
  if (tab.url && isRestricted(tab.url)) return { restricted: true, url: tab.url, title: tab.title || '', headings: [] };
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        url: location.href,
        title: document.title,
        language: document.documentElement.lang || navigator.language || '',
        headings: [...document.querySelectorAll('h1,h2,h3')]
          .map((heading) => (heading.textContent || '').replace(/\s+/g, ' ').trim())
          .filter((heading) => heading.length > 3 && heading.length < 160)
          .slice(0, 10),
      }),
    });
    const meta = result?.result;
    if (!meta?.url || isRestricted(meta.url)) return { restricted: true, url: meta?.url || tab.url || '', title: meta?.title || tab.title || '', headings: [] };
    return { ...meta, restricted: false };
  } catch (error) {
    return {
      restricted: false,
      accessError: true,
      url: tab.url || '',
      title: tab.title || '',
      headings: [],
      message: error?.message || 'Chrome did not grant access to this page.',
    };
  }
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

async function get(path) {
  const response = await fetch(`${apiBase}${path}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Prism server returned ${response.status}.`);
  return data;
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

/**
 * The stage: the page enters as a beam falling from the top, passes through a
 * prism lying on its side, and disperses downward into the learning modes,
 * which sit alternately right and left down the panel.
 *
 * Cards are real HTML buttons (so hint text wraps instead of clipping) and the
 * rays are drawn afterwards in `drawScene`, measured against where the cards
 * actually landed. Hard-coded ray coordinates cannot survive a card that wraps
 * to two lines or a panel the user has resized.
 */
/** Where each mode sits around the prism. */
// Positions come from the Figma design: Quiz and Listen flank the prism, then
// Summarize, Key terms and Visualize step down beneath it.
const CARD_ORDER = ['quiz', 'listen', 'summarize', 'terms', 'visualize'];
// Words that fall out of the source chip into the prism.
const STREAM_WORDS = ['VALUE', 'CHOICE', 'SCARCITY', 'TRADEOFF'];
// One full turn of the prism. Must match the `hexspin` duration in the
// stylesheet — the per-mode highlight is phased against it.
const SPIN_SECONDS = 45;

function wayButton(way) {
  return `<button class="way" data-way="${way.id}" style="--mode:${way.color}">
    <span class="bar"></span>
    <b>${esc(way.label)}</b>
    <small>${esc(way.hint)}</small>
    <span class="arrow" aria-hidden="true">\u2197</span>
  </button>`;
}

/**
 * A pentagonal torus — one face per learning mode.
 *
 * Vertices sit at 72° intervals offset by 36°, which puts each FACE normal on a
 * card's bearing rather than a corner. Depth is a second ring offset by
 * (dx, dy); the whole shape is then shifted by half that offset so the bore
 * stays optically centred on the source instead of drifting with the extrusion.
 */
function pentaTorusSvg() {
  const cx = 100;
  const cy = 100;
  const R = 92;   // outer radius
  const r = 62;   // bore radius — the hole the page sits in
  const dx = 13;
  const dy = -10;
  const sides = 5;

  const ring = (radius) => Array.from({ length: sides }, (_, i) => {
    // -90° puts a face at the top; +36° turns corners into face centres.
    const angle = (Math.PI / 180) * (-90 + 36 + (360 / sides) * i);
    return [
      cx - dx / 2 + radius * Math.cos(angle),
      cy - dy / 2 + radius * Math.sin(angle),
    ];
  });
  const outer = ring(R);
  const inner = ring(r);
  const shift = (list) => list.map(([x, y]) => [x + dx, y + dy]);
  const pts = (list) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const loop = (list) => `M ${list.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ')} Z`;
  const face = (o, i) => `${loop(o)} ${loop(i)}`;

  const wall = (list, gradient, opacity) => list.map((_, i) => {
    const j = (i + 1) % sides;
    const b = shift(list);
    return `<polygon points="${pts([list[i], b[i], b[j], list[j]])}"
      fill="url(#${gradient})" stroke="#dce7ff" stroke-opacity="${opacity}"/>`;
  }).join('');

  return `<svg viewBox="0 0 200 200">
    <defs>
      <linearGradient id="hex-front" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="#dbe7ff" stop-opacity=".34"/>
        <stop offset=".52" stop-color="#7893de" stop-opacity=".30"/>
        <stop offset="1" stop-color="#1b275e" stop-opacity=".88"/>
      </linearGradient>
      <linearGradient id="hex-wall" x1="0" y1="0" x2="1" y2=".7">
        <stop stop-color="#9eb8ff" stop-opacity=".26"/>
        <stop offset="1" stop-color="#172252" stop-opacity=".9"/>
      </linearGradient>
      <linearGradient id="hex-bore" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="#0b1130" stop-opacity=".92"/>
        <stop offset="1" stop-color="#2b3a7a" stop-opacity=".7"/>
      </linearGradient>
    </defs>
    <g class="hex">
      <path d="${face(shift(outer), shift(inner))}" fill-rule="evenodd"
        fill="url(#hex-wall)" stroke="#dce7ff" stroke-opacity=".24"/>
      ${wall(outer, 'hex-wall', '.2')}
      ${wall(inner, 'hex-bore', '.16')}
      <path d="${face(outer, inner)}" fill-rule="evenodd"
        fill="url(#hex-front)" stroke="#e4ecff" stroke-opacity=".68"/>
    </g>
  </svg>`;
}

/**
 * The white ray inside the bore: it turns clockwise at the same rate as the
 * ring, and whichever mode it is pointing at is the one lit outside.
 *
 * The alignment is derived, not eyeballed. Ray `i` is delayed by -i·T/n and
 * peaks at PEAK_AT through its own cycle, so it is brightest at
 * t = i·T/n + PEAK_AT. The sweeper turns 360°/T, so its delay is solved to put
 * it on that card's bearing at exactly that moment.
 */
const PEAK_AT = 0.07;              // midpoint of the full-brightness hold

/**
 * Register --lit so it interpolates.
 *
 * An unregistered custom property is just a token: keyframes swap it at the
 * halfway point instead of easing, which makes the highlight snap between
 * modes however carefully the keyframes are written. The @property rule in the
 * stylesheet is not reliably applied here, so register it explicitly.
 */
function registerLitProperty() {
  try {
    CSS.registerProperty({ name: '--lit', syntax: '<number>', inherits: false, initialValue: '1' });
  } catch {
    // Already registered, or the engine does not support it — the highlight
    // still works, it just steps rather than eases.
  }
}
const FIRST_CARD_ANGLE = -90;      // the ring starts at the top

/** Delay (seconds) for ray `index`, so the modes peak in clockwise order. */
function rayPhaseSeconds(index, count) {
  // Negative delays start the animation already in progress. Counting down from
  // `count` makes later cards peak later in wall time, matching the clockwise
  // travel of the sweeper — counting up ran the highlight anticlockwise.
  return -(((count - index) % count) * SPIN_SECONDS) / count;
}

function sweeperDelaySeconds() {
  const degPerSecond = 360 / SPIN_SECONDS;
  const tPeak = PEAK_AT * SPIN_SECONDS;
  // CSS applies delay as angle(t) = degPerSecond · (t − delay). Solve
  // angle(tPeak) ≡ FIRST_CARD_ANGLE for delay, then shift it negative so the
  // sweeper is already turning at load instead of waiting.
  const delay = tPeak - FIRST_CARD_ANGLE / degPerSecond;
  return ((delay % SPIN_SECONDS) + SPIN_SECONDS) % SPIN_SECONDS - SPIN_SECONDS;
}

function sweeperSvg(cx, cy, size) {
  const bore = (62 / 200) * size;          // inner wall of the ring
  const from = bore * 0.12;                // leaves the page itself
  const to = bore * 0.98;
  const delay = sweeperDelaySeconds().toFixed(2);
  // Three offset pulses on the same path read as light being emitted, rather
  // than one rigid spoke sweeping round.
  const pulses = [0, 0.36, 0.72].map((offset) => `
    <line class="sweep-pulse" pathLength="100" style="animation-delay:${(-offset * 1.6).toFixed(2)}s"
      x1="${(cx + from).toFixed(1)}" y1="${cy.toFixed(1)}"
      x2="${(cx + to).toFixed(1)}" y2="${cy.toFixed(1)}"/>`).join('');
  return `<g class="sweeper" style="transform-origin:${cx.toFixed(1)}px ${cy.toFixed(1)}px;
      animation-delay:${delay}s">
    <line class="sweep-track" x1="${(cx + from).toFixed(1)}" y1="${cy.toFixed(1)}"
      x2="${(cx + to).toFixed(1)}" y2="${cy.toFixed(1)}"/>
    ${pulses}
  </g>`;
}

function prismSvg() {
  const cards = CARD_ORDER
    .map((id) => wayButton(WAYS.find((way) => way.id === id)))
    .join('');
  const host = page?.restricted ? 'this page' : safeHost(page?.url);
  return `<section class="stage">
    <svg class="rays" aria-hidden="true"></svg>
    <div class="source-halo" aria-hidden="true"></div>
    <div class="prism" aria-hidden="true">${pentaTorusSvg()}</div>
    <button class="source-chip source-origin" id="source-origin" aria-pressed="false"
            title="The page you're on is the light">
      <i></i><code>${esc(host)}</code>
    </button>
    <div class="mode-grid">${cards}</div>
  </section>`;
}

/**
 * Draw a ray from the prism to each card. Origins follow the design: the two
 * side modes leave from the prism's flanks, the three below from quarter,
 * half and three-quarter points along its base.
 */
function drawScene() {
  const stage = document.querySelector('.stage');
  const svg = stage?.querySelector('svg.rays');
  const prism = stage?.querySelector('.prism');
  if (!stage || !svg || !prism) return;

  const stageBox = stage.getBoundingClientRect();
  const prismBox = prism.getBoundingClientRect();
  if (!stageBox.width || !stageBox.height) return;
  svg.setAttribute('viewBox', `0 0 ${Math.round(stageBox.width)} ${Math.round(stageBox.height)}`);

  const px = prismBox.left - stageBox.left;
  const py = prismBox.top - stageBox.top;
  // Listen and Quiz sit beside the prism and are fed from its upper flanks;
  // the lower three leave across the base, each from the side its card is on
  // so the downward rays never cross.
  const w = prismBox.width;
  const h = prismBox.height;
  // The source sits at the centre of the crystal and the modes ring it at equal
  // angles. An ellipse rather than a circle: a side panel is much taller than
  // it is wide, so a true circle would push the flanking cards off the edge.
  // The stage defines the centre and the crystal is hung from it, not the other
  // way round — deriving the centre from the prism's own box would be circular,
  // since the prism is positioned by `--core-y`.
  const centreX = stageBox.width / 2;
  const centreY = stageBox.height * 0.46;
  stage.style.setProperty('--core-y', `${centreY.toFixed(1)}px`);
  // Big enough to clear the ring, small enough that the outermost cards stay
  // inside the panel: half the panel minus half a card.
  const cardHalf = 50;
  const radiusX = Math.max(stageBox.width / 2 - cardHalf, 118);
  const radiusY = Math.min(stageBox.height * 0.38, 158);
  // Leave from the ring's OUTER wall (R=92 in a 200 viewBox, flat-to-flat), not
  // the old solid-hexagon radius — that put the origins inside the bore, behind
  // the source chip.
  // Face centres of a pentagon sit at R·cos(36°) from the middle.
  const inradius = Math.min(w, h) * (92 * Math.cos(Math.PI / 5)) / 200;
  const step = (Math.PI * 2) / CARD_ORDER.length;

  svg.innerHTML = CARD_ORDER.map((id, index) => {
    const card = stage.querySelector(`[data-way="${id}"]`);
    const way = WAYS.find((candidate) => candidate.id === id);
    if (!card || !way) return '';

    // Start at the top and go clockwise, so the spectrum reads round the ring.
    const angle = -Math.PI / 2 + index * step;
    const cardX = centreX + radiusX * Math.cos(angle);
    const cardY = centreY + radiusY * Math.sin(angle);
    card.style.left = `${cardX.toFixed(1)}px`;
    card.style.top = `${cardY.toFixed(1)}px`;

    // The ray runs along the same bearing: out of the glass, into the card.
    // Stop at the card's own edge along that bearing — using the larger of its
    // two dimensions over-trimmed the near-vertical rays into stubs.
    const box = card.getBoundingClientRect();
    const cos = Math.abs(Math.cos(angle));
    const sin = Math.abs(Math.sin(angle));
    const toEdge = Math.min(
      cos > 1e-3 ? (box.width / 2) / cos : Infinity,
      sin > 1e-3 ? (box.height / 2) / sin : Infinity,
    );
    const reach = Math.max(0, Math.hypot(cardX - centreX, cardY - centreY) - toEdge - 3);
    const x1 = centreX + inradius * Math.cos(angle);
    const y1 = centreY + inradius * Math.sin(angle);
    const x2 = centreX + reach * Math.cos(angle);
    const y2 = centreY + reach * Math.sin(angle);

    // Phase the highlight to the spin so each mode lights as a face comes
    // round to it — one after another, never all at once.
    const phase = rayPhaseSeconds(index, CARD_ORDER.length);
    card.style.setProperty('--phase', `${phase}s`);
    return `<path data-ray="${id}" stroke="${way.color}" style="--phase:${phase}s"
      d="M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}"/>`;
  }).join('') + sweeperSvg(centreX, centreY, Math.min(w, h));
}

/** The compact source line carried into every result view. */
function sourceBlock() {
  const host = page?.restricted ? 'this page is protected' : safeHost(page?.url);
  const words = analysis ? `${analysis.wordCount.toLocaleString()} words` : '';
  return `<div class="result-source">
      <span class="mini-light"></span><code>${esc(host)}</code>
      ${words ? `<span class="plain"> · ${esc(words)}</span>` : ''}
    </div>`;
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
  if (page?.accessError) {
    app.innerHTML = `${sourceBlock()}<div class="out"><p class="err">Chrome has not granted Prism access to this tab. Reload the page, then click the Prism toolbar icon while this tab is active.</p><p class="note">${esc(page.message || '')}</p></div>`;
    return;
  }
  registerLitProperty();
  syncHeader();
  app.innerHTML = `<p class="section-label">Choose a learning mode</p>
    ${prismSvg()}
    <p class="footnote">Only this active page or the text you selected is analyzed.</p>`;
  bindWays();
  drawScene();
  // Rays are measured from laid-out cards, so re-measure whenever the panel
  // is resized — a side panel is a user-draggable width.
  sceneObserver?.disconnect();
  sceneObserver = new ResizeObserver(() => drawScene());
  sceneObserver.observe(document.querySelector('.stage'));

  bindMagnify();

  // The source chip is the light: pressing it drives the stream harder.
  const origin = document.querySelector('#source-origin');
  origin?.addEventListener('click', () => {
    const stage = document.querySelector('.stage');
    const on = stage.classList.toggle('source-active');
    origin.setAttribute('aria-pressed', String(on));
  });
}

/** Header carries the language picker and the analysed-words readout. */
function syncHeader() {
  const select = document.querySelector('#output-language');
  if (select && !select.options.length) {
    select.innerHTML = OUTPUT_LANGUAGES
      .map(([value, label]) => `<option value="${value}">${esc(label)}</option>`)
      .join('');
    select.addEventListener('change', async (event) => {
      outputLanguage = event.target.value;
      await chrome.storage.local.set({ outputLanguage });
    });
  }
  if (select) select.value = outputLanguage;
  const readout = document.querySelector('#analyzed-text');
  if (readout) readout.textContent = analysis ? `${analysis.wordCount.toLocaleString()} words` : 'Ready';
}

function bindWays() {
  document.querySelectorAll('[data-way]').forEach((button) => {
    const way = WAYS.find((candidate) => candidate.id === button.dataset.way);
    button.addEventListener('mouseenter', () => highlightRay(way.id));
    button.addEventListener('mouseleave', () => highlightRay(null));
    button.addEventListener('focus', () => highlightRay(way.id));
    button.addEventListener('blur', () => highlightRay(null));
    button.addEventListener('click', () => { activeMode = way; void way.run(); });
  });
}

/**
 * Dock-style magnification.
 *
 * Each card scales by how close the pointer is to its centre, so the card under
 * the cursor grows most and its neighbours taper off. That lets the resting
 * cards stay small — the list reads as uncrowded without losing legibility on
 * the one you are actually reaching for.
 *
 * Scale is applied through a CSS custom property rather than by writing
 * `transform` directly, so the stylesheet keeps ownership of the transform and
 * the reduced-motion and coarse-pointer fallbacks still win.
 */
const MAGNIFY_RANGE = 130;   // px of influence either side of a card's centre
const MAGNIFY_AMOUNT = 0.16; // peak growth, 1.0 -> 1.16

function bindMagnify() {
  const grid = document.querySelector('.mode-grid');
  if (!grid) return;
  if (window.matchMedia?.('(hover: none)').matches) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const cards = [...grid.querySelectorAll('.way')];

  // Centres come from the unscaled layout, cached once. Measuring live rects
  // would feed each card's own scale back into its centre and make the row
  // jitter as it grows.
  let centres = [];
  const remeasure = () => {
    const gridBox = grid.getBoundingClientRect();
    centres = cards.map((card) => [
      gridBox.left + card.offsetLeft + card.offsetWidth / 2,
      gridBox.top + card.offsetTop + card.offsetHeight / 2,
    ]);
  };
  remeasure();

  grid.addEventListener('pointermove', (event) => {
    // Five cards, so this is cheap enough to run straight off the event —
    // no rAF, which also keeps it working when the panel is not compositing.
    for (let i = 0; i < cards.length; i += 1) {
      // The cards are scattered around the prism, not stacked, so proximity
      // has to be measured in two dimensions.
      const dx = centres[i][0] - event.clientX;
      const dy = centres[i][1] - event.clientY;
      const distance = Math.hypot(dx, dy);
      // Squared falloff: flat-topped near the pointer, quick taper past it.
      const falloff = Math.max(0, 1 - (distance / MAGNIFY_RANGE) ** 2);
      cards[i].style.setProperty('--scale', (1 + MAGNIFY_AMOUNT * falloff).toFixed(3));
    }
  });

  grid.addEventListener('pointerleave', () => {
    for (const card of cards) card.style.setProperty('--scale', '1');
  });

  window.addEventListener('resize', remeasure);
}

function highlightRay(id) {
  // Hovering suspends the automatic sweep so the two never fight over what is lit.
  document.querySelector('.stage')?.classList.toggle('focusing', id !== null);
  document.querySelectorAll('[data-ray]').forEach((ray) => {
    ray.classList.toggle('on', id !== null && ray.dataset.ray === id);
    ray.classList.toggle('dim', id !== null && ray.dataset.ray !== id);
  });
}

function renderLoading(label) {
  app.innerHTML = `${sourceBlock()}<div class="loading"><i></i><p>${esc(label)}</p></div>`;
}

/** Every result view wears its mode's colour on the card spine and kicker. */
function finishResult(html, note = '') {
  // Each mode already renders its own .result-head; we only supply the accent.
  const colour = activeMode?.color || 'var(--ray-6)';
  app.innerHTML = `${sourceBlock()}
    <div class="out" style="--mode:${colour}">${html}</div>
    ${note ? `<p class="note">${esc(note)}</p>` : ''}`;
  app.prepend(backButton());
}

function backButton() {
  const button = document.createElement('button');
  button.className = 'back';
  button.innerHTML = '<span class="glyph" aria-hidden="true">←</span>Back';
  button.onclick = renderHome;
  return button;
}

async function showSummary() {
  renderLoading('Finding the signal…');
  await ensureSource();
  let points = summarizeText(pageSource.text, { headings: page?.headings || [], language: analysis.language, limit: 8 });
  let source = 'Instant extractive summary';
  try {
    const asset = await requestGeneratedAsset('read');
    points = asset.payload.segments.map((segment) => segment.recap || segment.text);
    source = asset.cached ? 'Saved AI-refined summary' : 'AI-refined summary';
  } catch { /* The local summary is the zero-key, offline-safe path. */ }
  const translated = await translateValues(points);
  points = translated.values;
  finishResult(`<div class="result-head"><span>Summarize</span><small>${esc(source)}</small></div>
    <h3>${esc(pageSource.title)}</h3><div class="summary-points">${points.map((point, index) => `<p data-summary="${index}"${index >= 4 ? ' hidden' : ''}><b>${index + 1}</b>${esc(point)}</p>`).join('')}</div>
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
  // When the page maps to an approved curriculum concept, teach it through the
  // server's tutoring session instead: hints, recorded attempts, mastery, and a
  // solution that stays locked until the learner actually tries.
  if (await tryAdaptiveQuiz()) return;
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

/**
 * Returns true when the tutoring session took over the Quiz ray.
 * A page that matches no approved concept falls through to the page-derived
 * quiz, so this never blocks the ordinary path.
 */
async function tryAdaptiveQuiz() {
  try {
    const classification = await classifyText(post, pageSource.text.slice(0, 4000));
    if (!classification.conceptId) return false;
    const session = await startSession(post, classification.conceptId);
    finishResult(tutorQuizHtml(session, esc), 'Answers are scored on the server, so the solution stays locked until you attempt every question.');
    bindTutor(session, { root: app, post, get, esc });
    return true;
  } catch {
    return false; // Fall back to the page-derived quiz.
  }
}

async function showKeyTerms() {
  renderLoading('Filtering noise and ranking concepts…');
  await ensureSource();
  const translatedTerms = await translateValues(analysis.keyTerms.map((term) => term.term));
  const terms = analysis.keyTerms.map((term, index) => ({ ...term, originalTerm: term.term, term: translatedTerms.values[index] }));
  finishResult(`<div class="result-head"><span>Key terms</span><small>Frequency + relevance</small></div>
    <h3>${terms.length ? 'What this page keeps coming back to' : 'Not enough terms yet'}</h3>
    <div class="term-grid">${terms.map((term, index) => `<button class="term" data-term="${index}"><span>${esc(term.term)}</span><b>${term.count}×</b></button>`).join('')}</div>
    <div class="term-context" id="term-context" aria-live="polite">Choose a term for a plain-language explanation.</div>`, translatedTerms.note || 'Choose any concept to learn what it means—not merely where it appeared.');
  document.querySelectorAll('[data-term]').forEach((button) => button.addEventListener('click', async () => {
    const term = terms[Number(button.dataset.term)];
    document.querySelectorAll('[data-term]').forEach((candidate) => candidate.classList.toggle('active', candidate === button));
    const panel = document.querySelector('#term-context');
    panel.innerHTML = `<b>${esc(term.term)}</b><p>Explaining this concept…</p>`;
    const cacheKey = `${analysis.language}:${outputLanguage}:${term.originalTerm}`;
    let explanation = termExplanationCache.get(cacheKey);
    if (!explanation) {
      const result = await explainTerm(term.originalTerm, { contexts: term.contexts, language: analysis.language });
      const translated = await translateValues([result.definition]);
      explanation = { definition: translated.values[0], source: result.source, note: translated.note };
      termExplanationCache.set(cacheKey, explanation);
    }
    if (!button.classList.contains('active')) return;
    panel.innerHTML = `<b>${esc(term.term)}</b><p>${esc(explanation.definition)}</p><small>${esc(explanation.source)}${explanation.note ? ` · ${esc(explanation.note)}` : ''}</small>`;
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
    <div class="transport"><button class="fig" id="listen-play">▶ Play</button><button class="fig" id="listen-pause">Ⅱ Pause</button><button class="fig" id="listen-stop">■ Stop</button><button class="fig" id="listen-gemini">✦ Gemini voice</button></div>
    <p class="voice-status" id="voice-status">Ready.</p>`, listenCopy.note || 'Playback stays on your device.');
  bindSpeech({ summary: listenCopy.values[0], article: listenCopy.values[1], narration: listenCopy.values[2] });
}

function bindSpeech(copy) {
  const voiceSelect = document.querySelector('#listen-voice');
  const playButton = document.querySelector('#listen-play');
  const targetLanguage = outputLanguage === 'source' ? (analysis?.language || pageSource?.language || page?.language || 'en') : outputLanguage;
  let matchingVoices = [];
  const loadVoices = () => {
    matchingVoices = voicesForLanguage(speechSynthesis.getVoices(), targetLanguage);
    voiceSelect.innerHTML = matchingVoices.length
      ? matchingVoices.map((voice, index) => `<option value="${index}">${esc(voice.name)} · ${esc(voice.lang)}</option>`).join('')
      : `<option value="">No ${esc(languageName(targetLanguage))} voice installed</option>`;
    voiceSelect.disabled = matchingVoices.length === 0;
    playButton.disabled = matchingVoices.length === 0;
    if (!matchingVoices.length) document.querySelector('#voice-status').textContent = `Install a ${languageName(targetLanguage)} system voice to listen in this language.`;
  };
  loadVoices();
  speechSynthesis.addEventListener?.('voiceschanged', loadVoices, { once: true });
  playButton.onclick = () => {
    speechSynthesis.cancel();
    const scope = document.querySelector('#listen-scope').value;
    const utterance = new SpeechSynthesisUtterance(copy[scope]);
    utterance.rate = Number(document.querySelector('#listen-rate').value);
    utterance.lang = matchingVoices[Number(voiceSelect.value)]?.lang || targetLanguage;
    utterance.voice = matchingVoices[Number(voiceSelect.value)] || null;
    utterance.onstart = () => { document.querySelector('#voice-status').textContent = 'Playing…'; };
    utterance.onend = () => { document.querySelector('#voice-status').textContent = 'Finished.'; };
    speechSynthesis.speak(utterance);
  };
  document.querySelector('#listen-pause').onclick = () => {
    if (!geminiAudio.paused) { geminiAudio.pause(); document.querySelector('#voice-status').textContent = 'Paused.'; return; }
    if (geminiAudio.src && geminiAudio.currentTime > 0 && geminiAudio.currentTime < geminiAudio.duration) { geminiAudio.play(); return; }
    if (speechSynthesis.paused) { speechSynthesis.resume(); document.querySelector('#voice-status').textContent = 'Playing…'; }
    else { speechSynthesis.pause(); document.querySelector('#voice-status').textContent = 'Paused.'; }
  };
  document.querySelector('#listen-stop').onclick = () => { speechSynthesis.cancel(); geminiAudio.pause(); document.querySelector('#voice-status').textContent = 'Stopped.'; };

  // Server-generated narration via Gemini TTS. Additive: browser speech above
  // stays the default and the fallback. Plays the returned data URL directly,
  // so no audio bytes are stored anywhere.
  const geminiAudio = new Audio();
  geminiAudio.onended = () => { document.querySelector('#voice-status').textContent = 'Finished.'; };
  geminiAudio.onplay = () => { document.querySelector('#voice-status').textContent = 'Playing (Gemini voice)…'; };
  const status = document.querySelector('#voice-status');
  document.querySelector('#listen-gemini').onclick = async (event) => {
    const button = event.currentTarget;
    speechSynthesis.cancel();
    const scope = document.querySelector('#listen-scope').value;
    button.disabled = true;
    status.textContent = 'Generating Gemini narration…';
    try {
      const { audio } = await post('/api/tts', { text: copy[scope], language: targetLanguage });
      geminiAudio.src = audio.dataUrl;
      geminiAudio.playbackRate = Number(document.querySelector('#listen-rate').value);
      await geminiAudio.play();
    } catch (error) {
      status.textContent = error.message?.includes('501')
        ? 'No server voice configured — use the browser voice above.'
        : `Gemini voice failed: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  };
}

function devShim() {
  if (typeof chrome !== 'undefined' && chrome.runtime?.id) return false;
  const text = `Photosynthesis lets plants turn light energy into chemical energy stored in glucose. Chlorophyll absorbs light inside chloroplasts. During photosynthesis, plants use carbon dioxide and water to form glucose and oxygen. Light-dependent reactions capture energy while the Calvin cycle helps assemble sugar molecules. The rate of photosynthesis changes with light intensity, carbon dioxide concentration, and temperature. Plants use glucose for growth and cellular respiration.`;
  globalThis.chrome = {
    tabs: { query: async () => [{ id: 1, url: 'https://example.edu/biology/photosynthesis', title: 'How photosynthesis works' }], create: ({ url }) => window.open(url, '_blank'), onActivated: { addListener() {} }, onUpdated: { addListener() {} } },
    scripting: { executeScript: async () => [{ result: { url: 'https://example.edu/biology/photosynthesis', title: 'How photosynthesis works', language: 'en', headings: ['How photosynthesis works', 'Light-dependent reactions', 'The Calvin cycle'] } }] },
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
  if (page.restricted || page.accessError) return renderHome();
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

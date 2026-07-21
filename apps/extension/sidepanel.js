import { analyzeContent, createLocalQuiz, summarizeText } from './content-analysis.js';
import { buildConceptMap, connectedConcepts } from './concept-map.js';
import { DEFAULT_API_BASE, normalizeApiBase } from './config.js';
import { redactSensitiveText } from './privacy.js';
import { explainTerm } from './term-explanations.js';
import { chunkSpeechText, voicesForLanguage } from './speech-utils.js';
import { classifyText, startSession, tutorQuizHtml, bindTutor } from './tutor.js';

let apiBase = DEFAULT_API_BASE;
const app = document.querySelector('#app');
const WAYS = [
  { id: 'summarize', label: 'Summarize', hint: 'The page in a few clear points', color: 'var(--ray-1)', run: showSummary },
  { id: 'quiz', label: 'Quiz me', hint: 'Answer first, then see why', color: 'var(--ray-2)', run: showQuiz },
  { id: 'terms', label: 'Key terms', hint: 'The concepts that matter most', color: 'var(--ray-3)', run: showKeyTerms },
  { id: 'visualize', label: 'Visualize', hint: 'One picture of the whole idea', color: 'var(--ray-4)', run: showVisualize },
  { id: 'listen', label: 'Listen', hint: 'Read aloud at your pace', color: 'var(--ray-5)', run: showListen },
];
let sceneObserver = null;
let activeMode = null;  // drives the result view's accent colour
// Where the ring was when the user reached for it. Redraws while fanned must
// reuse it, or a resize would snap every card back to an unrotated ring.
let frozenAngle = 0;
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

async function requestGeneratedFigure(regenerate = false) {
  const sourceId = await ensureStoredSource();
  return post(`/api/sources/${encodeURIComponent(sourceId)}/figure`, {
    homeLanguage: outputLanguage === 'source' ? undefined : languageName(outputLanguage),
    regenerate,
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
// One full revolution of the ring. Must match `hexspin` and every animation
// phased against it in the stylesheet — `labelflip`, `facefill`, `faceedge`,
// `facelabel`, `raysweep` and `cardsweep`. Change it here and there together
// or the labels flip at the wrong moment and the wrong face lights.
const SPIN_SECONDS = 45;
// How far the crystal shrinks when the modes fan out. Must match
// `.stage.fanned .prism` in the stylesheet — ray origins are measured off it.
const FAN_SCALE = 0.62;

function wayButton(way) {
  return `<button class="way" data-way="${way.id}" style="--mode:${way.color}">
    <span class="bar"></span>
    <b>${esc(way.label)}</b>
    <small>${esc(way.hint)}</small>
    <span class="arrow" aria-hidden="true">\u2197</span>
  </button>`;
}

/**
 * A pentagonal torus whose five faces ARE the five modes.
 *
 * Vertices sit at 72° intervals offset by 36°, which puts each FACE normal on a
 * card's bearing rather than a corner. Depth is a second ring offset by
 * (dx, dy); the whole shape is then shifted by half that offset so the bore
 * stays optically centred on the source instead of drifting with the extrusion.
 *
 * Each face is tinted with its mode's colour and carries its label set along
 * its own edge, inside the band — the label is part of the face, not a chip
 * floating over the glass. That is also why the ring no longer turns: text
 * baked into a rotating shape spends half of every revolution upside down.
 * The face that has turned to the top is the one lit, which is what carries
 * the sense of motion — there is no separate pointer inside the bore.
 */
function pentaTorusSvg() {
  const cx = 100;
  const cy = 100;
  const R = 96;   // outer radius
  const r = 54;   // bore radius — the hole the page sits in
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

  // One trapezoid per side, in CARD_ORDER. Vertices sit at -90 + 36 + 72i, so
  // the side spanning vertices k→k+1 has its midpoint at -18 + 72k. Mode i
  // wants the bearing -90 + 72i (the one its ray and card already use), and
  // -18 + 72k = -90 + 72i solves to k = i - 1 — hence the step back. Face, ray
  // and card then always agree about which mode they are.
  const faces = CARD_ORDER.map((id, i) => {
    const way = WAYS.find((candidate) => candidate.id === id);
    if (!way) return '';
    const k = (i + sides - 1) % sides;
    const j = (k + 1) % sides;
    const quad = [outer[k], outer[j], inner[j], inner[k]];
    // Text runs along the outer edge. Past ±90° it would read upside down, so
    // fold the angle into (-90, 90] — a half turn along a line is the same
    // line, it just flows the other way round the ring, which is how any
    // circular label behaves. Folding modulo 180 rather than adding 180 once:
    // atan2 reaches 180°, and a single correction left that as 324°, which
    // renders identically but hands a nonsense angle to the flip timing below.
    let deg = (Math.atan2(outer[j][1] - outer[k][1], outer[j][0] - outer[k][0]) * 180) / Math.PI;
    deg = ((deg % 180) + 180) % 180;
    if (deg > 90) deg -= 180;
    const mx = quad.reduce((sum, [x]) => sum + x, 0) / 4;
    const my = quad.reduce((sum, [, y]) => sum + y, 0) / 4;
    const phase = facePhaseSeconds(i, sides).toFixed(2);
    return `<g class="face" data-face="${id}" style="--mode:${way.color}; --phase:${phase}s">
      <polygon class="face-fill" points="${pts(quad)}"/>
      <polygon class="face-edge" points="${pts([outer[k], outer[j]])}"/>
      <g class="face-flip" style="transform-box:view-box;
          transform-origin:${mx.toFixed(1)}px ${my.toFixed(1)}px;
          animation-delay:${labelFlipDelaySeconds(deg).toFixed(2)}s">
        <text class="face-label" x="${mx.toFixed(1)}" y="${my.toFixed(1)}" dx="-1.2"
          transform="rotate(${deg.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)})"
          text-anchor="middle" dominant-baseline="central">${esc(way.label.toUpperCase())}</text>
      </g>
    </g>`;
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
      ${faces}
    </g>
  </svg>`;
}

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
/**
 * Delay (seconds) for face `index`, so each face lights as it reaches the top.
 *
 * The ring turns clockwise at 360°/SPIN_SECONDS, and face i starts at bearing
 * -90 + 72i. It reaches the top (-90) when the ring has turned -72i, i.e. at
 * t = -i·T/count. A negative animation-delay starts the cycle already that far
 * in, so the peak lands exactly there.
 *
 * Note this counts UP, unlike the old ray phasing, which counted down. That
 * version was correct for a still ring with a highlight travelling round it —
 * here it is the ring that moves past a fixed point, so the sign flips.
 */
function facePhaseSeconds(index, count) {
  return -(index * SPIN_SECONDS) / count;
}

/**
 * Delay (seconds) for a label's flip, given its edge angle in the ring's own
 * frame.
 *
 * A label rides its face, so its angle on screen is `deg + θ`. It becomes
 * unreadable as that passes ±90°, which happens at θ = 90 - deg and again half
 * a turn later. The shared `labelflip` keyframes put their two half-turns at
 * 50% and 100%, so line the 50% mark up with the first crossing.
 */
function labelFlipDelaySeconds(deg) {
  const firstCross = ((90 - deg) / 360) * SPIN_SECONDS;
  const delay = firstCross - SPIN_SECONDS / 2;
  // Fold into (-T, 0]. Any delay congruent modulo T behaves identically, but a
  // negative delay inside one period is the one that reads correctly and is
  // the only one that survives someone later changing SPIN_SECONDS.
  return ((delay % SPIN_SECONDS) - SPIN_SECONDS) % SPIN_SECONDS;
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
 * Read how far the ring has turned, right now, in degrees.
 *
 * The spin is a CSS animation, so this is the only honest source of truth —
 * there is no JS-side clock to consult, and guessing from elapsed time would
 * drift the moment the animation is paused, throttled, or the panel is hidden.
 */
function ringAngle() {
  const hex = document.querySelector('.hex');
  if (!hex) return 0;
  const { transform } = getComputedStyle(hex);
  if (!transform || transform === 'none') return 0;
  const parts = transform.match(/matrix\(([^)]+)\)/);
  if (!parts) return 0;
  const [a, b] = parts[1].split(',').map(Number);
  return (Math.atan2(b, a) * 180) / Math.PI;
}

/**
 * Draw a ray from the prism to each card, and place the cards themselves.
 *
 * `rotation` is where the ring has turned to. Every mode's face, ray and card
 * share one bearing, so passing the live spin angle in here is what makes a
 * mode fan out from the side it is actually on — freeze the spin with
 * Visualize at the top and the Visualize card is the one that appears at the
 * top, every time.
 */
function drawScene(rotation = 0) {
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
  // Leave from the ring's OUTER wall (R=96 in a 200 viewBox, flat-to-flat), not
  // the old solid-hexagon radius — that put the origins inside the bore, behind
  // the source chip. Face centres of a pentagon sit at R·cos(36°) from the
  // middle.
  //
  // Measured against the FANNED crystal, not the resting one. Rays only exist
  // while the modes are fanned out, and the crystal shrinks by FAN_SCALE as
  // they go — using its resting size put the origins further out than the ring
  // itself, which collapsed the two side rays into backwards stubs.
  const inradius = Math.min(w, h) * FAN_SCALE * (96 * Math.cos(Math.PI / 5)) / 200;
  const step = (Math.PI * 2) / CARD_ORDER.length;

  svg.innerHTML = CARD_ORDER.map((id, index) => {
    const card = stage.querySelector(`[data-way="${id}"]`);
    const way = WAYS.find((candidate) => candidate.id === id);
    if (!card || !way) return '';

    // Start at the top and go clockwise, so the spectrum reads round the ring,
    // then carry the ring's own rotation so this card lands on its own face.
    const angle = -Math.PI / 2 + index * step + (rotation * Math.PI) / 180;
    const cardX = centreX + radiusX * Math.cos(angle);
    const cardY = centreY + radiusY * Math.sin(angle);
    card.style.left = `${cardX.toFixed(1)}px`;
    card.style.top = `${cardY.toFixed(1)}px`;

    // Two homes per mode. `left/top` is the fanned position; the docked one is
    // expressed as an offset transform, because transforms animate on the
    // compositor while animating left/top would relayout every frame.
    // Dock on the face's own label, so a card looks like it peels off the side
    // it belongs to. The labels sit at the mid-band radius, (R + r) / 2 = 75.
    const dockRadius = Math.min(w, h) * (75 / 200);
    card.style.setProperty('--dock-x', `${(centreX + dockRadius * Math.cos(angle) - cardX).toFixed(1)}px`);
    card.style.setProperty('--dock-y', `${(centreY + dockRadius * Math.sin(angle) - cardY).toFixed(1)}px`);

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
    // round to it — one after another, never all at once. Cards and rays only
    // exist while the ring is frozen, so this is inert until it is not, but it
    // has to agree with the faces or a card could light out of turn.
    const phase = facePhaseSeconds(index, CARD_ORDER.length);
    card.style.setProperty('--phase', `${phase}s`);
    return `<path data-ray="${id}" stroke="${way.color}" style="--phase:${phase}s"
      d="M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}"/>`;
  }).join('');
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

async function translateValues(values, { allowServerFallback = true } = {}) {
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
    if (!allowServerFallback) {
      return { values, note: `${languageName(targetLanguage)} needs an on-device language pack; showing the page language.` };
    }
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
  sceneObserver = new ResizeObserver(() => drawScene(frozenAngle));
  sceneObserver.observe(document.querySelector('.stage'));

  bindMagnify();
  bindFan();

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

/**
 * Two states for the stage.
 *
 * At rest the modes ARE the faces of the crystal, and the crystal turns. Bring
 * a pointer into the stage and the spin freezes exactly where it is, then the
 * modes fan out from the sides they were on.
 *
 * Freezing first and measuring second is the whole trick. The cards are laid
 * out from the ring's live angle, so a mode always emerges from its own face:
 * stop the spin with Visualize at the top and Visualize is the card at the
 * top. Laying them out on fixed bearings instead would have every mode jump to
 * an unrelated side the moment you reached for it.
 *
 * Keyboard focus counts as intent too, otherwise the modes could be tabbed to
 * while still docked and invisible behind the glass.
 */
function bindFan() {
  const stage = document.querySelector('.stage');
  if (!stage) return;

  const fan = (on) => {
    if (on === stage.classList.contains('fanned')) return;
    if (on) {
      // Sample the angle BEFORE pausing: pausing is what makes it hold still,
      // and we want the position the user was actually looking at.
      frozenAngle = ringAngle();
      stage.classList.add('frozen');
      drawScene(frozenAngle);
      // Force the new docked positions to be committed as the transition's
      // starting point. Without this the browser coalesces the layout write
      // and the class change into one frame, and the cards slide out of
      // wherever they happened to be sitting before.
      void stage.offsetHeight;
      stage.classList.add('fanned');
    } else {
      stage.classList.remove('fanned');
      stage.classList.remove('frozen');
    }
  };

  stage.addEventListener('pointerenter', () => fan(true));
  stage.addEventListener('pointerleave', () => fan(false));
  stage.addEventListener('focusin', () => fan(true));
  stage.addEventListener('focusout', (event) => {
    if (!stage.contains(event.relatedTarget)) fan(false);
  });
}

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
  let map = buildConceptMap({ title: pageSource.title, ...analysis });
  const sourceCopy = [map.title, map.summary, ...map.nodes.flatMap((node) => [node.label, node.detail]), ...map.relations.map((relation) => relation.evidence)];
  const visualCopy = await translateValues(sourceCopy, { allowServerFallback: false });
  let copyIndex = 0;
  map = { ...map, title: visualCopy.values[copyIndex++], summary: visualCopy.values[copyIndex++],
    nodes: map.nodes.map((node) => ({ ...node, label: visualCopy.values[copyIndex++], detail: visualCopy.values[copyIndex++] })),
    relations: map.relations.map((relation) => ({ ...relation, evidence: visualCopy.values[copyIndex++] })),
  };
  renderLocalVisual(map, visualCopy.note, 'Creating an AI figure when Gemini is available…');
  try {
    const figure = await requestGeneratedFigure();
    if (document.querySelector('#visual-ai-status')) renderAiVisual(map, figure, visualCopy.note);
  } catch (error) {
    const status = document.querySelector('#visual-ai-status');
    const sourceLabel = document.querySelector('.result-head small');
    if (sourceLabel) sourceLabel.textContent = 'AI unavailable · local fallback';
    if (status) {
      status.classList.add('error');
      status.textContent = error?.message?.includes('not configured')
        ? 'Gemini is not configured, so the private local concept map is shown.'
        : `AI figure unavailable; local map retained. ${truncate(error?.message || '', 120)}`;
    }
  }
}

function localVisualMarkup(map) {
  return `${conceptMapSvg(map)}<div class="visual-detail" id="visual-detail" aria-live="polite"><b>${esc(map.title)}</b><p>${esc(map.summary)}</p><small>Choose a concept to see its source evidence.</small></div>`;
}

function renderLocalVisual(map, translationNote = '', aiStatus = '') {
  finishResult(`<div class="result-head"><span>Visualize</span><small>Local · source-grounded</small></div>${localVisualMarkup(map)}
    ${aiStatus ? `<p class="ai-status" id="visual-ai-status"><i></i>${esc(aiStatus)}</p>` : ''}
    <button class="fig" id="download-visual">Download SVG</button>`, translationNote || 'Built privately on this device from concepts and relationships found on the page.');
  bindConceptMap(map);
  document.querySelector('#download-visual')?.addEventListener('click', () => downloadSvg(document.querySelector('.concept-map').outerHTML));
}

function renderAiVisual(map, figure, translationNote = '') {
  const sourceLabel = figure.cached ? 'Saved AI figure · no new charge' : 'New AI figure · Gemini';
  finishResult(`<div class="result-head"><span>Visualize</span><small>${esc(sourceLabel)}</small></div>
    <div class="figure-zoom" role="group" aria-label="Figure zoom"><button class="active" data-figure-zoom="fit">Fit</button><button data-figure-zoom="150">150%</button><button data-figure-zoom="200">200%</button></div>
    <div class="figure-panel" id="ai-figure-panel" data-zoom="fit"><img class="ai-figure" src="${esc(figure.dataUrl)}" alt="${esc(figure.altText)}"></div>
    <div class="figure-panel local-panel" id="local-figure-panel" hidden>${localVisualMarkup(map)}</div>
    <div class="segmented figure-switch" role="group" aria-label="Visualization type"><button class="active" data-figure-view="ai">AI figure</button><button data-figure-view="local">Evidence map</button></div>
    <p class="figure-caption">The full figure fits the panel automatically. Use 150% or 200% when you want to inspect details.</p>
    <div class="figure-actions"><button class="fig" id="download-figure">Download PNG</button><button class="fig" id="regenerate-figure">Regenerate</button></div>`, translationNote || 'The Gemini key stays on the Prism server. Bright image backgrounds are adapted to Prism automatically.');
  bindConceptMap(map);
  const image = document.querySelector('.ai-figure');
  if (image.complete) adaptFigureBackground(image);
  else image.addEventListener('load', () => adaptFigureBackground(image), { once: true });
  document.querySelectorAll('[data-figure-zoom]').forEach((button) => button.addEventListener('click', () => {
    const panel = document.querySelector('#ai-figure-panel');
    panel.dataset.zoom = button.dataset.figureZoom;
    document.querySelectorAll('[data-figure-zoom]').forEach((candidate) => candidate.classList.toggle('active', candidate === button));
  }));
  document.querySelectorAll('[data-figure-view]').forEach((button) => button.addEventListener('click', () => {
    const showAi = button.dataset.figureView === 'ai';
    document.querySelector('#ai-figure-panel').hidden = !showAi;
    document.querySelector('#local-figure-panel').hidden = showAi;
    document.querySelector('.figure-zoom').hidden = !showAi;
    document.querySelectorAll('[data-figure-view]').forEach((candidate) => candidate.classList.toggle('active', candidate === button));
  }));
  document.querySelector('#download-figure')?.addEventListener('click', () => downloadDataUrl(figure.dataUrl, figure.mimeType));
  document.querySelector('#regenerate-figure')?.addEventListener('click', async (event) => {
    if (!confirm('Generate a new image?')) return;
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Regenerating…';
    try {
      const replacement = await requestGeneratedFigure(true);
      renderAiVisual(map, replacement, translationNote);
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Regenerate';
      alert(`Could not regenerate the figure. ${truncate(error?.message || '', 160)}`);
    }
  });
}

function adaptFigureBackground(image) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 12;
    canvas.height = 12;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, 12, 12);
    const pixels = context.getImageData(0, 0, 12, 12).data;
    let bright = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if ((pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3 > 235 && pixels[index + 3] > 220) bright += 1;
    }
    image.classList.toggle('blend-light-background', bright / (pixels.length / 4) > 0.55);
  } catch { /* The original image remains usable if sampling is unavailable. */ }
}

function textLines(value, x, y, { width = 18, lines = 2, className = '' } = {}) {
  const words = String(value ?? '').trim().split(/\s+/u);
  const rows = [];
  let row = '';
  for (const word of words) {
    const candidate = row ? `${row} ${word}` : word;
    if (candidate.length <= width || !row) row = candidate;
    else { rows.push(row); row = word; }
  }
  if (row) rows.push(row);
  const visible = rows.slice(0, lines);
  if (rows.length > lines) visible[lines - 1] = truncate(visible[lines - 1], Math.max(4, width - 1));
  const startY = y - ((visible.length - 1) * 6);
  return `<text${className ? ` class="${className}"` : ''} x="${x}" y="${startY}">${visible.map((line, index) => `<tspan x="${x}" dy="${index ? 12 : 0}">${esc(line)}</tspan>`).join('')}</text>`;
}

function conceptMapSvg(map) {
  const positions = [[160,38],[258,82],[250,172],[160,212],[70,172],[62,82]];
  const positionById = new Map(map.nodes.map((node, index) => [node.id, positions[index % positions.length]]));
  return `<svg class="concept-map" viewBox="0 0 320 250" role="img" aria-label="Concept map for ${esc(map.title)}">
    <style>.map-topic-edge{stroke:#4d5775;stroke-width:1.5}.map-relation{stroke:#46d9a0;stroke-width:2.5;stroke-linecap:round}.map-node rect{fill:#1b2030;stroke:#4d5775}.map-node text{fill:#f5f7ff}.map-center{fill:url(#map-center);stroke:none}.map-title{fill:#fff;font-weight:700}.map-summary{fill:#fff;opacity:.82}</style>
    <defs><linearGradient id="map-center" x1="0" x2="1"><stop stop-color="#ff9f45"/><stop offset="1" stop-color="#a06bff"/></linearGradient></defs>
    ${map.nodes.map((node) => { const [x, y] = positionById.get(node.id); return `<path class="map-topic-edge" data-from="center" data-to="${node.id}" d="M160 125 L${x} ${y}"/>`; }).join('')}
    ${map.relations.map((relation) => { const [x1, y1] = positionById.get(relation.from); const [x2, y2] = positionById.get(relation.to); return `<path class="map-relation" data-from="${relation.from}" data-to="${relation.to}" d="M${x1} ${y1} L${x2} ${y2}"/>`; }).join('')}
    <rect class="map-center" x="93" y="96" width="134" height="58" rx="16"/>${textLines(map.title, 160, 119, { width: 24, className: 'map-title' })}${textLines(map.summary, 160, 140, { width: 34, lines: 1, className: 'map-summary' })}
    ${map.nodes.map((node) => { const [x,y]=positionById.get(node.id); return `<g class="map-node" data-node-id="${node.id}" role="button" tabindex="0" aria-label="${esc(node.label)}"><rect x="${x-51}" y="${y-18}" width="102" height="36" rx="12"/>${textLines(node.label, x, y + 4, { width: 16 })}</g>`; }).join('')}
  </svg>`;
}

function bindConceptMap(map) {
  const detail = document.querySelector('#visual-detail');
  const selectNode = (nodeId) => {
    const node = map.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return;
    const connected = connectedConcepts(map, nodeId);
    const activeIds = new Set([nodeId, ...connected.neighbors.map((neighbor) => neighbor.id)]);
    document.querySelectorAll('.map-node').forEach((element) => {
      element.classList.toggle('active', element.dataset.nodeId === nodeId);
      element.classList.toggle('dimmed', !activeIds.has(element.dataset.nodeId));
    });
    document.querySelectorAll('.concept-map path').forEach((edge) => {
      const related = edge.dataset.from === nodeId || edge.dataset.to === nodeId;
      edge.classList.toggle('active', related);
      edge.classList.toggle('dimmed', !related);
    });
    const neighborCopy = connected.neighbors.length ? `Connected on this page: ${connected.neighbors.map((neighbor) => neighbor.label).join(', ')}.` : 'No direct co-occurrence was found with the other top concepts.';
    const evidence = connected.relations[0]?.evidence || node.detail;
    detail.innerHTML = `<b>${esc(node.label)}</b><p>${esc(evidence)}</p><small>${esc(neighborCopy)}</small>`;
  };
  document.querySelectorAll('.map-node').forEach((node) => {
    node.addEventListener('click', () => selectNode(node.dataset.nodeId));
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectNode(node.dataset.nodeId); }
    });
  });
}

function downloadSvg(svg) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'prism-visual.svg';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadDataUrl(dataUrl, mimeType) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `prism-figure.${mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png'}`;
  link.click();
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
  const status = document.querySelector('#voice-status');
  const targetLanguage = outputLanguage === 'source' ? (analysis?.language || pageSource?.language || page?.language || 'en') : outputLanguage;
  let matchingVoices = [];
  let usedFallbackVoice = false;
  let playbackId = 0;
  const loadVoices = () => {
    const availableVoices = globalThis.speechSynthesis?.getVoices?.() ?? [];
    const languageVoices = voicesForLanguage(availableVoices, targetLanguage);
    usedFallbackVoice = languageVoices.length === 0 && availableVoices.length > 0;
    matchingVoices = languageVoices.length ? languageVoices : availableVoices;
    voiceSelect.innerHTML = matchingVoices.length
      ? matchingVoices.map((voice, index) => `<option value="${index}">${esc(voice.name)} · ${esc(voice.lang)}</option>`).join('')
      : `<option value="">No ${esc(languageName(targetLanguage))} voice installed</option>`;
    voiceSelect.disabled = matchingVoices.length === 0;
    playButton.disabled = matchingVoices.length === 0;
    if (!matchingVoices.length) status.textContent = 'Loading system voices…';
    else if (usedFallbackVoice) status.textContent = `No ${languageName(targetLanguage)} voice is installed; using an available system voice.`;
    else status.textContent = 'Ready.';
  };
  loadVoices();
  globalThis.speechSynthesis?.addEventListener?.('voiceschanged', loadVoices);
  // Chrome may populate voices after the panel has loaded without sending a
  // second event to this newly opened document. Retry briefly before leaving
  // Play disabled.
  let voiceRetries = 0;
  const retryVoices = () => {
    if (matchingVoices.length || voiceRetries++ >= 8) return;
    loadVoices();
    if (!matchingVoices.length) setTimeout(retryVoices, 250);
  };
  setTimeout(retryVoices, 100);
  playButton.onclick = () => {
    const synthesis = globalThis.speechSynthesis;
    if (!synthesis || !matchingVoices.length) return;
    playbackId += 1;
    const thisPlayback = playbackId;
    synthesis.cancel();
    const scope = document.querySelector('#listen-scope').value;
    const chunks = chunkSpeechText(copy[scope]);
    const voice = matchingVoices[Number(voiceSelect.value)] || matchingVoices[0];
    if (!chunks.length) { status.textContent = 'There is no readable text on this page.'; return; }
    const speakChunk = (index) => {
      if (thisPlayback !== playbackId) return;
      const utterance = new SpeechSynthesisUtterance(chunks[index]);
      utterance.rate = Number(document.querySelector('#listen-rate').value);
      utterance.lang = voice?.lang || targetLanguage;
      utterance.voice = voice || null;
      utterance.onstart = () => { status.textContent = `Playing… ${index + 1}/${chunks.length}`; };
      utterance.onend = () => {
        if (thisPlayback !== playbackId) return;
        if (index + 1 < chunks.length) speakChunk(index + 1);
        else status.textContent = 'Finished.';
      };
      utterance.onerror = () => { if (thisPlayback === playbackId) status.textContent = 'Browser voice playback failed. Try another voice.'; };
      synthesis.speak(utterance);
    };
    speakChunk(0);
  };
  // Server-generated narration is optional; browser speech remains the
  // dependable fallback when no server voice is configured.
  const geminiAudio = new Audio();
  geminiAudio.onended = () => { status.textContent = 'Finished.'; };
  geminiAudio.onplay = () => { status.textContent = 'Playing (Gemini voice)…'; };
  geminiAudio.onerror = () => { status.textContent = 'Generated voice playback failed. Try the browser voice.'; };
  document.querySelector('#listen-pause').onclick = () => {
    if (!geminiAudio.paused) { geminiAudio.pause(); status.textContent = 'Paused.'; return; }
    if (geminiAudio.src && geminiAudio.currentTime > 0 && geminiAudio.currentTime < geminiAudio.duration) {
      void geminiAudio.play();
      return;
    }
    const synthesis = globalThis.speechSynthesis;
    if (!synthesis) return;
    if (synthesis.paused) { synthesis.resume(); status.textContent = 'Playing…'; }
    else { synthesis.pause(); status.textContent = 'Paused.'; }
  };
  document.querySelector('#listen-stop').onclick = () => {
    playbackId += 1;
    globalThis.speechSynthesis?.cancel();
    geminiAudio.pause();
    geminiAudio.currentTime = 0;
    status.textContent = 'Stopped.';
  };
  document.querySelector('#listen-gemini').onclick = async (event) => {
    const button = event.currentTarget;
    playbackId += 1;
    globalThis.speechSynthesis?.cancel();
    geminiAudio.pause();
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
    storage: { session: { get: async () => ({}), set: async () => {}, remove: async () => {} }, local: { get: async () => ({ apiBaseUrl: location.origin }), set: async () => {} } },
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

/**
 * Prism side panel.
 *
 * The workflow, in one screen:
 *   the page you're on  →  enters the prism as light  →  refracts into ways to learn it
 *
 * The page is read only on an explicit click (activeTab + scripting), never in
 * the background, and never from any tab but the one in front of you.
 */

const BASE = 'http://localhost:8787';
const app = document.querySelector('#app');

/** Each ray out of the prism. `run` null => not wired to an engine yet. */
const WAYS = [
  { id: 'quiz',    label: 'Quiz',      hint: 'You answer, you don’t skim',  color: 'var(--ray-1)', run: null },
  { id: 'story',   label: 'Story',     hint: 'Retold as something that happened', color: 'var(--ray-2)', run: null },
  { id: 'digest',  label: 'Digest',    hint: 'The part that actually matters',   color: 'var(--ray-3)', run: showDigest },
  { id: 'numbers', label: 'Numbers',   hint: 'Pull the figures out and play',    color: 'var(--ray-4)', run: showNumbers },
  { id: 'growth',  label: 'Growth',    hint: 'Linear vs exponential, live',      color: 'var(--ray-5)', run: () => open('#core') },
  { id: 'future',  label: 'Your future', hint: 'Goals, fees, time horizon',      color: 'var(--ray-6)', run: () => open('#future') },
];

const RAY_Y = [22, 50, 78, 106, 134, 162];

let page = null;      // { url, host, title, restricted }
let content = null;   // { headings, sentences, figures } — filled on demand

// ---------------------------------------------------------------- page access

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isRestricted(url) {
  return !url || /^(chrome|edge|about|devtools|chrome-extension|moz-extension):/.test(url);
}

/**
 * Runs in the page. Pulls structure, not the whole DOM: headings, the first
 * sentence of substantial paragraphs, and any figures worth modelling.
 */
function extractInPage() {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

  const headings = [...document.querySelectorAll('h1,h2,h3')]
    .map((h) => clean(h.textContent))
    .filter((t) => t.length > 3 && t.length < 140)
    .slice(0, 8);

  const paras = [...document.querySelectorAll('article p, main p, p')]
    .map((p) => clean(p.textContent))
    .filter((t) => t.length > 90);

  const sentences = paras
    .slice(0, 14)
    .map((t) => {
      const m = t.match(/^.{40,190}?[.?!](\s|$)/);
      return m ? m[0].trim() : t.slice(0, 170) + '…';
    })
    .slice(0, 6);

  const body = paras.join(' ').slice(0, 20000);
  const figures = [...new Set(
    (body.match(/(?:\$\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:billion|million|trillion|bn|m|k))?|\d+(?:\.\d+)?\s?%|\d+(?:\.\d+)?\s?(?:years|year|months))/gi) || [])
      .map((s) => s.replace(/\s+/g, ' ').trim())
  )].slice(0, 12);

  return { headings, sentences, figures, wordCount: body.split(/\s+/).length };
}

async function readPage() {
  const tab = await activeTab();
  if (!tab || isRestricted(tab.url)) {
    return { restricted: true, url: tab?.url || '', title: tab?.title || '' };
  }
  const [res] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractInPage,
  });
  return { ...res.result, url: tab.url, title: tab.title, restricted: false };
}

// ---------------------------------------------------------------- rendering

function esc(s) {
  return String(s).replace(/[&<>'"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

function prismSvg() {
  const rays = WAYS.map((w, i) =>
    `<path class="ray" data-ray="${w.id}" stroke="${w.color}" d="M 140 96 L 306 ${RAY_Y[i]}"/>`
  ).join('');
  return `
  <svg class="scene" viewBox="0 0 320 190" role="img"
       aria-label="The current page entering a prism and refracting into six ways to learn it.">
    <path class="in"    d="M 12 92 L 105 92"/>
    <path class="spark" d="M 12 92 L 105 92"/>
    <path class="side" d="M 122 38 L 136 30 L 168 132 L 154 140 Z"/>
    <path class="base" d="M 90 140 L 104 132 L 168 132 L 154 140 Z"/>
    <path class="face" d="M 122 38 L 154 140 L 90 140 Z"/>
    <path class="internal" d="M 105 92 L 140 96"/>
    ${rays}
  </svg>`;
}

function sourceBlock() {
  const host = page.restricted ? 'this page is protected' : new URL(page.url).hostname.replace(/^www\./, '');
  return `
    <p class="eyebrow">The page you're on</p>
    <div class="source"><span class="dot"></span><span class="url">${esc(host)}</span></div>
    <p class="subtle">${esc(page.title || '')}</p>`;
}

function waysBlock() {
  return `<div class="ways">${WAYS.map((w) => `
    <button class="way" data-way="${w.id}" ${w.run ? '' : 'disabled'}>
      <span class="bar" style="background:${w.color}"></span>
      <span class="txt"><b>${esc(w.label)}</b><span>${esc(w.hint)}</span></span>
      ${w.run ? '' : '<span class="next">next</span>'}
    </button>`).join('')}</div>`;
}

function renderHome() {
  if (page.restricted) {
    app.innerHTML = `
      ${sourceBlock()}
      <div class="out"><p class="err">Prism can't read browser-protected pages.
      Open an article or a problem set and try again.</p></div>`;
    return;
  }
  app.innerHTML = `
    ${sourceBlock()}
    ${prismSvg()}
    <p class="eyebrow">Ways back out</p>
    ${waysBlock()}
    <p class="note">Prism reads this page only when you pick a way, and never any other tab.</p>`;
  bindWays();
}

function bindWays() {
  document.querySelectorAll('[data-way]').forEach((btn) => {
    const way = WAYS.find((w) => w.id === btn.dataset.way);
    if (!way?.run) return;
    btn.addEventListener('mouseenter', () => highlightRay(way.id));
    btn.addEventListener('mouseleave', () => highlightRay(null));
    btn.addEventListener('focus', () => highlightRay(way.id));
    btn.addEventListener('blur', () => highlightRay(null));
    btn.addEventListener('click', () => way.run());
  });
}

function highlightRay(id) {
  document.querySelectorAll('[data-ray]').forEach((r) => {
    r.classList.toggle('on', id !== null && r.dataset.ray === id);
    r.classList.toggle('dim', id !== null && r.dataset.ray !== id);
  });
}

function backButton() {
  const b = document.createElement('button');
  b.className = 'back';
  b.textContent = '← Back to the prism';
  b.onclick = renderHome;
  return b;
}

async function ensureContent() {
  if (!content) content = await readPage();
  return content;
}

// ---------------------------------------------------------------- the ways

async function showDigest() {
  app.innerHTML = `${sourceBlock()}<p class="spin">Reading…</p>`;
  const c = await ensureContent();
  const items = (c.sentences || []);
  app.innerHTML = `
    ${sourceBlock()}
    <div class="out">
      <h3>The part that actually matters</h3>
      ${items.length
        ? `<ul>${items.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`
        : `<p class="err">Couldn't find enough article text on this page.</p>`}
      ${c.headings?.length ? `<p class="note">Sections: ${esc(c.headings.slice(0, 4).join(' · '))}</p>` : ''}
      ${c.wordCount ? `<p class="note">${c.wordCount.toLocaleString()} words on the page.</p>` : ''}
    </div>`;
  app.append(backButton());
}

async function showNumbers() {
  app.innerHTML = `${sourceBlock()}<p class="spin">Reading…</p>`;
  const c = await ensureContent();
  const figs = c.figures || [];
  app.innerHTML = `
    ${sourceBlock()}
    <div class="out">
      <h3>Numbers on this page</h3>
      ${figs.length
        ? `<div class="figs">${figs.map((f) => `<button class="fig" data-fig="${esc(f)}">${esc(f)}</button>`).join('')}</div>
           <p class="note">Pick a rate or an amount to model it in Prism.</p>`
        : `<p class="err">No figures found on this page.</p>`}
    </div>`;
  document.querySelectorAll('[data-fig]').forEach((b) => {
    b.onclick = () => {
      const raw = b.dataset.fig;
      const pct = /%/.test(raw);
      const n = parseFloat(raw.replace(/[^0-9.]/g, ''));
      // A rate drives the growth lesson; an amount drives the projection.
      open(pct ? `#core?rate=${n}` : `#future?amount=${n}`);
    };
  });
  app.append(backButton());
}

function open(hash) {
  chrome.tabs.create({ url: `${BASE}/${hash}` });
}

// ---------------------------------------------------------------- boot

/**
 * Dev preview: opening sidepanel.html straight in a browser has no chrome.*
 * APIs. Stub just enough to iterate on the panel's design without reloading
 * the unpacked extension each time. Never runs inside Chrome as an extension.
 */
function devShim() {
  if (typeof chrome !== 'undefined' && chrome.tabs) return false;
  globalThis.chrome = {
    tabs: {
      query: async () => [{ id: 1, url: 'https://www.wsj.com/finance/rate-cuts', title: 'What falling rates mean for your savings' }],
      create: ({ url }) => window.open(url, '_blank'),
      onActivated: { addListener() {} },
      onUpdated: { addListener() {} },
    },
    scripting: {
      executeScript: async () => [{ result: {
        headings: ['What changed', 'Why bond prices move', 'What it means for savers'],
        sentences: [
          'The Federal Reserve cut its benchmark rate by a quarter point, the third reduction this year.',
          'When rates fall, previously issued bonds paying higher coupons become more valuable.',
          'Savers holding cash see yields on money-market funds drift down within weeks.',
        ],
        figures: ['0.25 %', '$1.2 trillion', '4.5 %', '10 years', '$500'],
        wordCount: 1840,
      } }],
    },
    storage: { session: { get: async () => ({}), set: async () => {}, remove: async () => {} } },
  };
  return true;
}

async function boot() {
  page = await readPage();
  content = page.restricted ? null : page;
  renderHome();
}

devShim();

boot();
chrome.tabs.onActivated.addListener(boot);
chrome.tabs.onUpdated.addListener((_id, info) => { if (info.status === 'complete') boot(); });

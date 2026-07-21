import { renderLesson } from './lesson.js';

const BASE = 'http://localhost:8787';
const app = document.querySelector('#app');
const labels = [['explain', 'Explain this'], ['solve', 'Help me solve it'], ['check', 'Check my work'], ['quiz', 'Quiz me']];

async function load() {
  const { pendingContext } = await chrome.storage.session.get('pendingContext');
  if (pendingContext?.error) {
    app.innerHTML = `<div class="error">${escapeHtml(pendingContext.error)}</div>${manual()}`;
    bind();
    return;
  }
  if (pendingContext?.text) {
    app.innerHTML = `<div class="eyebrow">Context preview</div><div class="card"><div class="selection">${escapeHtml(pendingContext.text)}</div><p class="muted">Only this selection will be shared · ${escapeHtml(pendingContext.pageTitle || 'Current page')}</p></div><div class="eyebrow">What do you want to do?</div><div class="goals">${labels.map(([id, l]) => `<button data-goal="${id}">${l}</button>`).join('')}</div><p class="muted">Prism asks your goal before teaching and never reads other tabs.</p>`;
    bind(pendingContext);
    return;
  }
  app.innerHTML = `<div class="eyebrow">Start learning</div><h2>Highlight anything on a page, then right-click “Learn this with Prism.”</h2>${manual()}<button class="primary" data-open="future">Open Prism Future</button>`;
  bind();
}

function manual() {
  return `<div class="card"><label for="topic"><strong>Or type a topic</strong></label><textarea id="topic" placeholder="Linear vs exponential growth…"></textarea><button class="primary" id="open-core">Start in Prism Core</button></div>`;
}

function bind(ctx) {
  document.querySelectorAll('[data-goal]').forEach((b) => {
    b.onclick = async () => {
      await chrome.storage.session.set({ lastSelectedGoal: b.dataset.goal });
      if (ctx?.text) return generate(ctx);
      window.open(`${BASE}/#core`, '_blank');
    };
  });
  document.querySelector('#open-core')?.addEventListener('click', () => {
    const topic = document.querySelector('#topic')?.value.trim();
    if (topic) return generate({ text: topic });
    window.open(`${BASE}/#core`, '_blank');
  });
  document.querySelector('[data-open="future"]')?.addEventListener('click', () => window.open(`${BASE}/#future`, '_blank'));
}

/** Sends the captured selection to the generation engine and renders the lesson. */
async function generate(ctx) {
  app.innerHTML = `<div class="eyebrow">Building your lesson</div><div class="card"><p>Reading the passage and writing the study assets…</p><p class="muted">This takes about half a minute.</p></div>`;
  try {
    const res = await fetch(`${BASE}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: ctx.text, ...(ctx.pageTitle ? { title: ctx.pageTitle } : {}), ...(ctx.pageUrl ? { sourceUrl: ctx.pageUrl } : {}) }),
    });
    const body = await res.json();
    if (!res.ok) {
      app.innerHTML = `<div class="error">${escapeHtml(body.error || `Request failed (${res.status})`)}</div>
        <p class="muted">${res.status === 501 ? 'The server has no GEMINI_API_KEY set.' : 'Is the Prism server running on localhost:8787?'}</p>`;
      return bindRetry(ctx);
    }
    renderLesson(body, app);
  } catch {
    app.innerHTML = `<div class="error">Could not reach the Prism server.</div><p class="muted">Start it with <code>npm run dev</code>, then try again.</p>`;
    bindRetry(ctx);
  }
}

function bindRetry(ctx) {
  const button = document.createElement('button');
  button.className = 'primary';
  button.textContent = 'Try again';
  button.onclick = () => generate(ctx);
  app.append(button);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

load();
chrome.storage.onChanged.addListener((_, area) => { if (area === 'session') load(); });

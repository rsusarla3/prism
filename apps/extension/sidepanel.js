/**
 * Prism side panel logic. Talks to the web API via the background SW
 * (chrome.runtime.sendMessage type:'api'), so no cross-origin fetch from the
 * panel itself. Server-side answer gating is enforced by the backend.
 */

const $ = (id) => document.getElementById(id);
const GOALS = [
  ['explain', 'Explain this'],
  ['solve', 'Help me solve it'],
  ['check', 'Check my work'],
  ['quiz', 'Quiz me'],
  ['summarize', 'Summarize it'],
  ['prerequisite', 'Teach prerequisite'],
];
let goal = 'solve';
let sessionId = null;
let selectedText = '';

function log(msg, cls) {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  d.textContent = msg;
  $('log').appendChild(d);
  $('log').scrollTop = $('log').scrollHeight;
}

function renderGoals() {
  $('goals').innerHTML = '';
  GOALS.forEach(([k, label]) => {
    const el = document.createElement('div');
    el.className = 'goal' + (k === goal ? ' active' : '');
    el.textContent = label;
    el.onclick = () => { goal = k; renderGoals(); };
    $('goals').appendChild(el);
  });
}
renderGoals();

async function api(path, body) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'api', path, body }, (res) => {
      resolve(res && res.ok ? res.data : { error: (res && res.error) || 'no response' });
    });
  });
}

// Receive a selection pushed from the context menu.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'selection' && msg.text) {
    selectedText = msg.text;
    $('shared').textContent = msg.text;
    $('flow').style.display = 'block';
    $('sub').textContent = 'Confirm the shared content, then pick a goal.';
  }
});

// If the panel opened without a selection, allow manual paste.
if (!selectedText) {
  $('shared').textContent = '— paste or highlight on the page —';
}

$('start').onclick = async () => {
  const text = $('shared').textContent;
  const r = await api('/api/session/start', { surface: 'school', selectedText: text, inputType: 'text-selection' });
  sessionId = r.sessionId;
  $('coach').style.display = 'block';
  log(`Classified: ${r.classification?.domain}/${r.classification?.conceptId || 'unknown'}${r.classification?.isHomework ? ' (homework)' : ''}`);
  log(`Goal: ${goal}`);
};

$('submit').onclick = async () => {
  const val = $('attempt').value;
  const r = await api('/api/session/attempt', { sessionId, kind: 'equation-step', value: val });
  if (r.error) { log(r.error, 'warn'); return; }
  const v = r.verification;
  log(`Attempt "${val}" → ${v.correct ? 'CORRECT' : 'incorrect'}: ${v.reason}`, v.correct ? 'ok' : 'warn');
  if (r.nextHint) log(`Hint (${r.nextHint.level}): ${r.nextHint.text}`);
  $('reveal').disabled = !r.answerUnlocked;
  if (r.recommendation) {
    const rec = r.recommendation;
    $('modeRec').innerHTML = `<div class="card" style="margin-top:8px"><b>Switch method?</b><br>${rec.observedReason}<br><i>${rec.proposedMethod}</i> — ${rec.expectedBenefit}<br><button class="ghost">Switch</button> <button class="ghost">Stay here</button></div>`;
  }
};

$('reveal').onclick = async () => {
  const r = await api('/api/session/reveal', { sessionId });
  if (r.error) { log(r.error, 'warn'); return; }
  log(`Answer: ${r.finalAnswer}`, 'ok');
  log('Solution:\n' + (r.fullSolution || []).join('\n'));
};

/**
 * Renders a StudyBundle in the side panel.
 *
 * Narration uses the browser's SpeechSynthesis rather than server audio on
 * purpose: its `onboundary` events give word-level positions, which is what
 * karaoke highlighting needs and what POST /api/generate/media cannot supply.
 * Server audio remains the better choice when voice quality matters more than
 * highlighting.
 */

export function renderLesson(bundle, host) {
  host.innerHTML = `
    <div class="eyebrow">${esc(bundle.meta.contentType)} · grade ${esc(bundle.meta.inferredGrade)}</div>
    <h2 class="title">${esc(bundle.meta.title)}</h2>
    ${sectionRead(bundle)}
    ${sectionListen(bundle)}
    ${sectionWatch(bundle)}
    ${sectionExplore(bundle)}
    ${sectionQuiz(bundle)}
  `;
  wireListen(bundle, host);
  wireQuiz(bundle, host);
}

/* ---------- Read ---------- */

function sectionRead(bundle) {
  const segments = bundle.read.segments.map((segment, i) => `
    <div class="card">
      <p>${esc(segment.text)}</p>
      <p class="muted"><strong>Recap:</strong> ${esc(segment.recap)}</p>
      ${segment.glosses.length ? `<div class="glosses">${segment.glosses.map(gloss =>
        `<span class="gloss" title="${esc(gloss.definition)}">${esc(gloss.term)}</span>`).join('')}</div>` : ''}
      <div class="seg-id muted">segment ${i + 1}</div>
    </div>`).join('');
  return `<div class="eyebrow">Step 1 · Read</div>${segments}`;
}

/* ---------- Listen ---------- */

function sectionListen(bundle) {
  const words = bundle.listen.script.split(/(\s+)/);
  let offset = 0;
  const spans = words.map((word) => {
    if (!word.trim()) { offset += word.length; return word; }
    const start = offset;
    offset += word.length;
    return `<span class="w" data-start="${start}">${esc(word)}</span>`;
  }).join('');
  return `
    <div class="eyebrow">Step 2 · Listen</div>
    <div class="card">
      <button class="primary" id="play">Play narration</button>
      <p class="muted" id="listen-note">Uses your browser's built-in voice.</p>
      <p class="script" id="script">${spans}</p>
    </div>`;
}

function wireListen(bundle, host) {
  const playBtn = host.querySelector('#play');
  const note = host.querySelector('#listen-note');
  if (!playBtn) return;

  if (!('speechSynthesis' in window)) {
    playBtn.disabled = true;
    note.textContent = 'This browser has no speech synthesis.';
    return;
  }

  const spans = [...host.querySelectorAll('#script .w')];
  let utterance = null; // held to dodge a Chrome GC bug that silences playback

  const clear = () => spans.forEach((s) => s.classList.remove('on'));
  const stop = () => { speechSynthesis.cancel(); clear(); playBtn.textContent = 'Play narration'; };

  playBtn.onclick = () => {
    if (speechSynthesis.speaking) return stop();

    utterance = new SpeechSynthesisUtterance(bundle.listen.script);
    utterance.lang = bundle.meta.language || 'en-US';
    utterance.onboundary = (e) => {
      if (e.charIndex === undefined) return;
      clear();
      // Highlight the last word starting at or before the spoken character.
      let current = null;
      for (const span of spans) {
        if (Number(span.dataset.start) <= e.charIndex) current = span; else break;
      }
      current?.classList.add('on');
    };
    utterance.onend = stop;
    utterance.onerror = (e) => {
      stop();
      if (e.error !== 'canceled' && e.error !== 'interrupted') note.textContent = `Speech failed (${e.error}).`;
    };
    speechSynthesis.speak(utterance);
    playBtn.textContent = 'Stop';
  };
}

/* ---------- Watch ---------- */

function sectionWatch(bundle) {
  const steps = bundle.watch.steps.map((step, i) =>
    `<li><strong>${esc(step.caption)}</strong><br><span class="muted">${esc(step.description)}</span></li>`).join('');
  return `
    <div class="eyebrow">Step 3 · Watch</div>
    <div class="card">
      <ol class="steps">${steps}</ol>
      <p class="muted">${esc(bundle.watch.altText)}</p>
    </div>`;
}

/* ---------- Explore ---------- */

function sectionExplore(bundle) {
  const parts = [];
  if (bundle.explore.timeline?.length) {
    const entries = [...bundle.explore.timeline].sort((a, b) => a.order - b.order)
      .map((entry) => `<li><strong>${esc(entry.label)}</strong><br><span class="muted">${esc(entry.detail)}</span></li>`).join('');
    parts.push(`<div class="card"><ol class="steps">${entries}</ol></div>`);
  }
  if (bundle.explore.data?.series?.length) parts.push(dataTable(bundle.explore.data));
  if (!parts.length) return '';
  return `<div class="eyebrow">Step 4 · Explore</div>${parts.join('')}`;
}

function dataTable(data) {
  const metrics = [...new Set(data.series.flatMap((s) => s.points.map((p) => String(p.x))))];
  const max = Math.max(...data.series.flatMap((s) => s.points.map((p) => Number(p.y) || 0)), 1);
  const rows = metrics.map((metric) => {
    const bars = data.series.map((series) => {
      const point = series.points.find((p) => String(p.x) === metric);
      const value = point ? Number(point.y) : 0;
      return `<div class="barrow"><span class="bname muted">${esc(series.name)}</span>
        <span class="bar"><span class="fill" style="width:${(value / max) * 100}%"></span></span>
        <span class="bval">${esc(point ? point.y : '—')}</span></div>`;
    }).join('');
    return `<div class="metric"><div class="mname">${esc(metric)}</div>${bars}</div>`;
  }).join('');
  return `<div class="card"><p class="muted">${esc(data.caption)}</p>${rows}</div>`;
}

/* ---------- Quiz ---------- */

function sectionQuiz(bundle) {
  const items = bundle.quiz.items.map((item, i) => `
    <div class="card quiz-item" data-item="${i}">
      <div class="muted">Q${i + 1} / ${bundle.quiz.items.length}${item.kind === 'transfer' ? ' · transfer' : ''}</div>
      <p><strong>${esc(item.stem)}</strong></p>
      <div class="goals">${item.options.map((option, j) =>
        `<button data-opt="${j}" data-correct="${option.correct ? '1' : '0'}">${esc(option.text)}</button>`).join('')}</div>
      <div class="fb" hidden></div>
    </div>`).join('');
  return `<div class="eyebrow">Step 5 · Quiz</div>${items}`;
}

function wireQuiz(bundle, host) {
  host.querySelectorAll('.quiz-item').forEach((card) => {
    const item = bundle.quiz.items[Number(card.dataset.item)];
    const feedback = card.querySelector('.fb');
    card.querySelectorAll('[data-opt]').forEach((button) => {
      button.onclick = () => {
        const option = item.options[Number(button.dataset.opt)];
        card.querySelectorAll('[data-opt]').forEach((b) => b.classList.remove('picked'));
        button.classList.add('picked');
        feedback.hidden = false;
        // Every option carries feedback by contract: testing WITH feedback is
        // 0.73 SD versus 0.39 without, so a wrong pick still has to teach.
        feedback.className = `fb ${option.correct ? 'ok' : 'no'}`;
        feedback.innerHTML = `<strong>${option.correct ? 'Correct' : 'Not quite'}</strong> — ${esc(trimVerdict(option.feedback))}`
          + (option.correct ? `<br><span class="muted">${esc(item.explanation)}</span>` : '');
      };
    });
  });
}

/** Models often open feedback with their own verdict, which doubles up with the badge. */
function trimVerdict(text) {
  return text.replace(/^(correct|incorrect|not quite|wrong)[!.,:]?\s*/i, '') || text;
}

function esc(value) {
  return String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

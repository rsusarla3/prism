/**
 * Adaptive tutoring loop — the client half of /api/learn/*.
 *
 * The server holds the answers. `publicQuiz` strips answerIndex and explains
 * before sending, so this module cannot mark a question locally even if it
 * wanted to: it submits the learner's picks and renders whatever comes back.
 * That is the answer gate working as designed, not a limitation to route
 * around, and it is why the worked solution stays disabled until a real
 * attempt is recorded server-side.
 */

/** Asks whether the captured text maps to an approved curriculum concept. */
export async function classifyText(post, text) {
  return post('/api/learn/classify', { text });
}

/** Opens a tutoring session and returns the diagnostic quiz plus the first hint. */
export async function startSession(post, conceptId) {
  return post('/api/learn/start', { conceptId });
}

/** Submits every answer at once; the server scores, records the attempt, and opens the gate. */
export async function submitAnswers(post, sessionId, answers) {
  return post('/api/learn/quiz', { sessionId, answers });
}

export function tutorQuizHtml(session, esc) {
  const questions = session.quiz.questions.map((question, i) => `
    <section class="quiz-item" data-question="${i}">
      <p class="question-count">${i + 1} / ${session.quiz.questions.length}</p>
      <h3>${esc(question.prompt)}</h3>
      <div class="quiz-options">${question.options.map((option, j) =>
        `<button data-option="${j}">${esc(option)}</button>`).join('')}</div>
    </section>`).join('');

  return `<div class="result-head"><span>Quiz me</span><small>${esc(session.title)}</small></div>
    ${session.hint ? `<div class="tutor-hint"><strong>Hint</strong> ${esc(session.hint)}</div>` : ''}
    <div class="quiz-list">${questions}</div>
    <button class="tutor-submit" id="tutor-submit" disabled>Submit answers</button>
    <div class="tutor-result" id="tutor-result" hidden></div>`;
}

/**
 * Wires answer selection, submission, and the gated solution reveal.
 * `deps` carries the panel's own helpers so this module stays display-agnostic.
 */
export function bindTutor(session, { root, post, get, esc }) {
  const answers = new Array(session.quiz.questions.length).fill(-1);
  const submit = root.querySelector('#tutor-submit');
  const result = root.querySelector('#tutor-result');

  root.querySelectorAll('.quiz-item').forEach((card) => {
    const index = Number(card.dataset.question);
    card.querySelectorAll('[data-option]').forEach((button) => {
      button.addEventListener('click', () => {
        answers[index] = Number(button.dataset.option);
        card.querySelectorAll('[data-option]').forEach((other) => other.classList.remove('picked'));
        button.classList.add('picked');
        // Every question must be attempted before the gate can open.
        submit.disabled = answers.includes(-1);
      });
    });
  });

  submit.addEventListener('click', async () => {
    submit.disabled = true;
    submit.textContent = 'Checking…';
    try {
      const outcome = await submitAnswers(post, session.sessionId, answers);
      renderOutcome(outcome);
    } catch (error) {
      result.hidden = false;
      result.innerHTML = `<p class="tutor-error">${esc(error.message)}</p>`;
      submit.disabled = false;
      submit.textContent = 'Submit answers';
    }
  });

  function renderOutcome(outcome) {
    submit.hidden = true;
    result.hidden = false;

    const marks = outcome.score.perQuestion.map((entry, i) =>
      `<li class="${entry.correct ? 'ok' : 'no'}"><strong>Q${i + 1}</strong> ${entry.correct ? 'Correct' : 'Not yet'} — ${esc(entry.explains)}</li>`).join('');

    result.innerHTML = `
      <p class="tutor-score"><strong>${outcome.score.correct} / ${outcome.score.total}</strong> correct
        · mastery ${Math.round((outcome.mastery ?? 0) * 100)}%</p>
      <ul class="tutor-marks">${marks}</ul>
      ${outcome.hint ? `<div class="tutor-hint"><strong>Next hint</strong> ${esc(outcome.hint)}</div>` : ''}
      ${outcome.recommendation ? `<div class="tutor-rec">
        <strong>Try a different way?</strong> ${esc(outcome.recommendation.observedReason)}
        ${esc(outcome.recommendation.expectedBenefit)}</div>` : ''}
      ${outcome.gateOpen
        ? '<button class="tutor-submit" id="tutor-solution">Show the worked solution</button>'
        : '<p class="note">The worked solution unlocks once an attempt is recorded.</p>'}
      <div id="tutor-solution-body"></div>`;

    result.querySelector('#tutor-solution')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = 'Unlocking…';
      try {
        const solution = await get(`/api/learn/solution?sessionId=${encodeURIComponent(session.sessionId)}`);
        button.remove();
        result.querySelector('#tutor-solution-body').innerHTML = solutionHtml(solution, esc);
      } catch (error) {
        button.disabled = false;
        button.textContent = 'Show the worked solution';
        result.querySelector('#tutor-solution-body').innerHTML = `<p class="tutor-error">${esc(error.message)}</p>`;
      }
    });
  }
}

function solutionHtml(solution, esc) {
  const steps = solution.workedExample.map((step) =>
    `<li>${esc(step.explanation)}${step.expression ? ` <code>${esc(step.expression)}</code>` : ''}</li>`).join('');
  return `<h3>Worked example</h3><ol class="steps">${steps}</ol>
    <h3>Now try this one</h3><p>${esc(solution.similarProblem.prompt)}</p>`;
}

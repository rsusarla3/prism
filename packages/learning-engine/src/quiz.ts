/**
 * Quiz generation + scoring for the comprehension-check flow (spec §7.1 Life
 * "Short comprehension check" and School end-of-session review).
 *
 * Questions are derived from the APPROVED curriculum (objectives /
 * misconceptions) — never invented by the model — so the check stays inside
 * curriculum authority (spec §6.10). Scoring is deterministic.
 */

import type { CurriculumConcept } from 'prism-shared';

export interface QuizQuestion {
  id: string;
  prompt: string;
  /** Multiple-choice options (shuffled at build time for variety). */
  options: string[];
  /** Index into options of the correct answer. */
  answerIndex: number;
  explains: string;
}

export interface Quiz {
  conceptId: string;
  questions: QuizQuestion[];
}

function shuffle<T>(arr: T[], seed: number): T[] {
  // Deterministic shuffle from a numeric seed (no Math.random — reproducible).
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function distractorsFor(answer: string, misconceptions: string[]): string[] {
  const n = Number(answer);
  if (Number.isFinite(n) && n !== 0) {
    const decimals = (answer.split('.')[1] ?? '').length;
    const format = (value: number) => value.toFixed(decimals);
    return [format(n * 1.12), format(n * 0.88), format(n * 1.05)].filter((value) => value !== answer);
  }
  const candidates = misconceptions.slice(0, 3);
  return candidates.length ? candidates : ['None of these'];
}

/**
 * Build a 3-question quiz from a concept. Two questions test objectives
 * (positive framing), one tests a known misconception (so we catch it).
 */
export function buildQuiz(concept: CurriculumConcept, seed = Date.now()): Quiz {
  const questions: QuizQuestion[] = [];
  const objs = concept.objectives;
  const mis = concept.misconceptions;

  // Q1: which statement matches an objective?
  if (objs[0]) {
    const correct = objs[0];
    const distractors = objs.slice(1).concat(mis.slice(0, 1));
    const opts = shuffle([correct, ...distractors.slice(0, 3)], seed + 1);
    questions.push({
      id: 'obj1',
      prompt: `Which best describes the goal of "${concept.title}"?`,
      options: opts,
      answerIndex: opts.indexOf(correct),
      explains: correct,
    });
  }

  // Q2: misconception trap
  if (mis[0]) {
    const correct = `False: ${mis[0]}`;
    const opts = shuffle([correct, `True: ${mis[0]}`], seed + 2);
    questions.push({
      id: 'mis1',
      prompt: `True or false: ${mis[0]}`,
      options: opts,
      answerIndex: opts.indexOf(correct),
      explains: `That is a common misconception. ${concept.objectives[0] ?? ''}`,
    });
  }

  // Q3: apply — pick the correct similar-problem answer
  const answer = concept.similarProblem.answer;
  const opts = shuffle([answer, ...distractorsFor(answer, mis)], seed + 3).slice(0, 4);
  questions.push({
    id: 'apply',
    prompt: concept.similarProblem.prompt,
    options: opts,
    answerIndex: opts.indexOf(answer),
    explains: `Answer: ${answer}.`,
  });

  return { conceptId: concept.id, questions };
}

export interface QuizScore {
  correct: number;
  total: number;
  perQuestion: { id: string; correct: boolean; explains: string }[];
}

/** Score submitted answer indices against the quiz. */
export function scoreQuiz(quiz: Quiz, answers: number[]): QuizScore {
  const perQuestion = quiz.questions.map((q, i) => ({
    id: q.id,
    correct: answers[i] === q.answerIndex,
    explains: q.explains,
  }));
  return {
    correct: perQuestion.filter((p) => p.correct).length,
    total: quiz.questions.length,
    perQuestion,
  };
}

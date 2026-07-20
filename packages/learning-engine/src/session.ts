/**
 * Session state machine + learner mastery model.
 *
 * Enforces the core policy from spec §2.1 / AGENTS.md rule 4: the final answer
 * is locked server-side until a meaningful attempt is recorded. The state
 * machine is the single place that mutates gating and mastery.
 */

import type { Session, Attempt, AttemptKind } from 'prism-shared';

const MEANINGFUL: AttemptKind[] = [
  'equation-step',
  'strategy',
  'explanation',
  'numeric',
  'similar-exercise',
];
// 'image' alone is meaningful only if a step description accompanies it;
// for V1 we treat any non-empty image attempt as meaningful.

export function isMeaningfulAttempt(a: Attempt): boolean {
  if (a.kind === 'image') return a.value.trim().length > 0;
  return MEANINGFUL.includes(a.kind) && a.value.trim().length > 0;
}

export function createSession(id: string, now = Date.now()): Session {
  return {
    id,
    surface: 'school',
    goal: null,
    classification: null,
    conceptId: null,
    attempts: [],
    events: [],
    gating: { attemptMade: false, finalAnswer: '', fullSolution: [] },
    phase: 'classifying',
    mastery: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Record an attempt. Opens the server-side gate the first time a meaningful
 * attempt is seen. Returns the mutated session (caller persists).
 */
export function recordAttempt(session: Session, attempt: Attempt): Session {
  session.attempts.push(attempt);
  if (!session.gating.attemptMade && isMeaningfulAttempt(attempt)) {
    session.gating.attemptMade = true;
    session.events.push({ type: 'gating-opened', at: Date.now() });
  }
  session.updatedAt = Date.now();
  return session;
}

/**
 * Update mastery. Per spec §8.3 step 12: mastery is driven primarily by the
 * similar-problem result, NOT by viewing the solution.
 */
export function updateMastery(session: Session, similarCorrect: boolean): Session {
  const target = similarCorrect ? 1 : 0.15;
  // Weight the new evidence at 0.6 so a first success clearly registers,
  // while still smoothing against prior mastery.
  session.mastery = Math.round((session.mastery * 0.4 + target * 0.6) * 1000) / 1000;
  session.updatedAt = Date.now();
  return session;
}

/** Whether the server may release the answer now. */
export function mayRevealAnswer(session: Session): boolean {
  return session.gating.attemptMade;
}

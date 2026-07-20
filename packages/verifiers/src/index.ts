/**
 * Verifier dispatcher — single entry point the server calls so the model
 * never performs "math." Curriculum objects declare which verifier kind they
 * use; this module routes deterministically.
 */

export { parseLinear, solveLinear, verifyLinearSolution } from './linear.js';
export { compoundGrowth, verifyCompoundGuess, round2 } from './finance.js';

import { verifyLinearSolution } from './linear.js';
import { verifyCompoundGuess } from './finance.js';
import type { CurriculumConcept, VerificationResult, Attempt, FinancialProfile } from 'prism-shared';
/**
 * Verify a learner attempt against the concept's canonical answer.
 * `context` carries the data the verifier needs (equation sides, finance profile).
 */
export function verifyAttempt(
  concept: CurriculumConcept,
  attempt: Attempt,
  context: { lhs?: string; rhs?: string; profile?: FinancialProfile },
): VerificationResult {
  try {
    switch (concept.verifier) {
      case 'linear-equation': {
        if (!context.lhs || !context.rhs) {
          return { correct: false, reason: 'Missing equation sides for verification.' };
        }
        const r = verifyLinearSolution(context.lhs, context.rhs, attempt.value);
        return r.correct
          ? { correct: true, reason: 'Correct — the solution satisfies the equation.' }
          : {
              correct: false,
              reason: r.solution === null
                ? 'This equation has no unique solution.'
                : `Not quite. The correct solution is x = ${r.solution}.`,
            };
      }
      case 'numeric': {
        if (!context.profile) {
          return { correct: false, reason: 'Missing finance profile for verification.' };
        }
        const r = verifyCompoundGuess(context.profile, Number(attempt.value));
        return r.correct
          ? { correct: true, reason: 'Within tolerance of the projected balance.' }
          : { correct: false, reason: `Close, but the projected balance is ${r.expected}.` };
      }
      case 'expression': {
        // Canonicalized-string equality (deterministic, no solver dependency).
        return attempt.value.trim() === concept.similarProblem.answer.trim()
          ? { correct: true, reason: 'Expression matches the canonical form.' }
          : { correct: false, reason: 'Expression does not match the canonical answer.' };
      }
      default:
        return { correct: false, reason: 'Unknown verifier kind.' };
    }
  } catch (err) {
    return { correct: false, reason: `Verification error: ${(err as Error).message}` };
  }
}

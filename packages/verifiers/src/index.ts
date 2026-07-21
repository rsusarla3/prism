/**
 * Verifier dispatcher — single entry point the server calls so the model
 * never performs "math." Curriculum objects declare which verifier kind they
 * use; this module routes deterministically.
 */

export { parseLinear, solveLinear, verifyLinearSolution } from './linear.js';
export { compoundGrowth, verifyCompoundGuess, round2 } from './finance.js';
export { compareGrowth, verifyGrowthPrediction } from './growth.js';
export { futureValueWithContributions, projectInvestment, compareInvestmentScenarios, verifyInvestmentGuess } from './invest.js';

import type { AssetClassInfo } from 'prism-shared';

/** Basic descriptions of ETFs, individual stocks, and bonds (Prism Future). */
export const ASSET_CLASSES: AssetClassInfo[] = [
  {
    id: 'etf',
    title: 'ETFs (Exchange-Traded Funds)',
    description:
      'A single ETF share represents ownership of many underlying securities. Broad ETFs diversify across companies, so one company failing barely moves the fund. You pay an expense ratio (a small annual fee), not a purchase commission.',
  },
  {
    id: 'stock',
    title: 'Individual Stocks',
    description:
      'Buying a share makes you a part-owner of one company. Returns can be high but risk is concentrated: a single bad quarter can cut the value sharply. Most retail investors hold stocks inside a diversified fund rather than alone.',
  },
  {
    id: 'bond',
    title: 'Bonds',
    description:
      'A bond is a loan you make to a government or company that pays periodic interest and returns principal at maturity. Generally lower risk and lower expected return than stocks, which is why bonds are often used to steady a portfolio.',
  },
];

/** Suggested onboarding keywords for Prism Future (user may also add custom). */
export const SUGGESTED_KEYWORDS: string[] = [
  'retirement',
  'buy a home',
  'emergency fund',
  'kid’s education',
  'travel fund',
  'pay off debt',
  'financial independence',
];

export const FUTURE_GOALS = [
  { id: 'peace', label: 'Everyday peace of mind', category: 'security' },
  { id: 'emergency', label: 'Emergency reserve', category: 'security' },
  { id: 'debt-free', label: 'Live debt-free', category: 'security' },
  { id: 'healthcare', label: 'Cover future healthcare', category: 'security' },
  { id: 'age-home', label: 'Age in my own home', category: 'security' },
  { id: 'retire', label: 'Retire earlier', category: 'freedom' },
  { id: 'independence', label: 'Financial independence', category: 'freedom' },
  { id: 'part-time', label: 'Work only if I want', category: 'freedom' },
  { id: 'travel', label: 'Travel more', category: 'lifestyle' },
  { id: 'family-time', label: 'More family time', category: 'family' },
  { id: 'friends', label: 'Stay close to friends', category: 'family' },
  { id: 'grandchildren', label: 'Be there for grandchildren', category: 'family' },
  { id: 'caregiving', label: 'Care for loved ones', category: 'family' },
  { id: 'hobbies', label: 'Enjoy my hobbies', category: 'lifestyle' },
  { id: 'creative', label: 'Make more art', category: 'lifestyle' },
  { id: 'outdoors', label: 'Spend time outdoors', category: 'lifestyle' },
  { id: 'health', label: 'Stay active & healthy', category: 'lifestyle' },
  { id: 'learn', label: 'Keep learning', category: 'achievement' },
  { id: 'volunteer', label: 'Volunteer', category: 'achievement' },
  { id: 'purpose', label: 'Live with purpose', category: 'achievement' },
  { id: 'community', label: 'Support my community', category: 'achievement' },
  { id: 'business', label: 'Start a small business', category: 'achievement' },
  { id: 'relocate', label: 'Move somewhere I love', category: 'freedom' },
  { id: 'home', label: 'Create a comfortable home', category: 'lifestyle' },
  { id: 'legacy', label: 'Leave a family legacy', category: 'family' },
] as const;

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
                ? 'The equation does not have one unique numeric solution.'
                : 'That value does not satisfy both sides. Substitute it into the original equation and compare the two sides.',
            };
      }
      case 'numeric': {
        if (!context.profile) {
          return { correct: false, reason: 'Missing finance profile for verification.' };
        }
        const r = verifyCompoundGuess(context.profile, Number(attempt.value));
        return r.correct
          ? { correct: true, reason: 'Within tolerance of the projected balance.' }
          : { correct: false, reason: 'That estimate is outside the 1% range. Check whether you compounded after each contribution.' };
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

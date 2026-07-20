/**
 * Prism Core — linear vs exponential growth lesson (K-12, school oriented).
 * Deterministic, no dependencies. Educational only.
 */

import type { GrowthParams, GrowthComparison, GrowthPoint } from 'prism-shared';

/** Project both a linear path (start + increment*year) and an exponential
 *  path (start * multiplier^year) across `years` steps. */
export function compareGrowth(params: GrowthParams, guess?: 'linear' | 'exponential'): GrowthComparison {
  const { start, linearIncrement, exponentialMultiplier, years } = params;
  const points: GrowthPoint[] = [];
  let crossoverYear: number | null = null;
  let lin = start;
  let exp = start;
  for (let year = 0; year <= years; year++) {
    if (year > 0) {
      lin = lin + linearIncrement;
      exp = exp * exponentialMultiplier;
    }
    points.push({ year, linear: round2(lin), exponential: round2(exp) });
    if (
      crossoverYear === null &&
      year > 0 &&
      exp > lin
    ) {
      crossoverYear = year;
    }
  }
  const last = points[points.length - 1];
  const actual: 'linear' | 'exponential' = last.exponential >= last.linear ? 'exponential' : 'linear';
  return {
    points,
    crossoverYear,
    prediction: guess
      ? { guess, actual, correct: guess === actual }
      : { guess: actual, actual, correct: true },
  };
}

/** Verify a learner's prediction guess against the computed result. */
export function verifyGrowthPrediction(
  params: GrowthParams,
  guess: 'linear' | 'exponential',
): { correct: boolean; actual: 'linear' | 'exponential' } {
  const r = compareGrowth(params);
  return { correct: r.prediction.actual === guess, actual: r.prediction.actual };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

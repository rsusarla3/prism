/**
 * Prism Future — investing projection (adult oriented). Deterministic,
 * educational only. All V1 finance is manual simulation (spec §2.3).
 */

import type { InvestmentProfile, InvestmentProjection } from 'prism-shared';

/** Project a monthly-contribution portfolio with annual compounding, net of fees. */
export function projectInvestment(profile: InvestmentProfile): InvestmentProjection {
  const monthly = profile.monthlyContribution;
  const years = profile.years;
  const netMonthlyRate = (profile.assumedReturnPct / 100 - profile.feePct / 100) / 12;
  const grossMonthlyRate = profile.assumedReturnPct / 100 / 12;

  let balance = profile.startingBalance;
  let grossBalance = profile.startingBalance;
  for (let m = 0; m < years * 12; m++) {
    balance = balance * (1 + netMonthlyRate) + monthly;
    grossBalance = grossBalance * (1 + grossMonthlyRate) + monthly;
  }
  const contributed = profile.startingBalance + monthly * years * 12;
  return {
    balance: round2(balance),
    contributed: round2(contributed),
    growth: round2(balance - contributed),
    feeDrag: round2(grossBalance - balance),
  };
}

/** Verify a learner's balance guess within 1% tolerance. */
export function verifyInvestmentGuess(
  profile: InvestmentProfile,
  learnerGuess: number,
): { correct: boolean; expected: number } {
  const expected = projectInvestment(profile).balance;
  const tol = Math.max(1, Math.abs(expected) * 0.01);
  return { correct: Math.abs(expected - learnerGuess) <= tol, expected: round2(expected) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

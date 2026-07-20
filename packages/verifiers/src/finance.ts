/**
 * Deterministic personal-finance verification. Educational only.
 * spec §2.3 — all V1 finance outputs are educational simulations.
 */

import type { FinancialProfile } from 'prism-shared';

/** Future value of a series with annual compounding, net of fees. */
export function compoundGrowth(profile: FinancialProfile): {
  balance: number;
  contributed: number;
  growth: number;
  feeDrag: number;
} {
  const netReturn = profile.annualReturnPct / 100 - profile.feePct / 100;
  let balance = profile.initialPrincipal;
  for (let year = 0; year < profile.years; year++) {
    balance = balance * (1 + netReturn) + profile.annualContribution;
  }
  const contributed = profile.initialPrincipal + profile.annualContribution * profile.years;
  const growth = balance - contributed;
  // Fee drag vs. a zero-fee scenario, for the "fees matter" teaching point.
  let noFee = profile.initialPrincipal;
  const grossReturn = profile.annualReturnPct / 100;
  for (let year = 0; year < profile.years; year++) {
    noFee = noFee * (1 + grossReturn) + profile.annualContribution;
  }
  return {
    balance: round2(balance),
    contributed: round2(contributed),
    growth: round2(growth),
    feeDrag: round2(noFee - balance),
  };
}

/** Verify a learner's projected-balance guess within 1% tolerance. */
export function verifyCompoundGuess(
  profile: FinancialProfile,
  learnerGuess: number,
): { correct: boolean; expected: number } {
  const expected = compoundGrowth(profile).balance;
  const tol = Math.max(1, Math.abs(expected) * 0.01);
  return { correct: Math.abs(expected - learnerGuess) <= tol, expected: round2(expected) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export { round2 };

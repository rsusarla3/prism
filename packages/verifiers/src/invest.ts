/**
 * Prism Future — investing projection (adult oriented). Deterministic,
 * educational only. All V1 finance is manual simulation (spec §2.3).
 */

import type { InvestmentProfile, InvestmentProjection } from 'prism-shared';

/** Project a monthly-contribution portfolio with annual compounding, net of fees. */
export function projectInvestment(profile: InvestmentProfile): InvestmentProjection {
  validateProfile(profile);
  const monthly = profile.monthlyContribution;
  const years = profile.years;
  const netMonthlyRate = (profile.assumedReturnPct / 100 - profile.feePct / 100) / 12;
  const grossMonthlyRate = profile.assumedReturnPct / 100 / 12;

  let balance = profile.startingBalance;
  let grossBalance = profile.startingBalance;
  let contributed = profile.startingBalance;
  const inflationRate = (profile.inflationPct ?? 2.5) / 100;
  const series = [{ year: 0, balance: round2(balance), contributed: round2(contributed), inflationAdjusted: round2(balance) }];
  for (let m = 0; m < years * 12; m++) {
    balance = balance * (1 + netMonthlyRate) + monthly;
    grossBalance = grossBalance * (1 + grossMonthlyRate) + monthly;
    contributed += monthly;
    if ((m + 1) % 12 === 0) {
      const year = (m + 1) / 12;
      series.push({
        year,
        balance: round2(balance),
        contributed: round2(contributed),
        inflationAdjusted: round2(balance / Math.pow(1 + inflationRate, year)),
      });
    }
  }
  const inflationAdjustedBalance = balance / Math.pow(1 + inflationRate, years);
  return {
    balance: round2(balance),
    contributed: round2(contributed),
    growth: round2(balance - contributed),
    feeDrag: round2(grossBalance - balance),
    inflationAdjustedBalance: round2(inflationAdjustedBalance),
    estimatedMonthlyIncome: round2(inflationAdjustedBalance * 0.04 / 12),
    series,
  };
}

export function compareInvestmentScenarios(profile: InvestmentProfile) {
  return {
    baseline: projectInvestment(profile),
    startLater: projectInvestment({ ...profile, years: Math.max(1, profile.years - 5) }),
    higherFee: projectInvestment({ ...profile, feePct: profile.feePct + 1 }),
  };
}

function validateProfile(profile: InvestmentProfile): void {
  const values = [profile.startingBalance, profile.monthlyContribution, profile.years, profile.assumedReturnPct, profile.feePct, profile.inflationPct ?? 2.5];
  if (values.some((value) => !Number.isFinite(value))) throw new Error('All projection inputs must be finite numbers.');
  if (profile.startingBalance < 0 || profile.monthlyContribution < 0) throw new Error('Balances and contributions cannot be negative.');
  if (profile.years < 1 || profile.years > 80) throw new Error('Years must be between 1 and 80.');
  if (profile.assumedReturnPct < -50 || profile.assumedReturnPct > 30) throw new Error('Return assumption must be between -50% and 30%.');
  if (profile.feePct < 0 || profile.feePct > 10) throw new Error('Fee must be between 0% and 10%.');
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

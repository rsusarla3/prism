import { describe, it, expect } from 'vitest';
import { compareGrowth, verifyGrowthPrediction } from './growth.js';
import { projectInvestment, verifyInvestmentGuess } from './invest.js';
import { ASSET_CLASSES, SUGGESTED_KEYWORDS } from './index.js';

describe('Prism Core — linear vs exponential growth', () => {
  it('projects linear and exponential paths year by year', () => {
    const r = compareGrowth({ start: 100, linearIncrement: 50, exponentialMultiplier: 1.1, years: 3 });
    expect(r.points[0]).toEqual({ year: 0, linear: 100, exponential: 100 });
    // linear: 100,150,200,250 ; exp: 100,110,121,133.1
    expect(r.points[3].linear).toBe(250);
    expect(r.points[3].exponential).toBe(133.1);
  });

  it('flags crossover when exponential overtakes linear', () => {
    const r = compareGrowth({ start: 10, linearIncrement: 10, exponentialMultiplier: 2, years: 5 });
    // lin:10,20,30,40,50,60  exp:10,20,40,80,160,320 -> crossover at year 2
    expect(r.crossoverYear).toBe(2);
  });

  it('reports the larger path at the final year and scores a guess', () => {
    const r = compareGrowth({ start: 10, linearIncrement: 10, exponentialMultiplier: 2, years: 5 }, 'exponential');
    expect(r.prediction.actual).toBe('exponential');
    expect(r.prediction.correct).toBe(true);
    const wrong = verifyGrowthPrediction(
      { start: 10, linearIncrement: 10, exponentialMultiplier: 2, years: 5 },
      'linear',
    );
    expect(wrong.correct).toBe(false);
  });
});

describe('Prism Future — investment projection', () => {
  it('projects balance, contributions, growth, and fee drag', () => {
    const r = projectInvestment({
      startingBalance: 1000,
      monthlyContribution: 100,
      years: 10,
      assumedReturnPct: 7,
      feePct: 0.5,
    });
    expect(r.contributed).toBe(1000 + 100 * 120);
    expect(r.balance).toBeGreaterThan(r.contributed); // growth positive
    expect(r.feeDrag).toBeGreaterThan(0); // fees cost something
    expect(r.growth).toBeCloseTo(r.balance - r.contributed, 1);
  });

  it('higher fee yields lower balance (fee drag is real)', () => {
    const low = projectInvestment({ startingBalance: 0, monthlyContribution: 100, years: 20, assumedReturnPct: 7, feePct: 0.05 });
    const high = projectInvestment({ startingBalance: 0, monthlyContribution: 100, years: 20, assumedReturnPct: 7, feePct: 1.5 });
    expect(low.balance).toBeGreaterThan(high.balance);
  });

  it('scores a learner balance guess within tolerance', () => {
    const p = { startingBalance: 1000, monthlyContribution: 100, years: 10, assumedReturnPct: 7, feePct: 0.5 };
    const exp = projectInvestment(p).balance;
    expect(verifyInvestmentGuess(p, exp).correct).toBe(true);
    expect(verifyInvestmentGuess(p, 1).correct).toBe(false);
  });
});

describe('Prism Future — asset class content', () => {
  it('describes etf, stock, and bond', () => {
    const ids = ASSET_CLASSES.map((a) => a.id).sort();
    expect(ids).toEqual(['bond', 'etf', 'stock']);
    expect(ASSET_CLASSES.every((a) => a.description.length > 20)).toBe(true);
  });
  it('offers suggested onboarding keywords', () => {
    expect(SUGGESTED_KEYWORDS.length).toBeGreaterThanOrEqual(3);
  });
});

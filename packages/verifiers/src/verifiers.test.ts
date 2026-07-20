import { describe, it, expect } from 'vitest';
import { parseLinear, solveLinear, verifyLinearSolution } from './linear.js';
import { compoundGrowth, verifyCompoundGuess, round2 } from './finance.js';

describe('linear verifier', () => {
  it('parses simple coefficients', () => {
    expect(parseLinear('2x+3')).toEqual({ a: 2, b: 3 });
    expect(parseLinear('x')).toEqual({ a: 1, b: 0 });
    expect(parseLinear('-x+4')).toEqual({ a: -1, b: 4 });
    expect(parseLinear('x-2')).toEqual({ a: 1, b: -2 });
    expect(parseLinear('3*x - 2')).toEqual({ a: 3, b: -2 });
  });

  it('solves ax+b = cx+d', () => {
    expect(solveLinear('2x+3', 'x+5')).toBeCloseTo(2);
    expect(solveLinear('5x-1', '2x+8')).toBeCloseTo(3);
    expect(solveLinear('x', '-x+4')).toBeCloseTo(2);
  });

  it('accepts learner answer with or without x=', () => {
    const r1 = verifyLinearSolution('2x+3', 'x+5', '2');
    const r2 = verifyLinearSolution('2x+3', 'x+5', 'x=2');
    expect(r1.correct).toBe(true);
    expect(r2.correct).toBe(true);
  });

  it('rejects wrong answers', () => {
    expect(verifyLinearSolution('2x+3', 'x+5', '3').correct).toBe(false);
  });

  it('handles contradiction/identity as no-unique-solution', () => {
    expect(solveLinear('x', 'x+1')).toBeNull();
    expect(solveLinear('2x', '2x')).toBeNull();
  });
});

describe('finance verifier', () => {
  const profile = {
    initialPrincipal: 1000,
    annualContribution: 100,
    annualReturnPct: 7,
    years: 10,
    feePct: 0.5,
  };

  it('compounds with fee drag', () => {
    const r = compoundGrowth(profile);
    // manually: 1000 then 10 years of 6.5% net + 100/yr contributions
    expect(r.balance).toBeGreaterThan(r.contributed);
    expect(r.feeDrag).toBeGreaterThan(0);
    expect(r.growth).toBeCloseTo(r.balance - r.contributed);
  });

  it('accepts projected guess within tolerance', () => {
    const expected = compoundGrowth(profile).balance;
    const r = verifyCompoundGuess(profile, expected);
    expect(r.correct).toBe(true);
  });

  it('rejects wildly off guess', () => {
    const r = verifyCompoundGuess(profile, 999999);
    expect(r.correct).toBe(false);
  });

  it('rounds to 2 decimals', () => {
    expect(round2(1.23456)).toBe(1.23);
  });
});

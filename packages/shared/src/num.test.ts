import { describe, it, expect } from 'vitest';
import { parseFinite, parseFiniteAll } from './num.js';

describe('parseFinite (shared input sanitization)', () => {
  it('accepts valid numbers and numeric strings', () => {
    expect(parseFinite(5)).toBe(5);
    expect(parseFinite('3.5')).toBe(3.5);
    expect(parseFinite(0)).toBe(0);
    expect(parseFinite(-2)).toBe(-2);
  });
  it('rejects empty / missing / NaN / Infinity', () => {
    expect(parseFinite('')).toBeNull();
    expect(parseFinite(null)).toBeNull();
    expect(parseFinite(undefined)).toBeNull();
    expect(parseFinite('abc')).toBeNull();
    expect(parseFinite(Number.NaN)).toBeNull();
    expect(parseFinite(Infinity)).toBeNull();
  });
  it('parseFiniteAll returns null if ANY field is invalid', () => {
    expect(parseFiniteAll([1, 2, '3'])).toEqual([1, 2, 3]);
    expect(parseFiniteAll([1, '', 3])).toBeNull();
    expect(parseFiniteAll([1, Number.NaN])).toBeNull();
  });
});

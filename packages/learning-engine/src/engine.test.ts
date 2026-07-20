import { describe, it, expect } from 'vitest';
import { buildHintLadder, nextHint } from './hints.js';
import { recommendMode } from './modes.js';
import { createSession, recordAttempt, isMeaningfulAttempt, mayRevealAnswer, updateMastery } from './session.js';
import type { Attempt } from 'prism-shared';
import { LINEAR_EQUATION } from 'prism-curriculum';

describe('hint ladder', () => {
  const ladder = buildHintLadder(LINEAR_EQUATION);
  it('is ordered least->most revealing, no final answer leaked', () => {
    expect(ladder.length).toBeGreaterThan(0);
    expect(ladder[ladder.length - 1].revealsMost).toBe(true);
    expect(ladder.some((h) => /x\s*=\s*2/.test(h.text))).toBe(false);
  });
  it('escalates with attempts but never exceeds ladder', () => {
    expect(nextHint(ladder, 0)?.level).toBe(1);
    expect(nextHint(ladder, 5)?.level).toBe(ladder[ladder.length - 1].level);
  });
});

describe('mode recommendation', () => {
  it('does not recommend before 2 attempts', () => {
    expect(recommendMode('school', 'linear-equation', [])).toBeUndefined();
  });
  it('recommends visual-lab after repeated struggle', () => {
    const tries: Attempt[] = [
      { kind: 'equation-step', value: 'x=5', timestamp: 1 },
      { kind: 'equation-step', value: 'x=4', timestamp: 2 },
    ];
    const rec = recommendMode('school', 'linear-equation', tries);
    expect(rec?.proposedMethod).toBe('visual-lab');
    expect(rec?.controls).toEqual(['switch', 'stay']);
  });
});

describe('session gating (answer locked until attempt)', () => {
  it('keeps answer locked until a meaningful attempt', () => {
    const s = createSession('s1');
    expect(mayRevealAnswer(s)).toBe(false);
    recordAttempt(s, { kind: 'explanation', value: '', timestamp: 1 }); // empty -> not meaningful
    expect(mayRevealAnswer(s)).toBe(false);
    recordAttempt(s, { kind: 'equation-step', value: 'x=2', timestamp: 2 });
    expect(isMeaningfulAttempt({ kind: 'equation-step', value: 'x=2', timestamp: 0 })).toBe(true);
    expect(mayRevealAnswer(s)).toBe(true);
  });

  it('mastery rises on similar-problem success, not solution viewing', () => {
    const s = createSession('s2');
    updateMastery(s, true);
    expect(s.mastery).toBeGreaterThan(0.5);
    updateMastery(s, false);
    expect(s.mastery).toBeLessThan(1);
  });
});

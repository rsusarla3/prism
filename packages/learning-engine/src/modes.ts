/**
 * Mode recommendation engine — spec §2.5. Offers a switch only on observed
 * struggle; every recommendation carries observed reason, proposed method,
 * expected benefit, and explicit Switch/Stay controls (client renders them).
 * The user stays in control (spec: "The user remains in control").
 */

import type { ModeRecommendation, Attempt } from 'prism-shared';

/**
 * Decide whether to recommend a mode switch. Triggered after repeated struggle
 * (>= 2 incorrect attempts for a symbolic concept) — never auto-switches.
 */
export function recommendMode(
  surface: 'school' | 'life',
  conceptId: string | null,
  attempts: Attempt[],
): ModeRecommendation | undefined {
  const incorrect = attempts.filter((a) => a.kind !== 'similar-exercise').length;
  // Only recommend after genuine repeated struggle.
  if (incorrect < 2) return undefined;

  if (surface === 'school' && conceptId === 'linear-equation') {
    return {
      observedReason: 'You have tried the symbolic steps twice without resolving the equation.',
      proposedMethod: 'visual-lab',
      expectedBenefit:
        'A balance model makes the equality rule easier to see — what you do to one side, you do to the other.',
      controls: ['switch', 'stay'],
    };
  }
  if (surface === 'life') {
    return {
      observedReason: 'The numbers alone are not landing.',
      proposedMethod: 'simulate',
      expectedBenefit: 'Adjust the inputs and watch the curve move — fees and time become visible.',
      controls: ['switch', 'stay'],
    };
  }
  return undefined;
}

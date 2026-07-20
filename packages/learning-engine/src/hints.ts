/**
 * Hint ladder — least revealing hint first, escalating only as needed.
 * spec §8.3: "Prism gives the least revealing useful hint... strength
 * increases only as needed." The final answer is NEVER in the ladder.
 */

import type { Hint, CurriculumConcept } from 'prism-shared';

export function buildHintLadder(concept: CurriculumConcept): Hint[] {
  if (concept.id === 'linear-equation') {
    return [
      { level: 1, text: 'What operation would get all the x terms on one side?' },
      { level: 2, text: 'Subtract x from both sides, then simplify each side.' },
      { level: 3, text: 'After collecting x: x + 3 = 5. What cancels the +3?', revealsMost: true },
    ];
  }
  if (concept.id === 'compound-interest') {
    return [
      { level: 1, text: 'What is net return after subtracting the fee?' },
      { level: 2, text: 'Apply (1 + netReturn) to the balance, then add the yearly contribution.' },
      { level: 3, text: 'Repeat for all 10 years; fees subtract a little each year.', revealsMost: true },
    ];
  }
  return [{ level: 1, text: 'Restate the core idea in your own words.' }];
}

/** Returns the next hint, or undefined when the ladder is exhausted. */
export function nextHint(ladder: Hint[], attemptsSoFar: number): Hint | undefined {
  return ladder[Math.min(attemptsSoFar, ladder.length - 1)];
}

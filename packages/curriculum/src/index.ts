/**
 * Approved curriculum objects for the V1 demo. Curriculum authority stays
 * outside the model (spec §6.10). The LLM may generate variations WITHIN
 * these constraints but cannot redefine objectives, formulas, or answers.
 */

import type { CurriculumConcept } from 'prism-shared';

export const LINEAR_EQUATION: CurriculumConcept = {
  id: 'linear-equation',
  surface: 'school',
  domain: 'algebra',
  title: 'Solving Linear Equations',
  objectives: [
    'Isolate the variable using inverse operations',
    'Collect like terms on each side',
    'Check the solution by substitution',
  ],
  misconceptions: [
    'Adding to one side but not the other',
    'Dropping the sign when moving a term',
    'Dividing only part of a side by the coefficient',
  ],
  workedExample: [
    { explanation: 'Write the equation.', expression: '2x + 3 = x + 5' },
    { explanation: 'Subtract x from both sides to collect x terms.', expression: 'x + 3 = 5' },
    { explanation: 'Subtract 3 from both sides.', expression: 'x = 2' },
    { explanation: 'Check: 2(2)+3 = 7 and 2+5 = 7. Correct.', expression: '7 = 7' },
  ],
  similarProblem: { prompt: 'Solve: 5x - 1 = 2x + 8', answer: '3' },
  verifier: 'linear-equation',
};

export const COMPOUND_INTEREST: CurriculumConcept = {
  id: 'compound-interest',
  surface: 'life',
  domain: 'finance',
  title: 'Compound Growth & the Cost of Fees',
  objectives: [
    'Explain how compounding accelerates growth',
    'Describe how fees reduce long-run balance',
    'State why time horizon matters',
  ],
  misconceptions: [
    'Thinking fees are negligible because they look small',
    'Ignoring the effect of contribution timing',
    'Assuming linear growth',
  ],
  workedExample: [
    { explanation: 'Start with principal P and contribute C each year.' },
    { explanation: 'Each year the balance grows by the net return and gains the contribution.' },
    { explanation: 'Over many years, compounding dominates; fees compound too.' },
  ],
  similarProblem: {
    prompt: 'With $1000 start, $100/yr, 7% return, 0.5% fee, 10 years — what is the balance?',
    answer: '2431.37',
  },
  verifier: 'numeric',
};

export const ETF_BASICS: CurriculumConcept = {
  id: 'etf-basics',
  surface: 'life',
  domain: 'finance',
  title: 'ETF Basics: Diversification, Fees, Horizon',
  objectives: [
    'Explain what an ETF is and why diversification reduces idiosyncratic risk',
    'Compare expense ratios and their long-run impact',
    'Connect a longer horizon to lower sequence-of-returns risk',
  ],
  misconceptions: [
    'Assuming a single stock is as safe as a diversified fund',
    'Equating a low price per share with cheapness',
    'Believing higher fees buy better returns',
  ],
  workedExample: [{ explanation: 'An ETF holds many securities; one holding failing barely moves the fund.' }],
  similarProblem: {
    prompt: 'Why does a broadly diversified ETF reduce risk versus one stock?',
    answer: 'diversification reduces idiosyncratic risk',
  },
  verifier: 'expression',
};

export const CURRICULUM: Record<string, CurriculumConcept> = {
  'linear-equation': LINEAR_EQUATION,
  'compound-interest': COMPOUND_INTEREST,
  'etf-basics': ETF_BASICS,
};

/** Classify a raw selection/topic into a concept id, or null if not recognized. */
export function classifyConcept(
  text: string,
): { conceptId: string | null; isHomework: boolean } {
  const t = text.toLowerCase();
  const isHomework = /solve|equation|find x|=|homework|problem|quiz|due/i.test(t);
  if (/(linear equation|x\s*=|2x|3x|solve for x|ax\+b)/.test(t)) {
    return { conceptId: 'linear-equation', isHomework };
  }
  if (/(compound interest|compound growth|etf|invest|portfolio|fee|diversif)/.test(t)) {
    if (/etf|diversif|portfolio/.test(t)) return { conceptId: 'etf-basics', isHomework: false };
    return { conceptId: 'compound-interest', isHomework: false };
  }
  return { conceptId: null, isHomework };
}

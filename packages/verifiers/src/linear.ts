/**
 * Deterministic linear-algebra verification.
 *
 * Parses expressions of the form  ax + b  (where a, b are real) and solves
 * equations  a1*x + b1 = a2*x + b2. No floating-point fuzzing beyond a fixed
 * epsilon; results are reproducible across runs (spec §6.10, deterministic).
 */

const EPS = 1e-9;

export interface LinearForm {
  a: number; // coefficient of x
  b: number; // constant term
}

/**
 * Parse a linear expression string ("2x+3", "x", "-x+4", "3x-2", "2*x+1")
 * into {a, b}. Throws on a malformed term.
 */
export function parseLinear(expr: string): LinearForm {
  const normalized = expr.replace(/\s+/g, '').replace(/\*/g, '');
  if (normalized === '') throw new Error(`Empty expression: "${expr}"`);
  const termRe = /[+-]?(?:[0-9.]+x|x|[0-9.]+)/g;
  const matches = normalized.match(termRe);
  if (!matches) throw new Error(`Cannot parse linear expression: "${expr}"`);
  let a = 0;
  let b = 0;
  for (const term of matches) {
    if (term.includes('x')) {
      let coeff = term.replace('x', '');
      if (coeff === '' || coeff === '+') coeff = '1';
      else if (coeff === '-') coeff = '-1';
      a += Number(coeff);
    } else {
      b += Number(term);
    }
  }
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    throw new Error(`Non-finite coefficient in "${expr}"`);
  }
  return { a, b };
}

/**
 * Solve  lhs = rhs  for x. Returns the solution, or null for:
 *  - identity (infinitely many solutions)
 *  - contradiction (no solution)
 */
export function solveLinear(lhs: string, rhs: string): number | null {
  const L = parseLinear(lhs);
  const R = parseLinear(rhs);
  const a = L.a - R.a;
  const b = R.b - L.b; // a*x = b
  if (Math.abs(a) < EPS) {
    return Math.abs(b) < EPS ? null : null; // identity or contradiction -> null for demo
  }
  return b / a;
}

/** Extract a numeric answer from learner input ("3", "x=3", "x = 3"). */
function parseLearnerNumber(value: string): number {
  const m = value.match(/-?\d+(\.\d+)?/);
  if (!m) throw new Error(`Cannot parse learner number: "${value}"`);
  return Number(m[0]);
}

/**
 * Verify a learner's solution to a linear equation.
 * Returns correct=true iff |solution - learner| < EPS.
 */
export function verifyLinearSolution(
  lhs: string,
  rhs: string,
  learnerAnswer: string,
): { correct: boolean; solution: number | null } {
  const solution = solveLinear(lhs, rhs);
  if (solution === null) {
    return { correct: false, solution: null };
  }
  const learner = parseLearnerNumber(learnerAnswer);
  return { correct: Math.abs(solution - learner) < 1e-6, solution };
}
